import {
	createHandIdentityTracker,
	createHandPoseTracker,
	type HandObservation,
	type HandPoseKind,
	type TrackedHandPose,
} from "@handfinity/core";
import { describe, expect, it } from "vitest";
import { createDragController, type DragInput } from "./drag";
import { createHandPointerTracker, type HandPointer } from "./hand-pointers";
import { projectHandPoint } from "./targets";

const bounds = { left: 0, top: 0, width: 400, height: 300 };
const targets = [
	{ id: "a", rect: { left: 100, top: 100, width: 100, height: 80 } },
	{ id: "b", rect: { left: 230, top: 180, width: 100, height: 80 } },
];

function pointer(
	timestamp: number,
	pose: HandPoseKind,
	handId = 1,
): HandPointer {
	return {
		handId,
		timestamp,
		pose,
		active: pose === "pointing",
		isPrimary: true,
		position: { x: 0.5, y: 0.5 },
	};
}

function input(
	timestamp: number,
	kind: HandPoseKind = "pointing",
	overrides: Partial<DragInput> = {},
): DragInput {
	return {
		frame: {
			timestamp,
			pointers: [pointer(timestamp, kind)],
			primaryHandId: 1,
			preferredHandId: null,
		},
		pose: {
			handId: 1,
			status: "tracked",
			pose: kind,
			candidate: kind,
			pending: false,
			since: 0,
			measurements: {
				fingers: {
					thumb: "extended",
					index: "extended",
					middle: "folded",
					ring: "folded",
					pinky: "folded",
				},
				pinchRatio: kind === "pinch" ? 0.1 : 1,
			},
		},
		point: { x: 140, y: 120 },
		targets,
		bounds,
		...overrides,
	};
}

function dragging() {
	const controller = createDragController();
	controller.update(input(0));
	controller.update(input(80, "pinch"));
	return controller;
}

describe("Grab and drag", () => {
	it("arms only while pointing over an available target", () => {
		const controller = createDragController();
		expect(controller.update(input(0))).toMatchObject({
			phase: "ready",
			targetId: "a",
			position: null,
			events: [],
		});
		expect(
			controller.update(input(40, "pointing", { point: { x: 30, y: 30 } })),
		).toMatchObject({ phase: "idle", events: [] });
	});

	it("ignores a pinch already held on arrival and requires a new pointing cycle", () => {
		const controller = createDragController();
		expect(controller.update(input(0, "pinch"))).toMatchObject({
			phase: "idle",
			events: [],
		});
		controller.update(input(80));
		expect(controller.update(input(160, "pinch")).events[0]?.type).toBe(
			"drag:start",
		);
	});

	it("keeps the aimed target during pinch stabilization and starts without snapping its center to the hand", () => {
		const controller = createDragController();
		controller.update(input(0));
		const transition = input(40);
		expect(
			controller.update({
				...transition,
				pose: { ...(transition.pose as TrackedHandPose), candidate: "pinch" },
			}),
		).toMatchObject({ phase: "ready", events: [] });
		expect(
			controller.update(input(80, "pinch", { point: { x: 160, y: 130 } })),
		).toMatchObject({
			phase: "dragging",
			position: { x: 100, y: 100 },
			events: [
				{
					type: "drag:start",
					handId: 1,
					targetId: "a",
					origin: { x: 100, y: 100 },
					position: { x: 100, y: 100 },
				},
			],
		});
		expect(
			controller.update(input(120, "pinch", { point: { x: 180, y: 150 } }))
				.position,
		).toEqual({ x: 120, y: 120 });
	});

	it("keeps moving the captured target outside its original rectangle and over a second target", () => {
		const controller = dragging();
		expect(
			controller.update(input(120, "pinch", { point: { x: 280, y: 210 } })),
		).toMatchObject({
			phase: "dragging",
			targetId: "a",
			position: { x: 240, y: 190 },
			events: [{ type: "drag:move", targetId: "a" }],
		});
	});

	it("does not repeat start or move events while the captured hand stays still", () => {
		const controller = dragging();
		expect(controller.update(input(120, "pinch")).events).toEqual([]);
		controller.update(input(160, "pinch", { point: { x: 180, y: 160 } }));
		expect(
			controller.update(input(200, "pinch", { point: { x: 180, y: 160 } }))
				.events,
		).toEqual([]);
	});

	it("keeps the grab offset when the application feeds back the moved target rectangle", () => {
		const controller = dragging();
		controller.update(input(120, "pinch", { point: { x: 200, y: 180 } }));
		const movedTargets = targets.map((target) =>
			target.id === "a"
				? { ...target, rect: { ...target.rect, left: 160, top: 160 } }
				: target,
		);
		expect(
			controller.update(
				input(160, "pinch", {
					point: { x: 220, y: 200 },
					targets: movedTargets,
				}),
			),
		).toMatchObject({
			position: { x: 180, y: 180 },
			events: [{ type: "drag:move", targetId: "a" }],
		});
	});

	it("freezes during release stabilization and ends once at the last held position", () => {
		const controller = dragging();
		controller.update(input(120, "pinch", { point: { x: 200, y: 180 } }));
		const release = input(160, "pinch", { point: { x: 280, y: 80 } });
		expect(
			controller.update({
				...release,
				pose: { ...(release.pose as TrackedHandPose), candidate: "pointing" },
			}),
		).toMatchObject({
			phase: "dragging",
			position: { x: 160, y: 160 },
			events: [],
		});
		expect(controller.update(input(220, "unknown"))).toMatchObject({
			phase: "idle",
			events: [{ type: "drag:end", position: { x: 160, y: 160 } }],
		});
		expect(controller.update(input(240)).events).toEqual([]);
		expect(controller.update(input(280, "pinch")).events[0]?.type).toBe(
			"drag:start",
		);
	});

	it.each(["pointing", "open-palm", "unknown"] as const)(
		"drops on a valid %s release without requiring pointing",
		(kind) => {
			expect(dragging().update(input(160, kind)).events).toMatchObject([
				{ type: "drag:end" },
			]);
		},
	);

	it("keeps the complete target inside the bounds and preserves the grab offset when moving back", () => {
		const controller = dragging();
		expect(
			controller.update(input(120, "pinch", { point: { x: 400, y: 300 } }))
				.position,
		).toEqual({ x: 300, y: 220 });
		expect(
			controller.update(input(160, "pinch", { point: { x: 140, y: 120 } }))
				.position,
		).toEqual({ x: 100, y: 100 });
		expect(
			controller.update(input(200, "pinch", { point: { x: 0, y: 0 } }))
				.position,
		).toEqual({ x: 0, y: 0 });
	});

	it("ignores another hand while the main hand holds the target", () => {
		const controller = dragging();
		const next = input(120, "pinch");
		expect(
			controller.update({
				...next,
				frame: {
					...next.frame,
					pointers: [
						pointer(120, "pinch"),
						{ ...pointer(120, "pointing", 2), isPrimary: false },
					],
				},
			}),
		).toMatchObject({ phase: "dragging", targetId: "a", events: [] });
	});

	it("cancels immediately on missing tracking without resuming the held pinch", () => {
		const controller = dragging();
		const next = input(120);
		expect(
			controller.update({ ...next, frame: { ...next.frame, pointers: [] } })
				.events,
		).toMatchObject([{ type: "drag:cancel", reason: "tracking-lost" }]);
		expect(controller.update(input(160, "pinch"))).toMatchObject({
			phase: "idle",
			events: [],
		});
	});

	it("cancels on main hand change instead of transferring the capture", () => {
		const controller = dragging();
		const next = input(120);
		expect(
			controller.update({
				...next,
				frame: {
					...next.frame,
					primaryHandId: 2,
					pointers: [
						{ ...pointer(120, "pinch"), isPrimary: false },
						pointer(120, "pointing", 2),
					],
				},
			}).events,
		).toMatchObject([
			{ type: "drag:cancel", reason: "hand-changed", handId: 1, targetId: "a" },
		]);
	});

	it.each([
		null,
		{ ...(input(0).pose as TrackedHandPose), measurements: null },
	])(
		"treats invalid pose measurements as an interruption rather than a drop",
		(pose) => {
			expect(
				dragging().update(input(160, "unknown", { pose })).events,
			).toMatchObject([{ type: "drag:cancel", reason: "tracking-lost" }]);
		},
	);

	it.each(["removed", "disabled", "oversized"])(
		"cancels if the captured target becomes %s",
		(change) => {
			const unavailable =
				change === "removed"
					? []
					: targets.map((target) => ({
							...target,
							disabled: change === "disabled",
							rect:
								change === "oversized"
									? { ...target.rect, width: 500 }
									: target.rect,
						}));
			expect(
				dragging().update(input(160, "pinch", { targets: unavailable })).events,
			).toMatchObject([{ type: "drag:cancel", reason: "target-unavailable" }]);
		},
	);

	it("does not arm disabled targets", () => {
		const controller = createDragController();
		const disabled = targets.map((target) => ({ ...target, disabled: true }));
		controller.update(input(0, "pointing", { targets: disabled }));
		expect(
			controller.update(input(80, "pinch", { targets: disabled })),
		).toMatchObject({ phase: "idle", events: [] });
	});

	it.each([null, { x: -1, y: 150 }, { x: Number.NaN, y: 150 }])(
		"cancels when the projected pointer becomes unavailable",
		(point) => {
			expect(
				dragging().update(input(160, "pinch", { point })).events,
			).toMatchObject([{ type: "drag:cancel", reason: "pointer-unavailable" }]);
		},
	);

	it("cancels when the surface becomes invalid, even without a new camera sample", () => {
		const next = input(160, "pinch", { bounds: { ...bounds, width: 0 } });
		expect(
			dragging().update({
				...next,
				frame: { ...next.frame, pointers: [pointer(80, "pinch")] },
			}).events,
		).toMatchObject([{ type: "drag:cancel", reason: "surface-unavailable" }]);
	});

	it("does not replay movements or release by advancing frame time alone", () => {
		const controller = dragging();
		const next = input(160, "pointing", { point: { x: 250, y: 210 } });
		expect(
			controller.update({
				...next,
				frame: { ...next.frame, pointers: [pointer(80, "pointing")] },
			}),
		).toMatchObject({
			phase: "dragging",
			position: { x: 100, y: 100 },
			events: [],
		});
	});

	it("cancels once on stop with the last position and requires aiming again", () => {
		const controller = dragging();
		controller.update(input(120, "pinch", { point: { x: 200, y: 180 } }));
		expect(controller.cancel("stopped")).toMatchObject({
			phase: "idle",
			events: [
				{
					type: "drag:cancel",
					reason: "stopped",
					position: { x: 160, y: 160 },
				},
			],
		});
		expect(controller.cancel("stopped").events).toEqual([]);
		expect(controller.update(input(160, "pinch")).events).toEqual([]);
	});

	it("resets the clock and capture without changing previous snapshots", () => {
		const controller = dragging();
		const previous = controller.update(
			input(120, "pinch", { point: { x: 200, y: 180 } }),
		);
		controller.update(input(160, "pinch", { point: { x: 240, y: 200 } }));
		expect(previous.position).toEqual({ x: 160, y: 160 });
		controller.reset();
		expect(controller.update(input(0, "pinch"))).toMatchObject({
			phase: "idle",
			events: [],
		});
	});

	it("rejects invalid timestamps without changing the captured target", () => {
		const controller = dragging();
		expect(() => controller.update(input(40))).toThrow(RangeError);
		expect(() => controller.update(input(Number.NaN))).toThrow(RangeError);
		expect(controller.cancel("stopped").events).toMatchObject([
			{ targetId: "a", timestamp: 80 },
		]);
	});
});

describe("Drag through the real tracking and pose pipeline", () => {
	function observation(
		timestamp: number,
		pinch: boolean,
		shift = 0,
	): HandObservation {
		const landmarks = [
			[0.5, 0.85],
			[0.4, 0.76],
			[0.3, 0.69],
			[0.24, 0.62],
			pinch ? [0.43, 0.28] : [0.18, 0.55],
			[0.42, 0.6],
			[0.42, 0.46],
			[0.42, 0.36],
			[0.42, 0.28],
			[0.5, 0.6],
			[0.5, 0.46],
			[0.51, 0.6],
			[0.51, 0.68],
			[0.58, 0.61],
			[0.58, 0.47],
			[0.59, 0.61],
			[0.59, 0.69],
			[0.65, 0.65],
			[0.65, 0.51],
			[0.66, 0.65],
			[0.66, 0.73],
		].map(([x = 0, y = 0]) => ({ x: x + shift, y, z: 0 }));
		return {
			timestamp,
			landmarks,
			handedness: "unknown",
			handednessConfidence: null,
		};
	}

	function pipeline() {
		const identities = createHandIdentityTracker();
		const poses = createHandPoseTracker();
		const pointers = createHandPointerTracker();
		const drag = createDragController();
		return (timestamp: number, observations: readonly HandObservation[]) => {
			const tracked = identities.update(observations, timestamp);
			const recognized = poses.update(tracked);
			const frame = pointers.update(tracked, recognized);
			const main = frame.pointers.find((item) => item.isPrimary);
			return drag.update({
				frame,
				pose:
					recognized.find((item) => item.handId === frame.primaryHandId) ??
					null,
				point: main
					? projectHandPoint(main.position, bounds, { mirrorX: true })
					: null,
				targets: [
					{ id: "a", rect: { left: 180, top: 50, width: 100, height: 100 } },
				],
				bounds,
			});
		};
	}

	it("captures after pinch stabilization, moves with the mirror, freezes on opening, and drops after 60 ms", () => {
		const update = pipeline();
		expect(update(0, [observation(0, false)]).phase).toBe("idle");
		expect(update(80, [observation(80, false)]).phase).toBe("ready");
		expect(update(100, [observation(100, true)]).events).toEqual([]);
		expect(update(140, [observation(140, true)]).events[0]?.type).toBe(
			"drag:start",
		);
		const moved = update(180, [observation(180, true, 0.05)]);
		expect(moved.position?.x).toBeCloseTo(160);
		expect(moved.events[0]?.type).toBe("drag:move");
		expect(update(220, [observation(220, false, 0.1)])).toMatchObject({
			phase: "dragging",
			events: [],
		});
		const dropped = update(280, [observation(280, false, 0.1)]);
		expect(dropped.events[0]?.type).toBe("drag:end");
		expect(dropped.events[0]?.position.x).toBeCloseTo(160);
		expect(update(300, [observation(300, false, 0.1)]).events).toEqual([]);
	});

	it("cancels on the first missing observation even during the identity recovery window", () => {
		const update = pipeline();
		for (const timestamp of [0, 80, 100, 140])
			update(timestamp, [observation(timestamp, timestamp >= 100)]);
		expect(update(180, []).events).toMatchObject([
			{ type: "drag:cancel", reason: "tracking-lost" },
		]);
		expect(update(200, [observation(200, true)]).events).toEqual([]);
	});
});
