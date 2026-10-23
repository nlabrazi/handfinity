import type {
	HandPoseKind,
	HandTrackingFrame,
	TrackedHand,
	TrackedHandPose,
} from "@handfinity/core";
import { describe, expect, it } from "vitest";
import { createHandPointerTracker } from "./hand-pointers";
import { hitTestTargets, projectHandPoint } from "./targets";

function hand(
	id: number,
	timestamp: number,
	x = 0.2,
	status: TrackedHand["status"] = "tracked",
): TrackedHand {
	return {
		id,
		status,
		observation: {
			landmarks: Array.from({ length: 21 }, () => ({ x, y: 0.4, z: 0 })),
			handedness: "unknown",
			handednessConfidence: null,
			timestamp,
		},
	};
}

function pose(
	handId: number,
	kind: HandPoseKind = "pointing",
): TrackedHandPose {
	return {
		handId,
		pose: kind,
		candidate: kind,
		status: "tracked",
		pending: false,
		since: 0,
		measurements: {
			fingers: {
				thumb: "uncertain",
				index: "extended",
				middle: "folded",
				ring: "folded",
				pinky: "folded",
			},
			pinchRatio: 1,
		},
	};
}

function frame(
	timestamp: number,
	hands: readonly TrackedHand[],
	ambiguous = false,
): HandTrackingFrame {
	return { timestamp, hands, events: [], ambiguous };
}

describe("Hand pointers and main hand", () => {
	it("exposes a source-space pointer for a confirmed pointing pose", () => {
		const result = createHandPointerTracker().update(frame(0, [hand(1, 0)]), [
			pose(1),
		]);
		expect(result.primaryHandId).toBe(1);
		expect(result.preferredHandId).toBeNull();
		expect(result.pointers).toEqual([
			{
				handId: 1,
				position: { x: 0.2, y: 0.4 },
				pose: "pointing",
				active: true,
				isPrimary: true,
				timestamp: 0,
			},
		]);
	});

	it.each(["unknown", "open-palm", "pinch"] as const)(
		"does not activate a pointer for %s, even while pointing is a candidate",
		(kind) => {
			const result = createHandPointerTracker().update(frame(0, [hand(1, 0)]), [
				{ ...pose(1, kind), candidate: "pointing", pending: true },
			]);
			expect(result.pointers[0]?.active).toBe(false);
			expect(result.primaryHandId).toBeNull();
		},
	);

	it("requires pose measurements from the same tracked identity", () => {
		const tracker = createHandPointerTracker();
		expect(
			tracker.update(frame(0, [hand(1, 0)]), [pose(2)]).pointers[0]?.active,
		).toBe(false);
		expect(
			tracker.update(frame(40, [hand(1, 40)]), [
				{ ...pose(1), measurements: null },
			]).pointers[0]?.active,
		).toBe(false);
	});

	it("chooses deterministically when both point together, independently of detector order", () => {
		const tracker = createHandPointerTracker();
		const first = tracker.update(frame(0, [hand(2, 0, 0.8), hand(1, 0)]), [
			pose(2),
			pose(1),
		]);
		expect(first.primaryHandId).toBe(1);
		const next = tracker.update(frame(40, [hand(1, 40), hand(2, 40, 0.8)]), [
			pose(1),
			pose(2),
		]);
		expect(
			next.pointers.map((pointer) => [
				pointer.handId,
				pointer.position.x,
				pointer.isPrimary,
			]),
		).toEqual([
			[1, 0.2, true],
			[2, 0.8, false],
		]);
	});

	it("keeps the first pointing owner when another hand starts pointing later", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [
			pose(1, "open-palm"),
			pose(2),
		]);
		expect(
			tracker.update(frame(40, [hand(1, 40), hand(2, 40, 0.8)]), [
				pose(1),
				pose(2),
			]).primaryHandId,
		).toBe(2);
	});

	it("retains ownership while the main hand rests, without letting the secondary hover", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [pose(1), pose(2)]);
		const result = tracker.update(frame(40, [hand(1, 40), hand(2, 40, 0.8)]), [
			pose(1, "open-palm"),
			pose(2),
		]);
		expect(result.primaryHandId).toBe(1);
		expect(
			result.pointers.find((pointer) => pointer.active && pointer.isPrimary),
		).toBeUndefined();
	});

	it("reserves a briefly missing main hand and transfers control only after its identity expires", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [pose(1), pose(2)]);
		const missing = tracker.update(
			frame(40, [hand(1, 0, 0.2, "missing"), hand(2, 40, 0.8)]),
			[pose(2)],
		);
		expect(missing.primaryHandId).toBe(1);
		expect(missing.pointers).toMatchObject([{ handId: 2, isPrimary: false }]);
		const expired = tracker.update(frame(161, [hand(2, 161, 0.8)]), [pose(2)]);
		expect(expired.primaryHandId).toBe(2);
		expect(expired.pointers[0]?.isPrimary).toBe(true);
	});

	it("supports an explicit choice, including a hand currently at rest", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [pose(1), pose(2)]);
		tracker.setPrimaryHand(2);
		const resting = tracker.update(frame(40, [hand(1, 40), hand(2, 40, 0.8)]), [
			pose(1),
			pose(2, "open-palm"),
		]);
		expect(resting).toMatchObject({ primaryHandId: 2, preferredHandId: 2 });
		expect(resting.pointers.find((pointer) => pointer.isPrimary)?.active).toBe(
			false,
		);
		tracker.setPrimaryHand(null);
		expect(
			tracker.update(frame(80, [hand(1, 80), hand(2, 80, 0.8)]), [
				pose(1),
				pose(2),
			]),
		).toMatchObject({ primaryHandId: 1, preferredHandId: null });
	});

	it("returns to automatic choice when an explicitly preferred identity is lost", () => {
		const tracker = createHandPointerTracker();
		tracker.setPrimaryHand(2);
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [pose(1), pose(2)]);
		expect(tracker.update(frame(200, [hand(1, 200)]), [pose(1)])).toMatchObject(
			{ primaryHandId: 1, preferredHandId: null },
		);
	});

	it("smooths each identity separately and preserves previous snapshots", () => {
		const tracker = createHandPointerTracker();
		const original = tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [
			pose(1),
			pose(2),
		]);
		const moved = tracker.update(
			frame(30, [hand(2, 30, 0.8), hand(1, 30, 0.4)]),
			[pose(2), pose(1)],
		);
		expect(moved.pointers[1]?.position.x).toBeGreaterThan(0.2);
		expect(moved.pointers[1]?.position.x).toBeLessThan(0.4);
		expect(moved.pointers[0]?.position.x).toBe(0.8);
		expect(original.pointers[0]?.position.x).toBe(0.2);
	});

	it("does not filter the same video image twice while wall time advances", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		const moved = tracker.update(frame(30, [hand(1, 30, 0.4)]), [pose(1)]);
		const replay = tracker.update(frame(60, [hand(1, 30, 0.4)]), [pose(1)]);
		expect(replay.pointers).toEqual(moved.pointers);
		expect(replay.pointers[0]?.timestamp).toBe(30);
	});

	it("resets the filter on return from rest or a brief tracking loss", () => {
		for (const missing of [false, true]) {
			const tracker = createHandPointerTracker();
			tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
			tracker.update(
				frame(40, [hand(1, 40, 0.2, missing ? "missing" : "tracked")]),
				[pose(1, "open-palm")],
			);
			const returned = tracker.update(frame(80, [hand(1, 80, 0.8)]), [pose(1)]);
			expect(returned.pointers[0]?.position.x).toBe(0.8);
			expect(returned.primaryHandId).toBe(1);
		}
	});

	it("does not blend the cursor of a new identity with the previous one", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		const replaced = tracker.update(frame(40, [hand(3, 40, 0.8)]), [pose(3)]);
		expect(replaced.pointers[0]?.position.x).toBe(0.8);
		expect(replaced.primaryHandId).toBe(3);
	});

	it("clears ownership and preference on ambiguity, then starts fresh", () => {
		const tracker = createHandPointerTracker();
		tracker.setPrimaryHand(1);
		tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		expect(tracker.update(frame(40, [], true), [])).toEqual({
			timestamp: 40,
			pointers: [],
			primaryHandId: null,
			preferredHandId: null,
		});
		expect(
			tracker.update(frame(80, [hand(3, 80, 0.8)]), [pose(3)]).pointers[0]
				?.position.x,
		).toBe(0.8);
	});

	it("disables an out-of-image cursor immediately, even if its smoothed position was inside", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0, 0.9)]), [pose(1)]);
		const outside = tracker.update(frame(1, [hand(1, 1, 1.1)]), [pose(1)]);
		expect(outside.pointers[0]).toMatchObject({
			active: false,
			position: { x: 1.1 },
		});
		expect(
			tracker.update(frame(40, [hand(1, 40, 0.5)]), [pose(1)]).pointers[0]
				?.position.x,
		).toBe(0.5);
	});

	it("discards invalid positions and clears all state on stop", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		expect(
			tracker.update(frame(40, [hand(1, 40, Number.NaN)]), [pose(1)]).pointers,
		).toEqual([]);
		tracker.reset();
		expect(tracker.update(frame(0, []), [])).toEqual({
			timestamp: 0,
			pointers: [],
			primaryHandId: null,
			preferredHandId: null,
		});
	});

	it("rejects invalid identities and backward time without changing ownership", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(80, [hand(1, 80)]), [pose(1)]);
		expect(() => tracker.setPrimaryHand(-1)).toThrow(RangeError);
		expect(() => tracker.setPrimaryHand(Number.NaN)).toThrow(RangeError);
		expect(() => tracker.update(frame(40, []), [])).toThrow(RangeError);
		expect(
			tracker.update(frame(80, [hand(1, 80)]), [pose(1)]).primaryHandId,
		).toBe(1);
	});

	it("changes the hovered target only through the active main pointer", () => {
		const tracker = createHandPointerTracker();
		const surface = { left: 0, top: 0, width: 400, height: 300 };
		const targets = [
			{ id: "left", rect: { ...surface, width: 200 } },
			{ id: "right", rect: { ...surface, left: 200, width: 200 } },
		];
		function hovered(timestamp: number, mainPose: HandPoseKind = "pointing") {
			const result = tracker.update(
				frame(timestamp, [hand(1, timestamp), hand(2, timestamp, 0.8)]),
				[pose(1, mainPose), pose(2)],
			);
			const pointer = result.pointers.find(
				(item) => item.active && item.isPrimary,
			);
			return (
				hitTestTargets(
					pointer
						? projectHandPoint(pointer.position, surface, { mirrorX: true })
						: null,
					targets,
				)?.id ?? null
			);
		}
		expect(hovered(0)).toBe("right");
		expect(hovered(40, "open-palm")).toBeNull();
		tracker.setPrimaryHand(2);
		expect(hovered(80)).toBe("left");
	});
});
