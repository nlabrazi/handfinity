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
	onPointer?(point: Point | null): void;
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

	let stopped = false;
	let frameId = 0;
	let lastVideoTime = -1;

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

		callbacks.onPointer?.(null);
	}

	function tick() {
		if (stopped) return;

		try {
			if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
				lastVideoTime = video.currentTime;

				const hands = tracker.detect(video, performance.now());

				// V1 : un seul geste et une seule main à la fois.
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

				const pointer: Point | null = pose
					? {
							x: (pose.thumbTip.x + pose.indexTip.x) / 2,
							y: (pose.thumbTip.y + pose.indexTip.y) / 2,
						}
					: null;

				callbacks.onPointer?.(pointer);

				const gesture = detector.update(
					pose,
					video.videoWidth / video.videoHeight,
				);

				if (gesture) {
					callbacks.onGesture(gesture);
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
