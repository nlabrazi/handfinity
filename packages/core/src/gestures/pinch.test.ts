import { describe, expect, it } from "vitest";
import { createPinchDetector, type HandPose } from "./pinch";

function createHand(gap: number): HandPose {
	return {
		wrist: { x: 0.5, y: 0.85 },
		middleBase: { x: 0.5, y: 0.6 },
		thumbTip: { x: 0.5, y: 0.4 },
		indexTip: { x: 0.5 + gap, y: 0.4 },
	};
}

describe("Pinch detector", () => {
	it("does not trigger when fingers are separated", () => {
		const detector = createPinchDetector();

		expect(detector.update(createHand(0.2))).toBeNull();
		expect(detector.update(createHand(0.2))).toBeNull();
	});

	it("emits start then move when pinching", () => {
		const detector = createPinchDetector();
		const hand = createHand(0.04);

		expect(detector.update(hand)).toBeNull();
		expect(detector.update(hand)?.type).toBe("pinch:start");
		expect(detector.update(hand)?.type).toBe("pinch:move");
	});

	it("emits end when fingers separate", () => {
		const detector = createPinchDetector();

		detector.update(createHand(0.04));
		detector.update(createHand(0.04));

		const events = Array.from(
			{ length: 8 },
			() => detector.update(createHand(0.2))?.type,
		);

		expect(events).toContain("pinch:end");
	});

	it("ends the gesture when the hand disappears", () => {
		const detector = createPinchDetector();

		detector.update(createHand(0.04));
		detector.update(createHand(0.04));

		expect(detector.update(null)?.type).toBe("pinch:end");
		expect(detector.update(null)).toBeNull();
	});
});
