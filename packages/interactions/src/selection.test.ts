import {
	createHandIdentityTracker,
	createHandPoseTracker,
	type HandObservation,
	type HandPoseKind,
} from "@handfinity/core";
import { describe, expect, it } from "vitest";
import { createHandPointerTracker, type HandPointer } from "./hand-pointers";
import { createSelectionController, type SelectionInput } from "./selection";
import { projectHandPoint } from "./targets";

const targets = [
	{ id: "paint", rect: { left: 100, top: 100, width: 100, height: 100 } },
	{ id: "playground", rect: { left: 220, top: 100, width: 100, height: 100 } },
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
	pose: HandPoseKind = "pointing",
	overrides: Partial<SelectionInput> = {},
): SelectionInput {
	return {
		frame: {
			timestamp,
			pointers: [pointer(timestamp, pose)],
			primaryHandId: 1,
			preferredHandId: null,
		},
		point: { x: 150, y: 150 },
		targets,
		candidate: pose,
		...overrides,
	};
}

function prepared() {
	const controller = createSelectionController();
	controller.update(input(0));
	controller.update(input(80, "pinch"));
	return controller;
}

describe("Gesture selection", () => {
	it("marks a target ready while pointing without selecting it", () => {
		const controller = createSelectionController();
		expect(controller.update(input(0))).toMatchObject({
			phase: "ready",
			targetId: "paint",
			events: [],
		});
		expect(
			controller.update(input(40, "pointing", { point: { x: 210, y: 150 } })),
		).toMatchObject({ phase: "idle", targetId: null, events: [] });
	});

	it("prepares on a confirmed pinch and emits no repeated events while held", () => {
		const controller = createSelectionController();
		controller.update(input(0));
		expect(controller.update(input(80, "pinch"))).toMatchObject({
			phase: "pressed",
			handId: 1,
			targetId: "paint",
			events: [
				{
					type: "selection:prepare",
					targetId: "paint",
					handId: 1,
					timestamp: 80,
				},
			],
		});
		for (const timestamp of [120, 160, 200]) {
			expect(controller.update(input(timestamp, "pinch"))).toMatchObject({
				phase: "pressed",
				events: [],
			});
		}
	});

	it("confirms once on return to pointing and permits a later full selection cycle", () => {
		const controller = prepared();
		expect(controller.update(input(160)).events).toEqual([
			{
				type: "selection:confirm",
				targetId: "paint",
				handId: 1,
				timestamp: 160,
			},
		]);
		expect(controller.update(input(200)).events).toEqual([]);
		expect(controller.update(input(240, "pinch")).events[0]?.type).toBe(
			"selection:prepare",
		);
		expect(controller.update(input(320)).events[0]?.type).toBe(
			"selection:confirm",
		);
	});

	it("requires pointing first instead of preparing a pinch that arrives already held", () => {
		const controller = createSelectionController();
		expect(controller.update(input(0, "pinch"))).toMatchObject({
			phase: "idle",
			events: [],
		});
		expect(
			controller.update(input(80, "pinch", { point: { x: 250, y: 150 } }))
				.events,
		).toEqual([]);
		expect(controller.update(input(160)).events).toEqual([]);
		expect(controller.update(input(240, "pinch")).events[0]?.type).toBe(
			"selection:prepare",
		);
	});

	it("preserves the aimed target during pinch stabilization without preparing too early", () => {
		const controller = createSelectionController();
		controller.update(input(0));
		expect(
			controller.update(input(40, "pointing", { candidate: "pinch" })),
		).toMatchObject({ phase: "ready", targetId: "paint", events: [] });
		expect(controller.update(input(80, "pinch")).events[0]?.type).toBe(
			"selection:prepare",
		);
	});

	it("waits through the unknown transition before confirming a stabilized pointing release", () => {
		const controller = prepared();
		expect(
			controller.update(input(120, "pinch", { candidate: "pointing" })),
		).toMatchObject({ phase: "pressed", events: [] });
		expect(
			controller.update(input(180, "unknown", { candidate: "pointing" })),
		).toMatchObject({ phase: "pressed", events: [] });
		expect(controller.update(input(200)).events[0]?.type).toBe(
			"selection:confirm",
		);
	});

	it("cancels a confirmed open palm without mistaking it for a selection release", () => {
		const controller = prepared();
		expect(
			controller.update(input(140, "unknown", { candidate: "open-palm" })),
		).toMatchObject({ phase: "pressed", events: [] });
		expect(controller.update(input(180, "open-palm"))).toMatchObject({
			phase: "idle",
			events: [
				{ type: "selection:cancel", reason: "open-palm", targetId: "paint" },
			],
		});
		expect(controller.update(input(220, "open-palm")).events).toEqual([]);
	});

	it("cancels an unsupported release configuration", () => {
		expect(prepared().update(input(160, "unknown")).events).toMatchObject([
			{ type: "selection:cancel", reason: "pose-changed" },
		]);
	});

	it("cancels when leaving the prepared card and does not restart while pinch stays held", () => {
		const controller = prepared();
		expect(
			controller.update(input(120, "pinch", { point: { x: 210, y: 150 } }))
				.events,
		).toMatchObject([{ type: "selection:cancel", reason: "target-left" }]);
		expect(controller.update(input(160, "pinch"))).toMatchObject({
			phase: "idle",
			events: [],
		});
		expect(controller.update(input(200)).events).toEqual([]);
	});

	it("does not transfer a preparation to another card under the pinched hand", () => {
		const controller = prepared();
		expect(
			controller.update(input(120, "pinch", { point: { x: 250, y: 150 } }))
				.events,
		).toMatchObject([{ type: "selection:cancel", targetId: "paint" }]);
		expect(
			controller.update(input(160, "pointing", { point: { x: 250, y: 150 } })),
		).toMatchObject({ phase: "ready", targetId: "playground", events: [] });
	});

	it.each(["removed", "disabled"])(
		"cancels when the prepared target becomes %s",
		(change) => {
			const controller = prepared();
			const unavailable =
				change === "removed"
					? []
					: targets.map((target) => ({ ...target, disabled: true }));
			expect(
				controller.update(input(160, "pointing", { targets: unavailable }))
					.events,
			).toMatchObject([
				{ type: "selection:cancel", reason: "target-unavailable" },
			]);
		},
	);

	it("never prepares a disabled target", () => {
		const controller = createSelectionController();
		const disabled = targets.map((target) => ({ ...target, disabled: true }));
		controller.update(input(0, "pointing", { targets: disabled }));
		expect(
			controller.update(input(80, "pinch", { targets: disabled })),
		).toMatchObject({ phase: "idle", events: [] });
	});

	it("cancels immediately when the main hand disappears, even if its identity remains reserved", () => {
		const controller = prepared();
		const sample = input(120);
		expect(
			controller.update({
				...sample,
				frame: { ...sample.frame, pointers: [] },
				point: null,
			}).events,
		).toMatchObject([{ type: "selection:cancel", reason: "tracking-lost" }]);
		expect(controller.update(input(160, "pinch")).events).toEqual([]);
	});

	it("cancels when main hand changes and does not confirm through the second hand", () => {
		const controller = prepared();
		const sample = input(160);
		const changed = {
			...sample,
			frame: {
				...sample.frame,
				primaryHandId: 2,
				pointers: [
					{ ...pointer(160, "pinch"), isPrimary: false },
					pointer(160, "pointing", 2),
				],
			},
		};
		expect(controller.update(changed).events).toMatchObject([
			{ type: "selection:cancel", reason: "hand-changed", handId: 1 },
		]);
	});

	it("ignores the posture of a secondary hand", () => {
		const controller = prepared();
		const sample = input(160, "pinch");
		expect(
			controller.update({
				...sample,
				frame: {
					...sample.frame,
					pointers: [
						pointer(160, "pinch"),
						{ ...pointer(160, "pointing", 2), isPrimary: false },
					],
				},
			}),
		).toMatchObject({ phase: "pressed", events: [] });
	});

	it("does not confirm by replaying a sample while only frame time changes", () => {
		const controller = prepared();
		const sample = input(120);
		expect(
			controller.update({
				...sample,
				frame: { ...sample.frame, pointers: [pointer(80, "pointing")] },
			}),
		).toMatchObject({ phase: "pressed", events: [] });
		expect(controller.update(input(160)).events[0]?.type).toBe(
			"selection:confirm",
		);
	});

	it("can cancel on a layout change without requiring a new camera sample", () => {
		const controller = prepared();
		const sample = input(100, "pinch");
		const moved = targets.map((target) => ({
			...target,
			rect: { ...target.rect, left: target.rect.left + 400 },
		}));
		expect(
			controller.update({
				...sample,
				frame: { ...sample.frame, pointers: [pointer(80, "pinch")] },
				targets: moved,
			}).events,
		).toMatchObject([{ type: "selection:cancel", reason: "target-left" }]);
	});

	it("cancels for an unprojectable or out-of-image point", () => {
		expect(
			prepared().update(input(160, "pointing", { point: null })).events,
		).toMatchObject([{ type: "selection:cancel", reason: "target-left" }]);
	});

	it("emits a single cancellation on stop and requires aiming again", () => {
		const controller = prepared();
		expect(controller.cancel("stopped")).toMatchObject({
			phase: "idle",
			events: [{ type: "selection:cancel", reason: "stopped" }],
		});
		expect(controller.cancel("stopped").events).toEqual([]);
		expect(controller.update(input(160, "pinch"))).toMatchObject({
			phase: "idle",
			events: [],
		});
	});

	it("clears time and gesture state on reset without mutating an earlier result", () => {
		const controller = createSelectionController();
		controller.update(input(100));
		const pressed = controller.update(input(180, "pinch"));
		controller.reset();
		expect(controller.update(input(0, "pinch"))).toMatchObject({
			phase: "idle",
			events: [],
		});
		expect(pressed).toMatchObject({
			phase: "pressed",
			targetId: "paint",
			events: [{ type: "selection:prepare" }],
		});
	});

	it("rejects invalid time without changing the prepared action", () => {
		const controller = prepared();
		expect(() => controller.update(input(40))).toThrow(RangeError);
		expect(() => controller.update(input(Number.NaN))).toThrow(RangeError);
		expect(controller.cancel("stopped").events).toMatchObject([
			{ type: "selection:cancel", targetId: "paint", timestamp: 80 },
		]);
	});
});

describe("Selection through the real tracking and pose pipeline", () => {
	function observation(timestamp: number, pinch: boolean): HandObservation {
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
		].map(([x = 0, y = 0]) => ({ x, y, z: 0 }));
		return {
			timestamp,
			landmarks,
			handedness: "unknown",
			handednessConfidence: null,
		};
	}

	it("confirms exactly once after the pinch release and pointing stabilization", () => {
		const identities = createHandIdentityTracker();
		const poses = createHandPoseTracker();
		const pointers = createHandPointerTracker();
		const selection = createSelectionController();
		const surface = { left: 0, top: 0, width: 100, height: 100 };
		function update(timestamp: number, pinch: boolean) {
			const tracked = identities.update(
				[observation(timestamp, pinch)],
				timestamp,
			);
			const recognized = poses.update(tracked);
			const frame = pointers.update(tracked, recognized);
			const main = frame.pointers.find((item) => item.isPrimary);
			return selection.update({
				frame,
				candidate: recognized[0]?.candidate ?? "unknown",
				point: main
					? projectHandPoint(main.position, surface, { mirrorX: true })
					: null,
				targets: [{ id: "paint", rect: surface }],
			});
		}
		expect(update(0, false).phase).toBe("idle");
		expect(update(80, false).phase).toBe("ready");
		expect(update(100, true).events).toEqual([]);
		expect(update(140, true).events[0]?.type).toBe("selection:prepare");
		expect(update(200, false).events).toEqual([]);
		expect(update(260, false)).toMatchObject({ phase: "pressed", events: [] });
		expect(update(280, false).events[0]?.type).toBe("selection:confirm");
		expect(update(320, false).events).toEqual([]);
	});
});
