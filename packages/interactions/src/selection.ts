import type { HandPoseKind, Point } from "@handfinity/core";
import type { HandPointerFrame } from "./hand-pointers";
import { hitTestTargets, type InteractionTarget } from "./targets";

export type SelectionCancelReason =
	| "open-palm"
	| "target-left"
	| "target-unavailable"
	| "tracking-lost"
	| "hand-changed"
	| "pose-changed"
	| "stopped";

type SelectionSample = {
	readonly handId: number;
	readonly targetId: string;
	readonly timestamp: number;
};

export type SelectionEvent = SelectionSample &
	(
		| { readonly type: "selection:prepare" }
		| { readonly type: "selection:confirm" }
		| {
				readonly type: "selection:cancel";
				readonly reason: SelectionCancelReason;
		  }
	);

export type SelectionFrame = {
	readonly timestamp: number;
	readonly phase: "idle" | "ready" | "pressed";
	readonly handId: number | null;
	readonly targetId: string | null;
	/** Transitions de cette mise à jour uniquement. */
	readonly events: readonly SelectionEvent[];
};

export type SelectionInput = {
	readonly frame: HandPointerFrame;
	/** Position de la main principale projetée dans le même repère que les cibles. */
	readonly point: Readonly<Point> | null;
	readonly targets: readonly InteractionTarget[];
	readonly candidate: HandPoseKind;
};

/** Viser, pincer pour préparer, revenir au pointage pour confirmer. */
export function createSelectionController() {
	let phase: SelectionFrame["phase"] = "idle";
	let handId: number | null = null;
	let targetId: string | null = null;
	let lastTimestamp: number | null = null;
	let lastSample: { handId: number; timestamp: number } | null = null;

	function snapshot(
		timestamp: number,
		events: readonly SelectionEvent[] = [],
	): SelectionFrame {
		return { timestamp, phase, handId, targetId, events };
	}

	function clear() {
		phase = "idle";
		handId = null;
		targetId = null;
	}

	function cancel(reason: SelectionCancelReason): SelectionFrame {
		const timestamp = lastTimestamp ?? 0;
		const events: SelectionEvent[] =
			phase === "pressed" && handId !== null && targetId !== null
				? [{ type: "selection:cancel", reason, handId, targetId, timestamp }]
				: [];
		clear();
		return snapshot(timestamp, events);
	}

	function update({
		frame,
		point,
		targets,
		candidate,
	}: SelectionInput): SelectionFrame {
		const timestamp = frame.timestamp;
		if (
			!Number.isFinite(timestamp) ||
			(lastTimestamp !== null && timestamp < lastTimestamp)
		) {
			throw new RangeError("Selection timestamps must be finite and monotonic");
		}
		lastTimestamp = timestamp;
		const pointer = frame.pointers.find(
			(item) => item.handId === frame.primaryHandId && item.isPrimary,
		);
		const fresh =
			!!pointer &&
			(!lastSample ||
				lastSample.handId !== pointer.handId ||
				pointer.timestamp > lastSample.timestamp);
		if (pointer && fresh)
			lastSample = { handId: pointer.handId, timestamp: pointer.timestamp };
		const hit = hitTestTargets(point, targets);

		if (phase === "pressed" && handId !== null && targetId !== null) {
			if (!frame.pointers.some((item) => item.handId === handId))
				return cancel("tracking-lost");
			if (frame.primaryHandId !== handId || !pointer)
				return cancel("hand-changed");
			const target = targets.find((item) => item.id === targetId);
			if (!target || target.disabled) return cancel("target-unavailable");
			if (hit?.id !== targetId) return cancel("target-left");
			if (!fresh) return snapshot(timestamp);
			if (pointer.pose === "open-palm") return cancel("open-palm");
			if (
				pointer.pose === "pointing" &&
				candidate === "pointing" &&
				pointer.active
			) {
				const event: SelectionEvent = {
					type: "selection:confirm",
					handId,
					targetId,
					timestamp,
				};
				phase = "ready";
				return snapshot(timestamp, [event]);
			}
			// Le détecteur peut traverser unknown avant de confirmer le retour
			// au pointage ou l'ouverture de la paume. Attendre cette confirmation.
			if (
				pointer.pose === "pinch" ||
				candidate === "pointing" ||
				candidate === "open-palm" ||
				candidate === "pinch"
			)
				return snapshot(timestamp);
			return cancel("pose-changed");
		}

		if (!pointer || !point) {
			clear();
			return snapshot(timestamp);
		}
		if (phase === "ready" && handId !== pointer.handId) clear();
		if (
			pointer.pose === "pointing" &&
			candidate === "pointing" &&
			pointer.active
		) {
			phase = hit ? "ready" : "idle";
			handId = hit ? pointer.handId : null;
			targetId = hit?.id ?? null;
			return snapshot(timestamp);
		}
		if (phase === "ready" && targetId !== null && handId === pointer.handId) {
			if (hit?.id !== targetId) {
				clear();
				return snapshot(timestamp);
			}
			if (fresh && pointer.pose === "pinch") {
				phase = "pressed";
				return snapshot(timestamp, [
					{ type: "selection:prepare", handId, targetId, timestamp },
				]);
			}
			if (candidate === "pinch") return snapshot(timestamp);
		}
		clear();
		return snapshot(timestamp);
	}

	function reset() {
		clear();
		lastTimestamp = null;
		lastSample = null;
	}
	return { update, cancel, reset };
}
