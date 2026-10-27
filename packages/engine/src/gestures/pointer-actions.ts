import type { PointerActionCommand, PointerMoveCommand } from "../commands";
import type { HandPointerFrame } from "../pointer/hand-pointers";
import type { TrackedHandPose } from "../poses/hand-pose-tracker";
import type { HandTrackingFrame } from "../tracking/hand-identity-tracker";
import type { Point } from "./pinch";

/** Durée de maintien du poing fermé avant de verrouiller la saisie (Grab & Drag). */
export const GRAB_HOLD_MS = 600;
/** Durée de confirmation d'un accord à 2 doigts (clic gauche) ou 3 doigts (clic droit). */
export const CHORD_HOLD_MS = 140;
/** Durée de maintien avant d'activer le défilement continu type joystick. */
export const SCROLL_HOLD_MS = 100;
/** Zone morte verticale autour du point d'ancrage du défilement joystick. */
export const SCROLL_DEADZONE = 0.012;

export type PointerActionState = {
	readonly leftButtonDown: boolean;
	readonly dragging: boolean;
	/** Progression de verrouillage du poing fermé de 0 à 1 (sur GRAB_HOLD_MS). */
	readonly grabProgress: number;
	readonly scrolling: boolean;
	/** Vitesse de défilement courante (négative = haut, positive = bas, 0 = zone morte). */
	readonly scrollVelocity: number;
	readonly pendingChord: "left-click" | "right-click" | null;
};

export type PointerActionUpdate = {
	readonly state: PointerActionState;
	readonly actions: readonly PointerActionCommand[];
	readonly dragMove: PointerMoveCommand | null;
	readonly freezeCursor: boolean;
};

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function isClosedFist(pose: TrackedHandPose): boolean {
	const fingers = pose.measurements?.fingers;
	if (!fingers || pose.pose === "pinch" || pose.candidate === "pinch") {
		return false;
	}
	return (
		fingers.index === "folded" &&
		fingers.middle === "folded" &&
		fingers.ring === "folded" &&
		fingers.pinky === "folded"
	);
}

function shouldReleaseGrab(pose: TrackedHandPose): boolean {
	const fingers = pose.measurements?.fingers;
	if (!fingers) return true;
	return (
		pose.pose === "open-palm" ||
		fingers.index === "extended" ||
		fingers.middle === "extended"
	);
}

function isTwoFingerChord(pose: TrackedHandPose): boolean {
	const fingers = pose.measurements?.fingers;
	if (!fingers || pose.pose === "pinch" || pose.candidate === "pinch") {
		return false;
	}
	return (
		fingers.index === "extended" &&
		fingers.middle === "extended" &&
		fingers.ring === "folded" &&
		fingers.pinky === "folded"
	);
}

function isThreeFingerChord(pose: TrackedHandPose): boolean {
	const fingers = pose.measurements?.fingers;
	if (!fingers || pose.pose === "pinch" || pose.candidate === "pinch") {
		return false;
	}
	return (
		fingers.index === "extended" &&
		fingers.middle === "extended" &&
		fingers.ring === "extended" &&
		fingers.pinky === "folded"
	);
}

/**
 * Modèle ergonomique multimodal ancré sur la paume :
 * - ✊ Poing fermé (600 ms) : Saisir & Glisser (Grab & Drag piloté par le centre de la paume)
 * - ✌️ 2 doigts tendus (Index + Majeur) : Clic gauche
 * - 🤟 3 doigts tendus (Index + Majeur + Annulaire) : Clic droit
 * - 🤏 Pincement maintenu + déplacement vertical : Défilement continu type "Joystick"
 */
export function createPointerActionTracker() {
	let activeHandId: number | null = null;
	let lastMirroredPosition: Point = { x: 0.5, y: 0.5 };

	let grabSince: number | null = null;
	let grabProgress = 0;
	let leftButtonDown = false;
	let dragging = false;
	let dragOriginPalm: Point | null = null;
	let dragStartScreenPos: Point | null = null;

	let leftClickSince: number | null = null;
	let rightClickSince: number | null = null;
	let chordRequiresRelease = false;

	let scrollSince: number | null = null;
	let scrolling = false;
	let scrollAnchorY: number | null = null;
	let scrollVelocity = 0;

	let lastProcessedTimestamp: number | null = null;

	function getState(): PointerActionState {
		const pendingChord =
			!chordRequiresRelease && rightClickSince !== null
				? "right-click"
				: !chordRequiresRelease && leftClickSince !== null
					? "left-click"
					: null;
		return {
			leftButtonDown,
			dragging,
			grabProgress,
			scrolling,
			scrollVelocity,
			pendingChord,
		};
	}

	function clearGestureTimers() {
		grabSince = null;
		grabProgress = 0;
		leftClickSince = null;
		rightClickSince = null;
		chordRequiresRelease = false;
		scrollSince = null;
		scrolling = false;
		scrollAnchorY = null;
		scrollVelocity = 0;
	}

	function releaseLeftButton(
		timestamp: number,
		actions: PointerActionCommand[],
	) {
		if (!leftButtonDown || activeHandId === null) return;
		actions.push({
			type: "pointer:up",
			button: "left",
			handId: activeHandId,
			timestamp,
			position: lastMirroredPosition,
		});
		leftButtonDown = false;
		dragging = false;
		grabSince = null;
		grabProgress = 0;
		dragOriginPalm = null;
		dragStartScreenPos = null;
	}

	function update(
		tracking: HandTrackingFrame,
		poses: readonly TrackedHandPose[],
		pointers: HandPointerFrame,
		paused: boolean,
	): PointerActionUpdate {
		const actions: PointerActionCommand[] = [];
		let dragMove: PointerMoveCommand | null = null;

		const primaryId =
			pointers.selectionStatus === "tracked" ? pointers.primaryHandId : null;

		if (
			paused ||
			tracking.ambiguous ||
			primaryId === null ||
			(activeHandId !== null && primaryId !== activeHandId)
		) {
			releaseLeftButton(tracking.timestamp, actions);
			activeHandId = primaryId;
			clearGestureTimers();
			if (paused || tracking.ambiguous || primaryId === null) {
				return {
					state: getState(),
					actions,
					dragMove,
					freezeCursor: false,
				};
			}
		}

		activeHandId = primaryId;
		const hand = tracking.hands.find(
			(item) => item.id === primaryId && item.status === "tracked",
		);
		const pose = poses.find(
			(item) => item.handId === primaryId && item.status === "tracked",
		);
		const pointer = pointers.pointers.find((item) => item.handId === primaryId);

		if (!hand || !pose || !pointer) {
			releaseLeftButton(tracking.timestamp, actions);
			clearGestureTimers();
			return {
				state: getState(),
				actions,
				dragMove,
				freezeCursor: false,
			};
		}

		const isFresh =
			hand.observation.timestamp === tracking.timestamp &&
			lastProcessedTimestamp !== tracking.timestamp;
		if (!isFresh) {
			return {
				state: getState(),
				actions,
				dragMove,
				freezeCursor:
					leftButtonDown ||
					grabSince !== null ||
					leftClickSince !== null ||
					rightClickSince !== null ||
					scrolling,
			};
		}
		lastProcessedTimestamp = tracking.timestamp;

		const fist = isClosedFist(pose);
		const twoFinger = isTwoFingerChord(pose);
		const threeFinger = isThreeFingerChord(pose);
		const pinchScroll = pose.pose === "pinch" || pose.candidate === "pinch";

		if (
			pointer.active &&
			pose.pose === "pointing" &&
			pose.candidate === "pointing" &&
			!fist &&
			!twoFinger &&
			!threeFinger &&
			!pinchScroll &&
			!leftButtonDown
		) {
			lastMirroredPosition = {
				x: clamp01(1 - pointer.position.x),
				y: clamp01(pointer.position.y),
			};
		}

		// 1. Saisir & Glisser (Grab & Drag) : poing fermé maintenu 600 ms, puis déplacement par la paume
		if (leftButtonDown) {
			if (shouldReleaseGrab(pose)) {
				releaseLeftButton(tracking.timestamp, actions);
			} else {
				grabProgress = 1;
				if (dragOriginPalm && dragStartScreenPos) {
					const dx = -(pointer.palmPosition.x - dragOriginPalm.x);
					const dy = pointer.palmPosition.y - dragOriginPalm.y;
					if (Math.hypot(dx, dy) > 0.002) {
						dragging = true;
						lastMirroredPosition = {
							x: clamp01(dragStartScreenPos.x + dx),
							y: clamp01(dragStartScreenPos.y + dy),
						};
						dragMove = {
							type: "pointer:move",
							handId: primaryId,
							timestamp: tracking.timestamp,
							position: lastMirroredPosition,
						};
					}
				}
				return {
					state: getState(),
					actions,
					dragMove,
					freezeCursor: true,
				};
			}
		} else if (fist) {
			leftClickSince = null;
			rightClickSince = null;
			scrollSince = null;
			scrolling = false;
			scrollAnchorY = null;
			scrollVelocity = 0;

			grabSince ??= tracking.timestamp;
			const elapsed = tracking.timestamp - grabSince;
			grabProgress = Number(clamp01(elapsed / GRAB_HOLD_MS).toFixed(4));
			if (elapsed >= GRAB_HOLD_MS) {
				leftButtonDown = true;
				dragging = true;
				grabProgress = 1;
				dragOriginPalm = { ...pointer.palmPosition };
				dragStartScreenPos = { ...lastMirroredPosition };
				actions.push({
					type: "pointer:down",
					button: "left",
					handId: primaryId,
					timestamp: tracking.timestamp,
					position: lastMirroredPosition,
				});
			}
			return {
				state: getState(),
				actions,
				dragMove,
				freezeCursor: true,
			};
		} else {
			grabSince = null;
			grabProgress = 0;
		}

		// 2. Accord à 3 doigts (Index + Majeur + Annulaire) : Clic droit
		if (threeFinger) {
			leftClickSince = null;
			scrollSince = null;
			scrolling = false;
			scrollAnchorY = null;
			scrollVelocity = 0;
			if (!chordRequiresRelease) {
				rightClickSince ??= tracking.timestamp;
				if (tracking.timestamp - rightClickSince >= CHORD_HOLD_MS) {
					chordRequiresRelease = true;
					rightClickSince = null;
					actions.push({
						type: "pointer:click",
						button: "right",
						handId: primaryId,
						timestamp: tracking.timestamp,
						position: lastMirroredPosition,
					});
				}
			}
			return {
				state: getState(),
				actions,
				dragMove,
				freezeCursor: true,
			};
		}

		// 3. Accord à 2 doigts (Index + Majeur) : Clic gauche
		if (twoFinger) {
			rightClickSince = null;
			scrollSince = null;
			scrolling = false;
			scrollAnchorY = null;
			scrollVelocity = 0;
			if (!chordRequiresRelease) {
				leftClickSince ??= tracking.timestamp;
				if (tracking.timestamp - leftClickSince >= CHORD_HOLD_MS) {
					chordRequiresRelease = true;
					leftClickSince = null;
					actions.push({
						type: "pointer:click",
						button: "left",
						handId: primaryId,
						timestamp: tracking.timestamp,
						position: lastMirroredPosition,
					});
				}
			}
			return {
				state: getState(),
				actions,
				dragMove,
				freezeCursor: true,
			};
		}

		leftClickSince = null;
		rightClickSince = null;
		const fingers = pose.measurements?.fingers;
		if (
			pose.pose === "open-palm" ||
			(fingers?.middle === "folded" && fingers.ring === "folded")
		) {
			chordRequiresRelease = false;
		}

		// 4. Défilement continu type "Joystick" (pincement maintenu + écart vertical de la paume)
		if (pose.pose === "pinch") {
			scrollSince ??= tracking.timestamp;
			if (tracking.timestamp - scrollSince >= SCROLL_HOLD_MS) {
				scrolling = true;
				scrollAnchorY ??= pointer.palmPosition.y;
				const dy = pointer.palmPosition.y - scrollAnchorY;
				if (Math.abs(dy) >= SCROLL_DEADZONE) {
					const effectiveDy = Math.sign(dy) * (Math.abs(dy) - SCROLL_DEADZONE);
					const deltaY = Number((effectiveDy * 8).toFixed(4));
					scrollVelocity = deltaY;
					actions.push({
						type: "pointer:scroll",
						handId: primaryId,
						timestamp: tracking.timestamp,
						deltaY,
					});
				} else {
					scrollVelocity = 0;
				}
			}
			return {
				state: getState(),
				actions,
				dragMove,
				freezeCursor: true,
			};
		}

		scrollSince = null;
		scrolling = false;
		scrollAnchorY = null;
		scrollVelocity = 0;

		return {
			state: getState(),
			actions,
			dragMove,
			freezeCursor: false,
		};
	}

	function reset() {
		activeHandId = null;
		lastMirroredPosition = { x: 0.5, y: 0.5 };
		leftButtonDown = false;
		dragging = false;
		dragOriginPalm = null;
		dragStartScreenPos = null;
		lastProcessedTimestamp = null;
		clearGestureTimers();
	}

	return { update, getState, reset };
}
