import {
	createHandIdentityTracker,
	type HandObservation,
	type HandTrackingFrame,
} from "@handfinity/engine";
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

	function schedule(tick: () => void, startedAt?: number) {
		// Une fenêtre réduite peut recevoir très peu de frames d'animation.
		if (!useTimer) return requestAnimationFrame(tick);
		// Le budget inclut la vision et les callbacks, sans rattraper les retards.
		const elapsed = startedAt === undefined ? 0 : performance.now() - startedAt;
		return window.setTimeout(tick, Math.max(0, 1000 / 30 - elapsed));
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
			let hasFrameCounter = false;
			let lastFrameToken: string | null = null;
			let aspectRatio = 1;

			function tick() {
				if (current !== run) return;
				const timestamp = performance.now();
				try {
					// currentTime peut avancer sans nouvelle image pour un flux en direct.
					const frameCount = video.getVideoPlaybackQuality?.().totalVideoFrames;
					// Firefox peut exposer un compteur toujours nul pour un MediaStream.
					// Après une première valeur positive, il reste la seule référence.
					if (frameCount !== undefined && frameCount > 0)
						hasFrameCounter = true;
					const frameToken = hasFrameCounter
						? `frames:${frameCount}`
						: `time:${video.currentTime}`;
					const hasNewFrame =
						video.readyState >= 2 &&
						!video.paused &&
						frameToken !== lastFrameToken;
					let observations: HandObservation[] = [];
					if (hasNewFrame) {
						lastFrameToken = frameToken;
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
				if (current === run) run.frameId = schedule(tick, timestamp);
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
