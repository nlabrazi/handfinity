import type {
	HandPoseKind,
	HandTrackingFrame,
	TrackedHand,
	TrackedHandPose,
} from "@handfinity/core";
import { describe, expect, it } from "vitest";
import { createHandPointerTracker } from "./hand-pointers";

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

describe("Hand pointers and explicit selection", () => {
	it("starts unselected even when one or two hands point", () => {
		const tracker = createHandPointerTracker();
		const one = tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		expect(one).toMatchObject({
			primaryHandId: null,
			selectionStatus: "unselected",
			pointers: [{ active: true, isPrimary: false }],
		});
		const two = tracker.update(frame(40, [hand(2, 40, 0.8), hand(1, 40)]), [
			pose(2),
			pose(1),
		]);
		expect(two.primaryHandId).toBeNull();
		expect(two.pointers.every((p) => !p.isPrimary)).toBe(true);
	});
	it("selects a visible hand explicitly and keeps source-space snapshots", () => {
		const tracker = createHandPointerTracker();
		const original = tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		expect(tracker.setPrimaryHand(1)).toBe(true);
		const selected = tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		expect(selected).toMatchObject({
			primaryHandId: 1,
			selectionStatus: "tracked",
		});
		expect(selected.pointers).toEqual([
			{
				handId: 1,
				position: { x: 0.2, y: 0.4 },
				pose: "pointing",
				active: true,
				isPrimary: true,
				timestamp: 0,
			},
		]);
		expect(original.primaryHandId).toBeNull();
		expect(original.pointers[0]?.isPrimary).toBe(false);
		expect(tracker.setPrimaryHand(1)).toBe(false);
	});
	it.each(["unknown", "open-palm", "pinch"] as const)(
		"keeps a selected %s hand at rest",
		(kind) => {
			const tracker = createHandPointerTracker();
			tracker.update(frame(0, [hand(1, 0)]), [pose(1, kind)]);
			tracker.setPrimaryHand(1);
			const next = tracker.update(frame(40, [hand(1, 40)]), [
				{ ...pose(1, kind), candidate: "pointing", pending: true },
			]);
			expect(next.primaryHandId).toBe(1);
			expect(next.pointers[0]).toMatchObject({
				active: false,
				isPrimary: true,
			});
		},
	);
	it("requires valid pose measurements from the tracked identity", () => {
		const tracker = createHandPointerTracker();
		expect(
			tracker.update(frame(0, [hand(1, 0)]), [pose(2)]).pointers[0]?.active,
		).toBe(false);
		tracker.setPrimaryHand(1);
		expect(
			tracker.update(frame(40, [hand(1, 40)]), [
				{ ...pose(1), measurements: null },
			]).pointers[0]?.active,
		).toBe(false);
	});
	it("retains the chosen hand regardless of detector order and another pointing hand", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [pose(1), pose(2)]);
		tracker.setPrimaryHand(2);
		const next = tracker.update(frame(40, [hand(2, 40, 0.8), hand(1, 40)]), [
			pose(2),
			pose(1),
		]);
		expect(next.primaryHandId).toBe(2);
		expect(
			next.pointers.map((p) => [p.handId, p.position.x, p.isPrimary]),
		).toEqual([
			[2, 0.8, true],
			[1, 0.2, false],
		]);
	});
	it("keeps ownership while the selected hand rests", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [pose(1), pose(2)]);
		tracker.setPrimaryHand(1);
		const next = tracker.update(frame(40, [hand(1, 40), hand(2, 40, 0.8)]), [
			pose(1, "open-palm"),
			pose(2),
		]);
		expect(next.primaryHandId).toBe(1);
		expect(next.pointers.find((p) => p.active && p.isPrimary)).toBeUndefined();
	});
	it("reserves a briefly missing hand without transferring control and accepts its recovery", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [pose(1), pose(2)]);
		tracker.setPrimaryHand(1);
		const missing = tracker.update(
			frame(40, [hand(1, 0, 0.2, "missing"), hand(2, 40, 0.8)]),
			[pose(2)],
		);
		expect(missing).toMatchObject({
			primaryHandId: 1,
			selectionStatus: "missing",
			pointers: [{ handId: 2, isPrimary: false }],
		});
		expect(() => tracker.setPrimaryHand(1)).toThrow("visible tracked hand");
		const returned = tracker.update(
			frame(80, [hand(1, 80, 0.4), hand(2, 80, 0.8)]),
			[pose(1), pose(2)],
		);
		expect(returned).toMatchObject({
			primaryHandId: 1,
			selectionStatus: "tracked",
		});
		expect(returned.pointers[0]).toMatchObject({
			position: { x: 0.4, y: 0.4 },
			isPrimary: true,
		});
	});
	it("blocks every other hand after expiry until explicit reselection", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [pose(1), pose(2)]);
		tracker.setPrimaryHand(1);
		const lost = tracker.update(frame(200, [hand(2, 200, 0.8)]), [pose(2)]);
		expect(lost).toMatchObject({ primaryHandId: 1, selectionStatus: "lost" });
		expect(lost.pointers[0]?.isPrimary).toBe(false);
		expect(() => tracker.setPrimaryHand(1)).toThrow("visible tracked hand");
		tracker.setPrimaryHand(2);
		expect(
			tracker.update(frame(240, [hand(2, 240, 0.8)]), [pose(2)]),
		).toMatchObject({ primaryHandId: 2, selectionStatus: "tracked" });
	});
	it("does not silently revive a lost selection even if an old ID is presented again", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		tracker.setPrimaryHand(1);
		tracker.update(frame(200, []), []);
		const stale = tracker.update(frame(240, [hand(1, 240)]), [pose(1)]);
		expect(stale.selectionStatus).toBe("lost");
		expect(stale.pointers[0]?.isPrimary).toBe(false);
		tracker.setPrimaryHand(1);
		expect(
			tracker.update(frame(280, [hand(1, 280)]), [pose(1)]).selectionStatus,
		).toBe("tracked");
	});
	it("clears a selection without returning to automatic ownership", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [pose(1), pose(2)]);
		tracker.setPrimaryHand(2);
		tracker.setPrimaryHand(null);
		const next = tracker.update(frame(40, [hand(1, 40), hand(2, 40, 0.8)]), [
			pose(1),
			pose(2),
		]);
		expect(next).toMatchObject({
			primaryHandId: null,
			selectionStatus: "unselected",
		});
		expect(next.pointers.every((p) => !p.isPrimary)).toBe(true);
	});
	it("smooths identities separately and never filters the same image twice", () => {
		const tracker = createHandPointerTracker();
		const initial = tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [
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
		const replay = tracker.update(
			frame(60, [hand(2, 30, 0.8), hand(1, 30, 0.4)]),
			[pose(2), pose(1)],
		);
		expect(replay.pointers).toEqual(moved.pointers);
		expect(initial.pointers[0]?.position.x).toBe(0.2);
	});
	it("resets smoothing on explicit transfer instead of blending with a previous owner", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [pose(1), pose(2)]);
		tracker.setPrimaryHand(1);
		tracker.update(frame(30, [hand(1, 30, 0.4), hand(2, 30, 0.5)]), [
			pose(1),
			pose(2),
		]);
		tracker.setPrimaryHand(2);
		const selected = tracker.update(
			frame(30, [hand(1, 30, 0.4), hand(2, 30, 0.5)]),
			[pose(1), pose(2)],
		);
		expect(selected.pointers[1]).toMatchObject({
			isPrimary: true,
			position: { x: 0.5, y: 0.4 },
		});
	});

	it("resets smoothing after rest or a brief absence of the same selected hand", () => {
		for (const missing of [false, true]) {
			const tracker = createHandPointerTracker();
			tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
			tracker.setPrimaryHand(1);
			tracker.update(
				frame(40, [hand(1, 40, 0.2, missing ? "missing" : "tracked")]),
				[pose(1, "open-palm")],
			);
			const returned = tracker.update(frame(80, [hand(1, 80, 0.8)]), [pose(1)]);
			expect(returned.pointers[0]?.position.x).toBe(0.8);
			expect(returned.primaryHandId).toBe(1);
		}
	});
	it("keeps an ambiguous selection blocked when unrelated identities appear", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		tracker.setPrimaryHand(1);
		expect(tracker.update(frame(40, [], true), [])).toEqual({
			timestamp: 40,
			pointers: [],
			primaryHandId: 1,
			selectionStatus: "ambiguous",
		});
		const next = tracker.update(frame(80, [hand(3, 80, 0.8)]), [pose(3)]);
		expect(next).toMatchObject({ primaryHandId: 1, selectionStatus: "lost" });
		expect(next.pointers[0]?.isPrimary).toBe(false);
	});
	it("disables out-of-image and invalid pointers without handing over ownership", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0, 0.9)]), [pose(1)]);
		tracker.setPrimaryHand(1);
		const outside = tracker.update(frame(1, [hand(1, 1, 1.1)]), [pose(1)]);
		expect(outside.pointers[0]).toMatchObject({
			active: false,
			position: { x: 1.1 },
		});
		expect(
			tracker.update(frame(40, [hand(1, 40, 0.5)]), [pose(1)]).pointers[0]
				?.position.x,
		).toBe(0.5);
		expect(
			tracker.update(frame(80, [hand(1, 80, Number.NaN)]), [pose(1)]).pointers,
		).toEqual([]);
		expect(
			tracker.update(frame(120, [hand(1, 120)]), [pose(1)]).primaryHandId,
		).toBe(1);
	});
	it("clears ownership and all filters on reset", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		tracker.setPrimaryHand(1);
		tracker.reset();
		expect(tracker.update(frame(0, []), [])).toEqual({
			timestamp: 0,
			pointers: [],
			primaryHandId: null,
			selectionStatus: "unselected",
		});
		expect(() => tracker.setPrimaryHand(1)).toThrow("visible tracked hand");
	});
	it("rejects invalid or unavailable choices and backwards time without mutating ownership", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(80, [hand(1, 80)]), [pose(1)]);
		tracker.setPrimaryHand(1);
		for (const id of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 2])
			expect(() => tracker.setPrimaryHand(id)).toThrow(RangeError);
		expect(() => tracker.update(frame(40, []), [])).toThrow(RangeError);
		expect(
			tracker.update(frame(80, [hand(1, 80)]), [pose(1)]).primaryHandId,
		).toBe(1);
	});
});
