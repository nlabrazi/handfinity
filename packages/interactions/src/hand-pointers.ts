import {
	createPointSmoother,
	type HandPoseKind,
	type HandTrackingFrame,
	type Point,
	type TrackedHandPose,
} from "@handfinity/core";

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
	/** Choix explicite conservé après perte, sans réattribution automatique. */
	readonly primaryHandId: number | null;
	readonly selectionStatus:
		| "unselected"
		| "tracked"
		| "missing"
		| "lost"
		| "ambiguous";
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
	let selectionLost = false;
	let selectableIds = new Set<number>();
	let lastTimestamp: number | null = null;

	function setPrimaryHand(handId: number | null) {
		if (handId !== null && (!Number.isSafeInteger(handId) || handId < 1)) {
			throw new RangeError("A hand identity must be a positive integer");
		}
		if (handId !== null && !selectableIds.has(handId))
			throw new RangeError("Select a visible tracked hand");
		const changed = handId !== primaryHandId || selectionLost;
		primaryHandId = handId;
		selectionLost = false;
		if (changed && handId !== null) {
			const state = states.get(handId);
			if (state) {
				state.smoother.reset();
				state.active = false;
			}
		}
		return changed;
	}

	function update(
		tracking: HandTrackingFrame,
		poses: readonly TrackedHandPose[],
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
		selectableIds = new Set(
			tracking.ambiguous
				? []
				: tracking.hands
						.filter((hand) => hand.status === "tracked")
						.map((hand) => hand.id),
		);
		if (
			primaryHandId !== null &&
			(tracking.ambiguous || !ids.has(primaryHandId))
		)
			selectionLost = true;

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

		const selected = tracking.hands.find((hand) => hand.id === primaryHandId);
		const selectionStatus =
			primaryHandId === null
				? "unselected"
				: tracking.ambiguous
					? "ambiguous"
					: selectionLost
						? "lost"
						: (selected?.status ?? "lost");
		return {
			timestamp: tracking.timestamp,
			pointers: pointers.map((pointer) => ({
				...pointer,
				isPrimary: pointer.handId === primaryHandId && !selectionLost,
			})),
			primaryHandId,
			selectionStatus,
		};
	}

	function reset() {
		states.clear();
		primaryHandId = null;
		selectionLost = false;
		selectableIds.clear();
		lastTimestamp = null;
	}
	return { update, setPrimaryHand, reset };
}
