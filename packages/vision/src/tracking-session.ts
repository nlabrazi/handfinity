import {
	createHandIdentityTracker,
	type HandObservation,
	type HandTrackingFrame,
} from "@handfinity/core";
import { startCamera, stopCamera } from "./camera";
import { createHandTracker, type HandTracker } from "./hand-tracker";

export type TrackingSessionFrame = {
	/** Vide si hasNewFrame vaut false ; aucun résultat vidéo n'est rejoué. */
	readonly observations: readonly HandObservation[];
	readonly tracking: HandTrackingFrame;
	readonly aspectRatio: number;
	readonly hasNewFrame: boolean;
};

export type TrackingCallbacks = {
	onFrame(frame: TrackingSessionFrame): void;
	/** Erreur pendant la boucle ; les erreurs de démarrage rejettent start(). */
	onError?(error: unknown): void;
	/** Appelé une fois par arrêt, après libération des ressources disponibles. */
	onStop?(): void;
};

export type TrackingSession = {
	/** Remplace un éventuel démarrage ou suivi en cours. */
	start(video: HTMLVideoElement): Promise<void>;
	/** Disponible immédiatement, y compris pendant start(). */
	stop(): void;
};

export type TrackingSessionOptions = {
	/** Le bureau utilise un timer avec le throttling Electron désactivé. */
	scheduling?: "animation-frame" | "timer";
};

type SessionRun = {
	video: HTMLVideoElement;
	abort: AbortController;
	stream: MediaStream | null;
	tracker: HandTracker | null;
	frameId: number;
};

/** Une instance par propriétaire : aucune caméra globale ou persistante. */
export function createTrackingSession(
	callbacks: TrackingCallbacks,
	options: TrackingSessionOptions = {},
): TrackingSession {
	const identities = createHandIdentityTracker();
	let current: SessionRun | null = null;
	const useTimer = options.scheduling === "timer";

	function schedule(tick: () => void) {
		// Une fenêtre réduite peut recevoir très peu de frames d'animation.
		return useTimer
			? window.setTimeout(tick, 1000 / 30)
			: requestAnimationFrame(tick);
	}

	function stop() {
		const run = current;
		if (!run) return;
		current = null;
		run.abort.abort();
		if (useTimer) window.clearTimeout(run.frameId);
		else cancelAnimationFrame(run.frameId);
		identities.reset();
		try {
			run.tracker?.close();
		} finally {
			try {
				if (run.stream) stopCamera(run.stream);
			} finally {
				if (run.stream && run.video.srcObject === run.stream) {
					run.video.srcObject = null;
				}
				callbacks.onStop?.();
			}
		}
	}

	async function start(video: HTMLVideoElement) {
		stop();
		const run: SessionRun = {
			video,
			abort: new AbortController(),
			stream: null,
			tracker: null,
			frameId: 0,
		};
		current = run;
		try {
			const stream = await startCamera(video, run.abort.signal);
			if (current !== run) {
				stopCamera(stream);
				if (video.srcObject === stream) video.srcObject = null;
				throw run.abort.signal.reason;
			}
			run.stream = stream;
			const tracker = await createHandTracker();
			if (current !== run) {
				tracker.close();
				throw run.abort.signal.reason;
			}
			run.tracker = tracker;
			let lastVideoTime = -1;
			let aspectRatio = 1;

			function tick() {
				if (current !== run) return;
				try {
					const timestamp = performance.now();
					const hasNewFrame =
						video.readyState >= 2 && video.currentTime !== lastVideoTime;
					let observations: HandObservation[] = [];
					if (hasNewFrame) {
						lastVideoTime = video.currentTime;
						aspectRatio = video.videoWidth / video.videoHeight;
						observations = tracker.detect(video, timestamp);
					}
					const tracking = hasNewFrame
						? identities.update(observations, timestamp, aspectRatio)
						: identities.advance(timestamp);
					callbacks.onFrame({
						observations,
						tracking,
						aspectRatio,
						hasNewFrame,
					});
				} catch (error) {
					if (current === run) {
						try {
							stop();
						} finally {
							callbacks.onError?.(error);
						}
					}
					return;
				}
				if (current === run) run.frameId = schedule(tick);
			}

			run.frameId = schedule(tick);
		} catch (error) {
			// Une ancienne initialisation ne peut pas arrêter sa remplaçante.
			if (current === run) stop();
			throw error;
		}
	}

	return { start, stop };
}
