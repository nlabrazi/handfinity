import type { Point, TrackedHandPose } from "@handfinity/core";
import type { HandPointerFrame } from "./hand-pointers";
import {
	hitTestTargets,
	type InteractionRect,
	type InteractionTarget,
} from "./targets";

export type DragCancelReason =
	| "tracking-lost"
	| "hand-changed"
	| "target-unavailable"
	| "surface-unavailable"
	| "pointer-unavailable"
	| "reset"
	| "stopped";

type DragSample = {
	readonly handId: number;
	readonly targetId: string;
	readonly timestamp: number;
	readonly origin: Readonly<Point>;
	readonly position: Readonly<Point>;
};

export type DragEvent = DragSample &
	(
		| { readonly type: "drag:start" }
		| { readonly type: "drag:move" }
		| { readonly type: "drag:end" }
		| { readonly type: "drag:cancel"; readonly reason: DragCancelReason }
	);

export type DragFrame = {
	readonly timestamp: number;
	readonly phase: "idle" | "ready" | "dragging";
	readonly handId: number | null;
	readonly targetId: string | null;
	/** Coin supérieur gauche de la cible pendant sa capture. */
	readonly position: Readonly<Point> | null;
	/** Transitions de cette mise à jour uniquement. */
	readonly events: readonly DragEvent[];
};

export type DragInput = {
	readonly frame: HandPointerFrame;
	readonly pose: TrackedHandPose | null;
	/** Point, cibles et limites doivent utiliser le même repère. */
	readonly point: Readonly<Point> | null;
	readonly targets: readonly InteractionTarget[];
	readonly bounds: InteractionRect;
};

type Capture = {
	handId: number;
	targetId: string;
	origin: Point;
	position: Point;
	offset: Point;
};

function validRect(rect: InteractionRect) {
	return (
		[rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
		rect.width > 0 &&
		rect.height > 0
	);
}

/** Viser, pincer pour capturer, déplacer, puis relâcher pour déposer. */
export function createDragController() {
	let ready: { handId: number; targetId: string } | null = null;
	let capture: Capture | null = null;
	let lastTimestamp: number | null = null;
	let lastSample: { handId: number; timestamp: number } | null = null;

	function snapshot(events: readonly DragEvent[] = []): DragFrame {
		return {
			timestamp: lastTimestamp ?? 0,
			phase: capture ? "dragging" : ready ? "ready" : "idle",
			handId: capture?.handId ?? ready?.handId ?? null,
			targetId: capture?.targetId ?? ready?.targetId ?? null,
			position: capture ? { ...capture.position } : null,
			events,
		};
	}

	function sample(current: Capture): DragSample {
		return {
			handId: current.handId,
			targetId: current.targetId,
			timestamp: lastTimestamp ?? 0,
			origin: { ...current.origin },
			position: { ...current.position },
		};
	}

	function finish(reason?: DragCancelReason): DragFrame {
		const events: DragEvent[] = capture
			? [
					reason
						? { ...sample(capture), type: "drag:cancel", reason }
						: { ...sample(capture), type: "drag:end" },
				]
			: [];
		capture = null;
		ready = null;
		return snapshot(events);
	}

	function cancel(reason: DragCancelReason) {
		return finish(reason);
	}

	function update({
		frame,
		pose,
		point,
		targets,
		bounds,
	}: DragInput): DragFrame {
		if (
			!Number.isFinite(frame.timestamp) ||
			(lastTimestamp !== null && frame.timestamp < lastTimestamp)
		)
			throw new RangeError("Drag timestamps must be finite and monotonic");
		lastTimestamp = frame.timestamp;
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
		const validPose =
			pose?.handId === pointer?.handId &&
			pose?.status === "tracked" &&
			pose.measurements !== null;
		const validPoint =
			point !== null &&
			Number.isFinite(point.x) &&
			Number.isFinite(point.y) &&
			point.x >= bounds.left &&
			point.x <= bounds.left + bounds.width &&
			point.y >= bounds.top &&
			point.y <= bounds.top + bounds.height;
		const target = targets.find(
			(item) => item.id === (capture?.targetId ?? ready?.targetId),
		);
		const available = (item: InteractionTarget | undefined) =>
			item &&
			!item.disabled &&
			validRect(item.rect) &&
			item.rect.width <= bounds.width &&
			item.rect.height <= bounds.height;

		if (capture) {
			if (!frame.pointers.some((item) => item.handId === capture?.handId))
				return cancel("tracking-lost");
			if (frame.primaryHandId !== capture.handId || !pointer)
				return cancel("hand-changed");
			if (!validPose || !pose) return cancel("tracking-lost");
			if (!validRect(bounds)) return cancel("surface-unavailable");
			if (!target || !available(target)) return cancel("target-unavailable");
			if (!validPoint || !point) return cancel("pointer-unavailable");
			if (!fresh) return snapshot();
			// unknown peut être la première posture après les 60 ms de relâchement.
			if (pose.pose !== "pinch") return finish();
			// Ne pas déplacer la cible avec le mouvement d'ouverture des doigts.
			if (pose.candidate !== "pinch") return snapshot();
			const position = {
				x: Math.max(
					bounds.left,
					Math.min(
						bounds.left + bounds.width - target.rect.width,
						point.x - capture.offset.x,
					),
				),
				y: Math.max(
					bounds.top,
					Math.min(
						bounds.top + bounds.height - target.rect.height,
						point.y - capture.offset.y,
					),
				),
			};
			if (
				position.x === capture.position.x &&
				position.y === capture.position.y
			)
				return snapshot();
			capture.position = position;
			return snapshot([{ ...sample(capture), type: "drag:move" }]);
		}

		if (
			!pointer ||
			!validPose ||
			!pose ||
			!validPoint ||
			!point ||
			!validRect(bounds)
		) {
			ready = null;
			return snapshot();
		}
		const hit = hitTestTargets(point, targets);
		if (
			pose.pose === "pointing" &&
			pose.candidate === "pointing" &&
			pointer.active
		) {
			ready =
				hit && available(hit)
					? { handId: pointer.handId, targetId: hit.id }
					: null;
			return snapshot();
		}
		if (
			ready?.handId === pointer.handId &&
			hit?.id === ready.targetId &&
			available(hit)
		) {
			if (fresh && pose.pose === "pinch" && pose.candidate === "pinch") {
				const origin = { x: hit.rect.left, y: hit.rect.top };
				capture = {
					...ready,
					origin,
					position: { ...origin },
					offset: { x: point.x - origin.x, y: point.y - origin.y },
				};
				ready = null;
				return snapshot([{ ...sample(capture), type: "drag:start" }]);
			}
			if (pose.candidate === "pinch") return snapshot();
		}
		ready = null;
		return snapshot();
	}

	function reset() {
		capture = null;
		ready = null;
		lastTimestamp = null;
		lastSample = null;
	}
	return { update, cancel, reset };
}
