import {
	createPinchDetector,
	type HandPose,
	type PinchEvent,
	type Point,
} from "@handfinity/core";
import { startCamera, stopCamera } from "./camera";
import { createHandTracker } from "./hand-tracker";

export type PinchSession = {
	stop(): void;
};

export type PinchCallbacks = {
	onGesture(event: PinchEvent): void;
	onPointer?(point: Point | null, timestamp: number): void;
	onError?(error: unknown): void;
};

const LOST_HAND_GRACE_MS = 120;

function distance(a: Point, b: Point, aspectRatio: number) {
	return Math.hypot((a.x - b.x) * aspectRatio, a.y - b.y);
}

export async function startPinchSession(
	video: HTMLVideoElement,
	callbacks: PinchCallbacks,
): Promise<PinchSession> {
	const stream = await startCamera(video);

	let tracker: Awaited<ReturnType<typeof createHandTracker>>;
	try {
		tracker = await createHandTracker();
	} catch (error) {
		stopCamera(stream);
		video.srcObject = null;
		throw error;
	}

	const detector = createPinchDetector();
	let stopped = false;
	let frameId = 0;
	let lastVideoTime = -1;
	let lastPose: HandPose | null = null;
	let lastSeenAt: number | null = null;
	let missing = false;

	function endTracking(timestamp: number) {
		const event = detector.update(null, 1, timestamp);
		lastPose = null;
		lastSeenAt = null;
		missing = false;
		callbacks.onPointer?.(null, timestamp);
		if (event) callbacks.onGesture(event);
	}

	function stop() {
		if (stopped) return;
		stopped = true;

		cancelAnimationFrame(frameId);
		detector.reset();
		tracker.close();
		stopCamera(stream);

		if (video.srcObject === stream) {
			video.srcObject = null;
		}

		callbacks.onPointer?.(null, performance.now());
	}

	function tick() {
		if (stopped) return;

		try {
			const timestamp = performance.now();
			// Expirer aussi quand la vidéo ne fournit plus de nouvelle image.
			if (lastSeenAt !== null && timestamp - lastSeenAt > LOST_HAND_GRACE_MS) {
				endTracking(timestamp);
			}

			if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
				lastVideoTime = video.currentTime;
				const hands = tracker.detect(video, timestamp);
				const aspectRatio = video.videoWidth / video.videoHeight;

				// V1 : ne pas mélanger les identités de deux mains.
				const hand = hands.length === 1 ? hands[0] : undefined;
				const pose: HandPose | null =
					hand?.[0] && hand[4] && hand[8] && hand[9]
						? {
								wrist: hand[0],
								thumbTip: hand[4],
								indexTip: hand[8],
								middleBase: hand[9],
							}
						: null;

				if (pose) {
					// Une reprise éloignée peut être une autre main : ne pas relier
					// les positions. La tolérance est relative à la taille de la paume.
					if (missing && lastPose) {
						const maxDistance =
							distance(lastPose.wrist, lastPose.middleBase, aspectRatio) / 2;
						if (
							distance(lastPose.indexTip, pose.indexTip, aspectRatio) >
								maxDistance ||
							distance(lastPose.wrist, pose.wrist, aspectRatio) > maxDistance
						) {
							endTracking(timestamp);
						}
					}
					missing = false;
					lastPose = pose;
					lastSeenAt = timestamp;
					callbacks.onPointer?.(pose.indexTip, timestamp);

					const event = detector.update(pose, aspectRatio, timestamp);
					if (event) callbacks.onGesture(event);
				} else if (hands.length > 1) {
					// Une ambiguïté entre deux mains interrompt immédiatement le geste.
					endTracking(timestamp);
				} else {
					missing = true;
					detector.suspend();
					callbacks.onPointer?.(null, timestamp);
				}
			}
		} catch (error) {
			stop();
			callbacks.onError?.(error);
			return;
		}

		if (!stopped) {
			frameId = requestAnimationFrame(tick);
		}
	}

	frameId = requestAnimationFrame(tick);
	return { stop };
}
