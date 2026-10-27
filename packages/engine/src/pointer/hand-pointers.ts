import type { Point } from "../gestures/pinch";
import type { HandPoseKind, TrackedHandPose } from "../poses/hand-pose-tracker";
import type { HandTrackingFrame } from "../tracking/hand-identity-tracker";
import { createPointSmoother } from "./point-smoother";

export type HandPointer = {
	readonly handId: number;
	/** Coordonnées normalisées de l'image source, avant miroir ou projection. */
	readonly position: Readonly<Point>;
	readonly pose: HandPoseKind;
	readonly active: boolean;
	readonly isPrimary: boolean;
	/** Horodatage de la dernière observation utilisée, sans rejouer les images. */
	readonly timestamp: number;
};

export type HandPointerFrame = {
	readonly timestamp: number;
	readonly pointers: readonly HandPointer[];
	/** Main de contrôle déterminée par le pointage et le suivi courants. */
	readonly primaryHandId: number | null;
	readonly selectionStatus: "unselected" | "tracked" | "missing" | "ambiguous";
};

type PointerState = {
	smoother: ReturnType<typeof createPointSmoother>;
	timestamp: number | null;
	active: boolean;
	position: Readonly<Point>;
};

/** Un filtre par identité ; une seule main principale dans les diagnostics. */
export function createHandPointerTracker() {
	const states = new Map<number, PointerState>();
	let primaryHandId: number | null = null;
	let lastTimestamp: number | null = null;

	function update(
		tracking: HandTrackingFrame,
		poses: readonly TrackedHandPose[],
		paused = false,
	): HandPointerFrame {
		if (
			!Number.isFinite(tracking.timestamp) ||
			(lastTimestamp !== null && tracking.timestamp < lastTimestamp)
		) {
			throw new RangeError("Pointer timestamps must be finite and monotonic");
		}
		lastTimestamp = tracking.timestamp;
		const ids = new Set(
			tracking.ambiguous ? [] : tracking.hands.map((hand) => hand.id),
		);
		for (const id of states.keys()) if (!ids.has(id)) states.delete(id);

		const pointers: Omit<HandPointer, "isPrimary">[] = [];
		for (const hand of tracking.ambiguous ? [] : tracking.hands) {
			const point = hand.observation.landmarks[8];
			if (
				hand.status !== "tracked" ||
				!point ||
				!Number.isFinite(point.x) ||
				!Number.isFinite(point.y)
			) {
				states.delete(hand.id);
				continue;
			}
			const pose = poses.find(
				(item) => item.handId === hand.id && item.status === "tracked",
			);
			const active =
				pose?.pose === "pointing" &&
				pose.measurements !== null &&
				point.x >= 0 &&
				point.x <= 1 &&
				point.y >= 0 &&
				point.y <= 1;
			let state = states.get(hand.id);
			if (!state) {
				state = {
					smoother: createPointSmoother(),
					timestamp: null,
					active: false,
					position: { x: point.x, y: point.y },
				};
				states.set(hand.id, state);
			}
			if (!active || state.active !== active) state.smoother.reset();
			if (
				state.timestamp !== hand.observation.timestamp ||
				state.active !== active
			) {
				state.position = active
					? state.smoother.update(
							{ x: point.x, y: point.y },
							hand.observation.timestamp,
						)
					: { x: point.x, y: point.y };
				state.timestamp = hand.observation.timestamp;
			}
			state.active = active;
			pointers.push({
				handId: hand.id,
				position: state.position,
				pose: pose?.pose ?? "unknown",
				active,
				timestamp: hand.observation.timestamp,
			});
		}

		if (tracking.ambiguous) {
			primaryHandId = null;
		} else {
			const activePrimary = pointers.some(
				(pointer) => pointer.handId === primaryHandId && pointer.active,
			);
			const primaryVisible = tracking.hands.some(
				(hand) => hand.id === primaryHandId && hand.status === "tracked",
			);
			const primaryPose = poses.find((pose) => pose.handId === primaryHandId);
			// Une paume ouverte sur la main de contrôle doit pouvoir achever la
			// pause, même si l'autre main pointe. La pause garde cette priorité.
			const holdingPalm =
				primaryPose?.status === "tracked" &&
				primaryPose.pose === "open-palm" &&
				primaryPose.candidate === "open-palm" &&
				primaryPose.measurements !== null;
			if (!activePrimary && !(primaryVisible && (holdingPalm || paused))) {
				const candidate = pointers
					.filter(
						(pointer) =>
							pointer.active && pointer.timestamp === tracking.timestamp,
					)
					.sort((a, b) => a.handId - b.handId)[0];
				if (candidate) primaryHandId = candidate.handId;
				else if (primaryHandId !== null && !ids.has(primaryHandId))
					primaryHandId = null;
			}
			// Une main seule au repos peut aussi utiliser la pause par paume ouverte.
			if (primaryHandId === null) {
				const visible = tracking.hands.filter(
					(hand) =>
						hand.status === "tracked" &&
						hand.observation.timestamp === tracking.timestamp,
				);
				if (visible.length === 1) primaryHandId = visible[0]?.id ?? null;
			}
		}
		const selected = tracking.hands.find((hand) => hand.id === primaryHandId);
		const selectionStatus = tracking.ambiguous
			? "ambiguous"
			: (selected?.status ?? "unselected");
		return {
			timestamp: tracking.timestamp,
			pointers: pointers.map((pointer) => ({
				...pointer,
				isPrimary: pointer.handId === primaryHandId,
			})),
			primaryHandId,
			selectionStatus,
		};
	}

	function reset() {
		states.clear();
		primaryHandId = null;
		lastTimestamp = null;
	}
	return { update, reset };
}
