import type { PointerActionCommand, PointerMoveCommand } from "./commands";
import {
	createGestureControl,
	type GestureControlFrame,
} from "./control/gesture-control";
import {
	type BimanualGestureState,
	createBimanualGestureTracker,
} from "./gestures/bimanual-gestures";
import {
	createPointerActionTracker,
	type PointerActionState,
} from "./gestures/pointer-actions";
import {
	type ActiveZoneBounds,
	createActiveZoneMapper,
} from "./pointer/active-zone";
import {
	createHandPointerTracker,
	type HandPointerFrame,
} from "./pointer/hand-pointers";
import {
	createHandPoseTracker,
	type TrackedHandPose,
} from "./poses/hand-pose-tracker";
import type { HandTrackingFrame } from "./tracking/hand-identity-tracker";

export type GestureEngineOptions = {
	readonly activeZone?: ActiveZoneBounds | null;
};

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
	/** État du geste bimanuel (ex: rapprochement puis écartement des paumes). */
	readonly bimanual: BimanualGestureState;
};

/** Interprétation commune ; les identités sont fournies par la session de suivi. */
export function createGestureEngine(options?: GestureEngineOptions) {
	const poseTracker = createHandPoseTracker();
	const pointerTracker = createHandPointerTracker();
	const controlTracker = createGestureControl();
	const bimanualTracker = createBimanualGestureTracker();
	const actionTracker = createPointerActionTracker({
		activeZone: options?.activeZone,
	});
	let activeZone: ActiveZoneBounds | null = options?.activeZone ?? null;
	let mapper = activeZone ? createActiveZoneMapper(activeZone) : null;
	let lastObservationTimestamp: number | null = null;

	function setActiveZone(bounds: ActiveZoneBounds | null) {
		activeZone = bounds;
		mapper = bounds ? createActiveZoneMapper(bounds) : null;
		actionTracker.setActiveZone(bounds);
	}

	function getActiveZone(): ActiveZoneBounds | null {
		return activeZone;
	}

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
		);
		const bimanual = bimanualTracker.update(tracking);
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
			if (actionResult.dragMove) {
				commands = [actionResult.dragMove];
			} else if (main && !actionResult.freezeCursor) {
				const rawMirrored = { x: 1 - main.position.x, y: main.position.y };
				commands = [
					{
						type: "pointer:move",
						handId: main.handId,
						timestamp: main.timestamp,
						position: mapper ? mapper.project(rawMirrored) : rawMirrored,
					},
				];
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
			bimanual,
		};
	}

	function reset() {
		poseTracker.reset();
		pointerTracker.reset();
		controlTracker.reset();
		bimanualTracker.reset();
		actionTracker.reset();
		lastObservationTimestamp = null;
	}

	return {
		update,
		getControlState: controlTracker.getState,
		getActionState: actionTracker.getState,
		setActiveZone,
		getActiveZone,
		reset,
	};
}
