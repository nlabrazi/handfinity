import type { PointerActionCommand, PointerMoveCommand } from "./commands";
import {
	createGestureControl,
	type GestureControlFrame,
} from "./control/gesture-control";
import {
	createPointerActionTracker,
	type PointerActionState,
} from "./gestures/pointer-actions";
import {
	createHandPointerTracker,
	type HandPointerFrame,
} from "./pointer/hand-pointers";
import {
	createHandPoseTracker,
	type TrackedHandPose,
} from "./poses/hand-pose-tracker";
import type { HandTrackingFrame } from "./tracking/hand-identity-tracker";

export type GestureEngineFrame = {
	readonly tracking: HandTrackingFrame;
	readonly poses: readonly TrackedHandPose[];
	readonly pointers: HandPointerFrame;
	readonly control: GestureControlFrame;
	/** Commandes de déplacement de cet appel uniquement ; les observations ne sont pas rejouées. */
	readonly commands: readonly PointerMoveCommand[];
	/** Commandes d'action (clic gauche/maintien, clic droit, défilement) de cet appel. */
	readonly actions: readonly PointerActionCommand[];
	/** État courant des actions (bouton maintenu, glisser-déposer, défilement). */
	readonly actionState: PointerActionState;
};

/** Interprétation commune ; les identités sont fournies par la session de suivi. */
export function createGestureEngine() {
	const poseTracker = createHandPoseTracker();
	const pointerTracker = createHandPointerTracker();
	const controlTracker = createGestureControl();
	const actionTracker = createPointerActionTracker();
	let lastObservationTimestamp: number | null = null;

	function update(
		tracking: HandTrackingFrame,
		aspectRatio = 1,
	): GestureEngineFrame {
		const poses = poseTracker.update(tracking, aspectRatio);
		const pointers = pointerTracker.update(
			tracking,
			poses,
			controlTracker.getState().paused,
		);
		const control = controlTracker.update(
			tracking,
			poses,
			pointers.selectionStatus === "tracked" ? pointers.primaryHandId : null,
		);
		const actionResult = actionTracker.update(
			tracking,
			poses,
			pointers,
			control.paused,
			aspectRatio,
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
		let commands: readonly PointerMoveCommand[] = [];
		if (fresh && !control.paused) {
			if (main) {
				commands = [
					{
						type: "pointer:move",
						handId: main.handId,
						timestamp: main.timestamp,
						position: { x: 1 - main.position.x, y: main.position.y },
					},
				];
			} else if (actionResult.dragMove) {
				commands = [actionResult.dragMove];
			}
		}
		return {
			tracking,
			poses,
			pointers,
			control,
			commands,
			actions: actionResult.actions,
			actionState: actionResult.state,
		};
	}

	function reset() {
		poseTracker.reset();
		pointerTracker.reset();
		controlTracker.reset();
		actionTracker.reset();
		lastObservationTimestamp = null;
	}

	return {
		update,
		getControlState: controlTracker.getState,
		getActionState: actionTracker.getState,
		reset,
	};
}
