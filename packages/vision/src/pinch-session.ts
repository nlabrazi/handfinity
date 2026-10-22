import {
	createHandIdentityTracker,
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
	const identities = createHandIdentityTracker();
	let stopped = false;
	let frameId = 0;
	let lastVideoTime = -1;
	let activeHandId: number | null = null;

	function endTracking(timestamp: number) {
		const event = detector.update(null, 1, timestamp);
		activeHandId = null;
		callbacks.onPointer?.(null, timestamp);
		if (event) callbacks.onGesture(event);
	}

	function stop() {
		if (stopped) return;
		stopped = true;

		cancelAnimationFrame(frameId);
		detector.reset();
		identities.reset();
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
			if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
				lastVideoTime = video.currentTime;
				const hands = tracker.detect(video, timestamp);
				const aspectRatio = video.videoWidth / video.videoHeight;
				const tracking = identities.update(hands, timestamp, aspectRatio);

				// Le dessin reste à une main, avec une identité explicite.
				const tracked =
					hands.length === 1 && !tracking.ambiguous
						? tracking.hands.find((item) => item.status === "tracked")
						: undefined;
				if (
					activeHandId !== null &&
					((tracked && tracked.id !== activeHandId) ||
						!tracking.hands.some((item) => item.id === activeHandId))
				) {
					endTracking(timestamp);
				}
				const hand = tracked?.observation.landmarks;
				const pose: HandPose | null =
					hand?.[0] && hand[4] && hand[8] && hand[9]
						? {
								wrist: hand[0],
								thumbTip: hand[4],
								indexTip: hand[8],
								middleBase: hand[9],
							}
						: null;

				if (pose && tracked) {
					activeHandId = tracked.id;
					callbacks.onPointer?.(pose.indexTip, timestamp);

					const event = detector.update(pose, aspectRatio, timestamp);
					if (event) callbacks.onGesture(event);
				} else if (hands.length > 1 || tracking.ambiguous) {
					endTracking(timestamp);
				} else {
					detector.suspend();
					callbacks.onPointer?.(null, timestamp);
				}
			} else {
				const tracking = identities.advance(timestamp);
				if (
					activeHandId !== null &&
					!tracking.hands.some((item) => item.id === activeHandId)
				) {
					endTracking(timestamp);
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
