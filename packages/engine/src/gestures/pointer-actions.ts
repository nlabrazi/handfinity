import type { PointerActionCommand, PointerMoveCommand } from "../commands";
import type { HandObservation } from "../hand-observation";
import type { HandPointerFrame } from "../pointer/hand-pointers";
import { createOneEuroFilter } from "../pointer/one-euro-filter";
import type { TrackedHandPose } from "../poses/hand-pose-tracker";
import type { HandTrackingFrame } from "../tracking/hand-identity-tracker";
import { measurePinch, type Point } from "./pinch";
import { PINCH_END_THRESHOLD, PINCH_START_THRESHOLD } from "./pinch-config";

export const CLICK_FREEZE_MS = 120;
export const SECONDARY_PINCH_HOLD_MS = 60;
export const SCROLL_HOLD_MS = 80;
const SCROLL_DEADZONE = 0.004;

export type PointerActionState = {
	readonly leftButtonDown: boolean;
	readonly dragging: boolean;
	readonly scrolling: boolean;
	readonly secondaryPinchPending: boolean;
};

export type PointerActionUpdate = {
	readonly state: PointerActionState;
	readonly actions: readonly PointerActionCommand[];
	readonly dragMove: PointerMoveCommand | null;
};

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function stableHandAnchor(observation: HandObservation): Point | null {
	const indexMcp = observation.landmarks[5];
	const indexTip = observation.landmarks[8];
	if (
		!indexMcp ||
		!indexTip ||
		![indexMcp.x, indexMcp.y, indexTip.x, indexTip.y].every(Number.isFinite)
	) {
		return null;
	}
	return {
		x: indexMcp.x * 0.7 + indexTip.x * 0.3,
		y: indexMcp.y * 0.7 + indexTip.y * 0.3,
	};
}

function secondaryPinchRatio(
	observation: HandObservation,
	aspectRatio: number,
): number | null {
	const wrist = observation.landmarks[0];
	const thumbTip = observation.landmarks[4];
	const middleBase = observation.landmarks[9];
	const middleTip = observation.landmarks[12];
	if (!wrist || !thumbTip || !middleBase || !middleTip) return null;
	return (
		measurePinch(
			{ wrist, thumbTip, indexTip: middleTip, middleBase },
			aspectRatio,
		)?.ratio ?? null
	);
}

function isScrollFingerLayout(pose: TrackedHandPose): boolean {
	const fingers = pose.measurements?.fingers;
	if (!fingers) return false;
	return (
		fingers.index === "extended" &&
		fingers.middle === "extended" &&
		fingers.ring === "folded" &&
		fingers.pinky === "folded"
	);
}

/**
 * Gère le cycle clic gauche / glisser-déposer, clic secondaire (pouce + majeur)
 * et défilement à deux doigts (index + majeur tendus), avec relâchement garanti.
 */
export function createPointerActionTracker() {
	const dragFilter = createOneEuroFilter({ minCutoff: 1.4, beta: 0.05 });
	let activeHandId: number | null = null;
	let armedFromPointing = false;
	let lastMirroredPosition: Point = { x: 0.5, y: 0.5 };
	let leftButtonDown = false;
	let dragging = false;
	let pinchStartedAt: number | null = null;
	let dragOriginAnchor: Point | null = null;
	let dragStartScreenPos: Point | null = null;

	let secondarySince: number | null = null;
	let secondaryRequiresRelease = false;

	let scrollSince: number | null = null;
	let scrolling = false;
	let lastScrollY: number | null = null;

	let lastProcessedTimestamp: number | null = null;

	function getState(): PointerActionState {
		return {
			leftButtonDown,
			dragging,
			scrolling,
			secondaryPinchPending:
				secondarySince !== null && !secondaryRequiresRelease,
		};
	}

	function clearGestureTimers() {
		secondarySince = null;
		secondaryRequiresRelease = false;
		scrollSince = null;
		scrolling = false;
		lastScrollY = null;
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
		pinchStartedAt = null;
		dragOriginAnchor = null;
		dragStartScreenPos = null;
		dragFilter.reset();
	}

	function update(
		tracking: HandTrackingFrame,
		poses: readonly TrackedHandPose[],
		pointers: HandPointerFrame,
		paused: boolean,
		aspectRatio = 1,
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
			armedFromPointing = false;
			activeHandId = primaryId;
			clearGestureTimers();
			if (paused || tracking.ambiguous || primaryId === null) {
				return { state: getState(), actions, dragMove };
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
			armedFromPointing = false;
			clearGestureTimers();
			return { state: getState(), actions, dragMove };
		}

		const isFresh =
			hand.observation.timestamp === tracking.timestamp &&
			lastProcessedTimestamp !== tracking.timestamp;
		if (!isFresh) {
			return { state: getState(), actions, dragMove };
		}
		lastProcessedTimestamp = tracking.timestamp;

		if (
			pointer.active &&
			pose.pose === "pointing" &&
			pose.candidate === "pointing"
		) {
			lastMirroredPosition = {
				x: clamp01(1 - pointer.position.x),
				y: clamp01(pointer.position.y),
			};
			armedFromPointing = true;
		}

		// 1. Cycle clic gauche & glisser-déposer (pinch pouce + index depuis un pointage)
		if (pose.pose === "pinch" && (armedFromPointing || leftButtonDown)) {
			clearGestureTimers();
			const anchor = stableHandAnchor(hand.observation);
			if (!leftButtonDown) {
				leftButtonDown = true;
				dragging = false;
				pinchStartedAt = tracking.timestamp;
				dragOriginAnchor = anchor
					? dragFilter.update(anchor, tracking.timestamp)
					: null;
				dragStartScreenPos = { ...lastMirroredPosition };
				actions.push({
					type: "pointer:down",
					button: "left",
					handId: primaryId,
					timestamp: tracking.timestamp,
					position: lastMirroredPosition,
				});
			} else if (
				anchor &&
				dragOriginAnchor &&
				dragStartScreenPos &&
				pinchStartedAt !== null
			) {
				const filteredAnchor = dragFilter.update(anchor, tracking.timestamp);
				if (tracking.timestamp - pinchStartedAt > CLICK_FREEZE_MS) {
					const dx = -(filteredAnchor.x - dragOriginAnchor.x);
					const dy = filteredAnchor.y - dragOriginAnchor.y;
					if (Math.hypot(dx, dy) > 0.003) {
						dragging = true;
					}
					if (dragging) {
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
			}
			return { state: getState(), actions, dragMove };
		}

		if (leftButtonDown) {
			releaseLeftButton(tracking.timestamp, actions);
			// Conserver l'armement si la main revient immédiatement en pointage.
			armedFromPointing = pose.pose === "pointing" && pointer.active;
		} else if (pose.pose === "open-palm") {
			armedFromPointing = false;
		}

		// 2. Clic droit : pincement pouce + majeur avec l'index tendu
		const secRatio = secondaryPinchRatio(hand.observation, aspectRatio);
		const fingers = pose.measurements?.fingers;
		const isSecondaryPinchCandidate =
			secRatio !== null &&
			fingers?.index === "extended" &&
			fingers.ring === "folded" &&
			fingers.pinky === "folded" &&
			(secondaryRequiresRelease
				? secRatio < PINCH_END_THRESHOLD
				: secRatio <= PINCH_START_THRESHOLD);

		if (isSecondaryPinchCandidate) {
			scrollSince = null;
			scrolling = false;
			lastScrollY = null;
			if (!secondaryRequiresRelease) {
				secondarySince ??= tracking.timestamp;
				if (tracking.timestamp - secondarySince >= SECONDARY_PINCH_HOLD_MS) {
					secondaryRequiresRelease = true;
					secondarySince = null;
					actions.push({
						type: "pointer:click",
						button: "right",
						handId: primaryId,
						timestamp: tracking.timestamp,
						position: lastMirroredPosition,
					});
				}
			}
			return { state: getState(), actions, dragMove };
		}
		secondarySince = null;
		if (secRatio === null || secRatio >= PINCH_END_THRESHOLD) {
			secondaryRequiresRelease = false;
		}

		// 3. Défilement vertical : index + majeur tendus, annulaire + auriculaire repliés
		if (pose.pose !== "pinch" && isScrollFingerLayout(pose)) {
			const indexMcp = hand.observation.landmarks[5];
			const middleMcp = hand.observation.landmarks[9];
			const currentY =
				indexMcp && middleMcp ? (indexMcp.y + middleMcp.y) / 2 : null;
			if (currentY !== null && Number.isFinite(currentY)) {
				scrollSince ??= tracking.timestamp;
				if (tracking.timestamp - scrollSince >= SCROLL_HOLD_MS) {
					scrolling = true;
					if (lastScrollY !== null) {
						const dy = currentY - lastScrollY;
						if (Math.abs(dy) >= SCROLL_DEADZONE) {
							actions.push({
								type: "pointer:scroll",
								handId: primaryId,
								timestamp: tracking.timestamp,
								deltaY: Number((dy * 12).toFixed(4)),
							});
							lastScrollY = currentY;
						}
					} else {
						lastScrollY = currentY;
					}
				}
				return { state: getState(), actions, dragMove };
			}
		}

		scrollSince = null;
		scrolling = false;
		lastScrollY = null;

		return { state: getState(), actions, dragMove };
	}

	function reset() {
		activeHandId = null;
		armedFromPointing = false;
		lastMirroredPosition = { x: 0.5, y: 0.5 };
		leftButtonDown = false;
		dragging = false;
		pinchStartedAt = null;
		dragOriginAnchor = null;
		dragStartScreenPos = null;
		lastProcessedTimestamp = null;
		dragFilter.reset();
		clearGestureTimers();
	}

	return { update, getState, reset };
}
