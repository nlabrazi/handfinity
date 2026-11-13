import { describe, expect, it } from "vitest";
import type { HandObservation } from "../hand-observation";
import type {
	HandTrackingFrame,
	TrackedHand,
} from "../tracking/hand-identity-tracker";
import {
	BIMANUAL_COOLDOWN_MS,
	createBimanualGestureTracker,
	MAX_BIMANUAL_WINDOW_MS,
	MIN_TOGETHER_CONFIRM_MS,
} from "./bimanual-gestures";

function makeHandAt(
	centerX: number,
	centerY: number,
	timestamp: number,
): HandObservation {
	// Landmarks [0, 5, 9, 13, 17] average to (centerX, centerY)
	const landmarks = Array.from({ length: 21 }, () => ({
		x: centerX,
		y: centerY,
		z: 0,
	}));
	return {
		landmarks,
		timestamp,
		handedness: "unknown",
		handednessConfidence: null,
	};
}

function makeTrackingFrame(
	timestamp: number,
	hands: { id: number; x: number; y: number }[],
	ambiguous = false,
): HandTrackingFrame {
	const tracked: TrackedHand[] = hands.map((h) => ({
		id: h.id,
		status: "tracked",
		observation: makeHandAt(h.x, h.y, timestamp),
	}));
	return {
		timestamp,
		hands: tracked,
		events: [],
		ambiguous,
	};
}

describe("Bimanual gesture tracker (palms together then apart)", () => {
	it("triggers keyboardToggle when two palms come close together and then spread apart", () => {
		const tracker = createBimanualGestureTracker();

		// Hands are initially far apart (x=0.2 and x=0.8, dist = 0.60)
		const frame0 = tracker.update(
			makeTrackingFrame(0, [
				{ id: 1, x: 0.2, y: 0.5 },
				{ id: 2, x: 0.8, y: 0.5 },
			]),
		);
		expect(frame0.phase).toBe("idle");
		expect(frame0.keyboardToggle).toBe(false);

		// Hands come together (x=0.45 and x=0.55, dist = 0.10 <= 0.22)
		const frame100 = tracker.update(
			makeTrackingFrame(100, [
				{ id: 1, x: 0.45, y: 0.5 },
				{ id: 2, x: 0.55, y: 0.5 },
			]),
		);
		expect(frame100.phase).toBe("idle"); // Needs confirmation >= 80 ms

		// Confirmation reached at 100 + 80 = 180 ms
		const frame180 = tracker.update(
			makeTrackingFrame(100 + MIN_TOGETHER_CONFIRM_MS, [
				{ id: 1, x: 0.45, y: 0.5 },
				{ id: 2, x: 0.55, y: 0.5 },
			]),
		);
		expect(frame180.phase).toBe("palms-together");
		expect(frame180.progress).toBe(0.5);
		expect(frame180.keyboardToggle).toBe(false);

		// Hands spread apart (x=0.25 and x=0.75, dist = 0.50 >= 0.38) within window
		const frame300 = tracker.update(
			makeTrackingFrame(300, [
				{ id: 1, x: 0.25, y: 0.5 },
				{ id: 2, x: 0.75, y: 0.5 },
			]),
		);
		expect(frame300.phase).toBe("cooldown");
		expect(frame300.keyboardToggle).toBe(true);
		expect(frame300.progress).toBe(1);

		// During cooldown, subsequent frames do not re-trigger
		const frame400 = tracker.update(
			makeTrackingFrame(400, [
				{ id: 1, x: 0.45, y: 0.5 },
				{ id: 2, x: 0.55, y: 0.5 },
			]),
		);
		expect(frame400.phase).toBe("cooldown");
		expect(frame400.keyboardToggle).toBe(false);

		// After cooldown (300 + 1500 = 1800 ms), returns to idle
		const frame1850 = tracker.update(
			makeTrackingFrame(300 + BIMANUAL_COOLDOWN_MS + 50, [
				{ id: 1, x: 0.2, y: 0.5 },
				{ id: 2, x: 0.8, y: 0.5 },
			]),
		);
		expect(frame1850.phase).toBe("idle");
		expect(frame1850.keyboardToggle).toBe(false);
	});

	it("times out if hands stay together longer than MAX_BIMANUAL_WINDOW_MS", () => {
		const tracker = createBimanualGestureTracker();

		tracker.update(
			makeTrackingFrame(0, [
				{ id: 1, x: 0.48, y: 0.5 },
				{ id: 2, x: 0.52, y: 0.5 },
			]),
		);
		tracker.update(
			makeTrackingFrame(MIN_TOGETHER_CONFIRM_MS, [
				{ id: 1, x: 0.48, y: 0.5 },
				{ id: 2, x: 0.52, y: 0.5 },
			]),
		);

		// Hands stay together past MAX_BIMANUAL_WINDOW_MS
		const expired = tracker.update(
			makeTrackingFrame(MIN_TOGETHER_CONFIRM_MS + MAX_BIMANUAL_WINDOW_MS + 50, [
				{ id: 1, x: 0.48, y: 0.5 },
				{ id: 2, x: 0.52, y: 0.5 },
			]),
		);
		expect(expired.phase).toBe("idle");
		expect(expired.keyboardToggle).toBe(false);
	});

	it("ignores frames with only one hand or ambiguous tracking", () => {
		const tracker = createBimanualGestureTracker();

		const single = tracker.update(
			makeTrackingFrame(0, [{ id: 1, x: 0.5, y: 0.5 }]),
		);
		expect(single.phase).toBe("idle");
		expect(single.distance).toBeNull();

		const ambiguous = tracker.update(
			makeTrackingFrame(
				50,
				[
					{ id: 1, x: 0.5, y: 0.5 },
					{ id: 2, x: 0.5, y: 0.5 },
				],
				true,
			),
		);
		expect(ambiguous.phase).toBe("idle");
		expect(ambiguous.distance).toBeNull();
	});
});
