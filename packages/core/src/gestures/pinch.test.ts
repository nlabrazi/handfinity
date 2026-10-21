import { describe, expect, it } from "vitest";
import { createPinchDetector, type HandPose, type PinchEvent } from "./pinch";

function createHand(gap: number): HandPose {
	return {
		wrist: { x: 0.5, y: 0.85 },
		middleBase: { x: 0.5, y: 0.6 },
		thumbTip: { x: 0.5, y: 0.4 },
		indexTip: { x: 0.5 + gap, y: 0.4 },
	};
}

function startPinch() {
	const detector = createPinchDetector();
	detector.update(createHand(0.04), 1, 0);
	expect(detector.update(createHand(0.04), 1, 40)?.type).toBe("pinch:start");
	return detector;
}

describe("Pinch detector", () => {
	it("requires a sustained pinch to start", () => {
		const detector = createPinchDetector();
		expect(detector.update(createHand(0.2), 1, 0)).toBeNull();
		expect(detector.update(createHand(0.2), 1, 100)).toBeNull();
		expect(detector.update(createHand(0.04), 1, 200)).toBeNull();
		expect(detector.update(createHand(0.04), 1, 239)).toBeNull();
		expect(detector.update(createHand(0.04), 1, 240)?.type).toBe("pinch:start");
	});

	it("discards a brief pinch before confirming a new one", () => {
		const detector = createPinchDetector();
		detector.update(createHand(0.04), 1, 0);
		detector.update(createHand(0.2), 1, 30);
		expect(detector.update(createHand(0.04), 1, 60)).toBeNull();
		expect(detector.update(createHand(0.04), 1, 100)?.type).toBe("pinch:start");
	});

	it("keeps an active pinch between the start and end thresholds", () => {
		const detector = startPinch();
		expect(detector.update(createHand(0.1), 1, 80)?.type).toBe("pinch:move");
		expect(detector.update(createHand(0.1), 1, 200)?.type).toBe("pinch:move");
	});

	it("pauses on isolated release noise and resumes the same stroke", () => {
		const detector = startPinch();
		expect(detector.update(createHand(0.5), 1, 80)).toBeNull();
		expect(detector.update(createHand(0.04), 1, 100)?.type).toBe("pinch:move");
		expect(detector.update(createHand(0.2), 1, 120)).toBeNull();
		expect(detector.update(createHand(0.2), 1, 179)).toBeNull();
		expect(detector.update(createHand(0.2), 1, 180)).toMatchObject({
			type: "pinch:end",
			reason: "released",
		});
		expect(detector.update(createHand(0.2), 1, 220)).toBeNull();
	});

	it("ends at the last reliable index position without emitting the release movement", () => {
		const detector = startPinch();
		const lastMove = detector.update(createHand(0.06), 1, 60);
		expect(detector.update(createHand(0.2), 1, 80)).toBeNull();
		expect(detector.update(createHand(0.3), 1, 120)).toBeNull();
		expect(detector.update(createHand(0.4), 1, 140)).toMatchObject({
			type: "pinch:end",
			reason: "released",
			position: lastMove?.position,
		});
	});

	it("reports tracking loss even while a release is pending", () => {
		const detector = startPinch();
		detector.update(createHand(0.2), 1, 80);
		expect(detector.update(null, 1, 100)).toMatchObject({
			type: "pinch:end",
			reason: "tracking-lost",
			position: { x: 0.54, y: 0.4 },
		});
		expect(detector.update(null, 1, 140)).toBeNull();
		expect(detector.update(createHand(0.04), 1, 160)).toBeNull();
	});

	it("follows the index when only the thumb moves", () => {
		const detector = startPinch();
		const hand = createHand(0.04);
		hand.thumbTip.x += 0.02;
		expect(detector.update(hand, 1, 80)?.position).toEqual({ x: 0.54, y: 0.4 });
	});

	it("corrects distances for the video aspect ratio", () => {
		const detector = createPinchDetector();
		detector.update(createHand(0.06), 2, 0);
		expect(detector.update(createHand(0.06), 2, 100)).toBeNull();
		detector.update(createHand(0.03), 2, 120);
		expect(detector.update(createHand(0.03), 2, 160)?.type).toBe("pinch:start");
	});

	it("treats a degenerate palm as tracking loss", () => {
		const detector = startPinch();
		const hand = createHand(0.04);
		hand.middleBase = hand.wrist;
		expect(detector.update(hand, 1, 80)).toMatchObject({
			type: "pinch:end",
			reason: "tracking-lost",
		});
	});

	it("does not confirm a transition across missing observations", () => {
		const detector = startPinch();
		detector.update(createHand(0.2), 1, 80);
		detector.suspend();
		expect(detector.update(createHand(0.2), 1, 160)).toBeNull();
		expect(detector.update(createHand(0.04), 1, 180)?.type).toBe("pinch:move");
	});

	it("starts fresh after reset", () => {
		const detector = startPinch();
		detector.reset();
		expect(detector.update(createHand(0.04), 1, 80)).toBeNull();
		expect(detector.update(createHand(0.04), 1, 120)?.type).toBe("pinch:start");
	});

	it.each([15, 30, 60])(
		"uses the same confirmation durations at %i fps",
		(fps) => {
			const detector = createPinchDetector();
			const interval = 1000 / fps;
			const events: PinchEvent[] = [];
			for (let frame = 0; frame <= fps; frame++) {
				const event = detector.update(
					createHand(frame < fps / 2 ? 0.04 : 0.2),
					1,
					frame * interval,
				);
				if (event) events.push(event);
			}
			const start = events.find((event) => event.type === "pinch:start");
			const end = events.find((event) => event.type === "pinch:end");
			const releaseTime = Math.ceil(fps / 2) * interval;
			expect(start?.timestamp).toBeGreaterThanOrEqual(40);
			expect(start?.timestamp).toBeLessThanOrEqual(40 + interval);
			expect(end?.timestamp).toBeGreaterThanOrEqual(releaseTime + 60);
			expect(end?.timestamp).toBeLessThanOrEqual(releaseTime + 60 + interval);
			expect(events.filter((event) => event.type === "pinch:end")).toHaveLength(
				1,
			);
		},
	);
});
