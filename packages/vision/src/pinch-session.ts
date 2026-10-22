import {
	createPinchDetector,
	type HandPose,
	type PinchEvent,
	type Point,
} from "@handfinity/core";
import {
	createTrackingSession,
	type TrackingSession,
} from "./tracking-session";

export type PinchSession = {
	stop(): void;
};

export type PinchCallbacks = {
	onGesture(event: PinchEvent): void;
	onPointer?(point: Point | null, timestamp: number): void;
	onError?(error: unknown): void;
};

/** Adaptateur de pincement à une main au-dessus de la session de suivi commune. */
export function createPinchSession(callbacks: PinchCallbacks): TrackingSession {
	const detector = createPinchDetector();
	let activeHandId: number | null = null;

	function endTracking(timestamp: number) {
		const event = detector.update(null, 1, timestamp);
		activeHandId = null;
		callbacks.onPointer?.(null, timestamp);
		if (event) callbacks.onGesture(event);
	}

	return createTrackingSession({
		onFrame({ observations: hands, tracking, aspectRatio, hasNewFrame }) {
			const timestamp = tracking.timestamp;
			if (!hasNewFrame) {
				if (
					activeHandId !== null &&
					!tracking.hands.some((item) => item.id === activeHandId)
				) {
					endTracking(timestamp);
				}
				return;
			}

			const tracked =
				hands.length === 1 && !tracking.ambiguous
					? tracking.hands.find((item) => item.status === "tracked")
					: undefined;
			if (
				activeHandId !== null &&
				((tracked && tracked.id !== activeHandId) ||
					!tracking.hands.some((item) => item.id === activeHandId))
			)
				endTracking(timestamp);

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
		},
		onStop() {
			detector.reset();
			activeHandId = null;
			callbacks.onPointer?.(null, performance.now());
		},
		onError: callbacks.onError,
	});
}

/** Raccourci pour les consommateurs qui attendent le démarrage complet. */
export async function startPinchSession(
	video: HTMLVideoElement,
	callbacks: PinchCallbacks,
): Promise<PinchSession> {
	const session = createPinchSession(callbacks);
	await session.start(video);
	return session;
}
