import {
	createHandPoseTracker,
	type HandTrackingFrame,
	type TrackedHandPose,
} from "@handfinity/core";
import {
	createHandPointerTracker,
	type HandPointerFrame,
} from "./hand-pointers";

export type GestureEngineFrame = {
	readonly tracking: HandTrackingFrame;
	readonly poses: readonly TrackedHandPose[];
	readonly pointers: HandPointerFrame;
};

/** Interprétation commune ; les identités sont fournies par la session de suivi. */
export function createGestureEngine() {
	const poseTracker = createHandPoseTracker();
	const pointerTracker = createHandPointerTracker();

	function update(
		tracking: HandTrackingFrame,
		aspectRatio = 1,
	): GestureEngineFrame {
		const poses = poseTracker.update(tracking, aspectRatio);
		const pointers = pointerTracker.update(tracking, poses);
		return { tracking, poses, pointers };
	}

	function reset() {
		poseTracker.reset();
		pointerTracker.reset();
	}

	return { update, setPrimaryHand: pointerTracker.setPrimaryHand, reset };
}
