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

describe("Automatic controlling hand", () => {
	it("chooses a pointing hand while another visible hand rests", () => {
		const tracker = createHandPointerTracker();
		const result = tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [
			pose(1, "open-palm"),
			pose(2),
		]);
		expect(result.primaryHandId).toBe(2);
		expect(result.pointers).toMatchObject([
			{ handId: 1, isPrimary: false },
			{ handId: 2, active: true, isPrimary: true },
		]);
	});

	it("keeps the active controller when both hands point, regardless of detection order", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [
			pose(1, "open-palm"),
			pose(2),
		]);
		const result = tracker.update(frame(40, [hand(1, 40), hand(2, 40, 0.8)]), [
			pose(1),
			pose(2),
		]);
		expect(result.primaryHandId).toBe(2);
		expect(result.pointers.find((pointer) => pointer.isPrimary)?.handId).toBe(
			2,
		);
	});

	it("chooses the lowest identity deterministically when both begin pointing together", () => {
		const tracker = createHandPointerTracker();
		expect(
			tracker.update(frame(0, [hand(2, 0, 0.8), hand(1, 0)]), [
				pose(2),
				pose(1),
			]).primaryHandId,
		).toBe(1);
	});

	it("switches when the controller stops pointing and another hand points", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [
			pose(1),
			pose(2, "open-palm"),
		]);
		const result = tracker.update(frame(40, [hand(1, 40), hand(2, 40, 0.8)]), [
			pose(1, "pinch"),
			pose(2),
		]);
		expect(result.primaryHandId).toBe(2);
	});

	it("reserves a temporarily missing controller without emitting a pointer, then reacquires it", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		expect(
			tracker.update(frame(40, [hand(1, 0, 0.2, "missing")]), []),
		).toMatchObject({
			primaryHandId: 1,
			selectionStatus: "missing",
			pointers: [],
		});
		expect(
			tracker.update(frame(80, [hand(1, 80, 0.7)]), [pose(1)]),
		).toMatchObject({
			primaryHandId: 1,
			selectionStatus: "tracked",
			pointers: [{ active: true, position: { x: 0.7 } }],
		});
	});

	it("automatically acquires a fresh pointing hand after loss and never chooses a stale secondary image", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0), hand(2, 0, 0.8)]), [pose(1), pose(2)]);
		const stale = tracker.update(frame(200, [hand(2, 0, 0.8)]), [pose(2)]);
		expect(stale.primaryHandId).toBeNull();
		expect(stale.pointers[0]?.isPrimary).toBe(false);
		const fresh = tracker.update(frame(240, [hand(2, 240, 0.8)]), [pose(2)]);
		expect(fresh).toMatchObject({
			primaryHandId: 2,
			selectionStatus: "tracked",
			pointers: [{ isPrimary: true }],
		});
	});

	it("suspends on ambiguity and resumes automatically after a new pointing observation", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
		expect(tracker.update(frame(40, [], true), [])).toMatchObject({
			primaryHandId: null,
			selectionStatus: "ambiguous",
			pointers: [],
		});
		expect(tracker.update(frame(80, [hand(3, 80)]), [pose(3)])).toMatchObject({
			primaryHandId: 3,
			selectionStatus: "tracked",
			pointers: [{ isPrimary: true }],
		});
	});

	it("allows a single visible resting hand to use the pause gesture", () => {
		const tracker = createHandPointerTracker();
		expect(
			tracker.update(frame(0, [hand(1, 0)]), [pose(1, "open-palm")]),
		).toMatchObject({
			primaryHandId: 1,
			pointers: [{ active: false, isPrimary: true }],
		});
	});

	it("requires valid measurements and never activates a pointer outside the image", () => {
		const tracker = createHandPointerTracker();
		expect(
			tracker.update(frame(0, [hand(1, 0)]), [
				{ ...pose(1), measurements: null },
			]).pointers[0]?.active,
		).toBe(false);
		expect(
			tracker.update(frame(40, [hand(1, 40, 1.1)]), [pose(1)]).pointers[0]
				?.active,
		).toBe(false);
		expect(
			tracker.update(frame(80, [hand(1, 80, Number.NaN)]), [pose(1)]).pointers,
		).toEqual([]);
	});

	it("smooths each hand independently and never filters a repeated image twice", () => {
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
		expect(
			tracker.update(frame(60, [hand(2, 30, 0.8), hand(1, 30, 0.4)]), [
				pose(2),
				pose(1),
			]).pointers,
		).toEqual(moved.pointers);
		expect(initial.pointers[0]?.position.x).toBe(0.2);
	});

	it("resets filters after rest, missing observations and reset", () => {
		for (const missing of [false, true]) {
			const tracker = createHandPointerTracker();
			tracker.update(frame(0, [hand(1, 0)]), [pose(1)]);
			tracker.update(
				frame(40, [hand(1, 40, 0.2, missing ? "missing" : "tracked")]),
				[pose(1, "open-palm")],
			);
			expect(
				tracker.update(frame(80, [hand(1, 80, 0.8)]), [pose(1)]).pointers[0]
					?.position.x,
			).toBe(0.8);
			tracker.reset();
			expect(tracker.update(frame(0, []), [])).toMatchObject({
				primaryHandId: null,
				selectionStatus: "unselected",
				pointers: [],
			});
		}
	});

	it("rejects backwards timestamps without mutating the controller", () => {
		const tracker = createHandPointerTracker();
		tracker.update(frame(80, [hand(1, 80)]), [pose(1)]);
		expect(() => tracker.update(frame(40, []), [])).toThrow(RangeError);
		expect(
			tracker.update(frame(80, [hand(1, 80)]), [pose(1)]).primaryHandId,
		).toBe(1);
	});
});
