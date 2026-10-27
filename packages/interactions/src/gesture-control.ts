import type { HandTrackingFrame, TrackedHandPose } from "@handfinity/core";

export const CONTROL_HOLD_MS = 1500;

export type GestureControlFrame = {
	readonly paused: boolean;
	/** Progression du maintien confirmé, entre 0 et 1. */
	readonly holdProgress: number;
	readonly handId: number | null;
	/** Une autre posture doit être observée avant un nouveau basculement. */
	readonly requiresRelease: boolean;
};

/** Bascule volontaire ; les pertes de suivi ne modifient jamais la pause. */
export function createGestureControl() {
	let paused = false;
	let requiresRelease = false;
	let handId: number | null = null;
	let heldSince: number | null = null;
	let holdProgress = 0;
	let lastObservationTimestamp: number | null = null;

	function cancelHold() {
		handId = null;
		heldSince = null;
		holdProgress = 0;
	}

	function getState(): GestureControlFrame {
		return { paused, holdProgress, handId, requiresRelease };
	}

	function update(
		tracking: HandTrackingFrame,
		poses: readonly TrackedHandPose[],
		primaryHandId: number | null,
	): GestureControlFrame {
		const visible = tracking.hands.filter((hand) => hand.status === "tracked");
		const hand =
			!tracking.ambiguous && primaryHandId !== null
				? visible.find((item) => item.id === primaryHandId)
				: undefined;
		const pose = poses.find((item) => item.handId === hand?.id);
		if (!hand || !pose || pose.measurements === null) {
			cancelHold();
			return getState();
		}
		if (handId !== null && handId !== hand.id) cancelHold();
		if (
			hand.observation.timestamp !== tracking.timestamp ||
			tracking.timestamp === lastObservationTimestamp
		)
			return getState();
		lastObservationTimestamp = tracking.timestamp;
		if (requiresRelease) {
			cancelHold();
			const fingers = pose.measurements.fingers;
			const foldedHand = (["index", "middle", "ring", "pinky"] as const).every(
				(finger) => fingers[finger] === "folded",
			);
			if (
				pose.candidate !== "open-palm" &&
				!pose.pending &&
				(pose.pose === "pointing" || pose.pose === "pinch" || foldedHand)
			)
				requiresRelease = false;
			return getState();
		}
		if (pose.pose !== "open-palm" || pose.candidate !== "open-palm") {
			cancelHold();
			return getState();
		}
		handId = hand.id;
		heldSince ??= tracking.timestamp;
		holdProgress = Math.min(
			1,
			(tracking.timestamp - heldSince) / CONTROL_HOLD_MS,
		);
		if (holdProgress === 1) {
			paused = !paused;
			requiresRelease = true;
			cancelHold();
		}
		return getState();
	}

	function reset() {
		paused = false;
		requiresRelease = false;
		lastObservationTimestamp = null;
		cancelHold();
	}

	return { update, getState, cancelHold, reset };
}
