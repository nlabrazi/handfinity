import {
	createHandPoseTracker,
	type HandTrackingFrame,
	type TrackedHandPose,
} from "@handfinity/core";
import {
	createGestureControl,
	type GestureControlFrame,
} from "./gesture-control";
import {
	createHandPointerTracker,
	type HandPointerFrame,
} from "./hand-pointers";
import type { PointerMoveCommand } from "./pointer-commands";

export type GestureEngineFrame = {
	readonly tracking: HandTrackingFrame;
	readonly poses: readonly TrackedHandPose[];
	readonly pointers: HandPointerFrame;
	readonly control: GestureControlFrame;
	/** Résultat immédiat d'un choix explicite ; aucune ancienne image n'est rejouée. */
	readonly selectionChanged: boolean;
	/** Commandes de cet appel uniquement ; les observations ne sont pas rejouées. */
	readonly commands: readonly PointerMoveCommand[];
};

/** Interprétation commune ; les identités sont fournies par la session de suivi. */
export function createGestureEngine() {
	const poseTracker = createHandPoseTracker();
	const pointerTracker = createHandPointerTracker();
	const controlTracker = createGestureControl();
	let lastObservationTimestamp: number | null = null;
	let lastTracking: HandTrackingFrame | null = null;
	let lastAspectRatio = 1;

	function update(
		tracking: HandTrackingFrame,
		aspectRatio = 1,
	): GestureEngineFrame {
		const poses = poseTracker.update(tracking, aspectRatio);
		const pointers = pointerTracker.update(tracking, poses);
		const control = controlTracker.update(
			tracking,
			poses,
			pointers.selectionStatus === "tracked" ? pointers.primaryHandId : null,
		);
		const hasNewObservation = tracking.hands.some(
			(hand) =>
				hand.status === "tracked" &&
				hand.observation.timestamp === tracking.timestamp,
		);
		const fresh =
			hasNewObservation && lastObservationTimestamp !== tracking.timestamp;
		if (hasNewObservation) lastObservationTimestamp = tracking.timestamp;
		const main = pointers.pointers.find(
			(pointer) =>
				pointer.isPrimary &&
				pointer.active &&
				pointer.timestamp === tracking.timestamp,
		);
		const commands: readonly PointerMoveCommand[] =
			fresh && main && !control.paused
				? [
						{
							type: "pointer:move",
							handId: main.handId,
							timestamp: main.timestamp,
							position: { x: 1 - main.position.x, y: main.position.y },
						},
					]
				: [];
		lastTracking = tracking;
		lastAspectRatio = aspectRatio;
		return {
			tracking,
			poses,
			pointers,
			control,
			commands,
			selectionChanged: false,
		};
	}

	function reset() {
		poseTracker.reset();
		pointerTracker.reset();
		controlTracker.reset();
		lastObservationTimestamp = null;
		lastTracking = null;
		lastAspectRatio = 1;
	}

	function setPrimaryHand(handId: number | null) {
		const changed = pointerTracker.setPrimaryHand(handId);
		if (changed) controlTracker.cancelHold();
		if (lastTracking === null) return null;
		const frame = update(lastTracking, lastAspectRatio);
		return { ...frame, commands: [], selectionChanged: changed };
	}

	return {
		update,
		setPrimaryHand,
		getControlState: controlTracker.getState,
		reset,
	};
}
