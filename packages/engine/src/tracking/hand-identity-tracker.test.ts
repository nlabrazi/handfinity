import { describe, expect, it } from "vitest";
import type { Handedness, HandObservation } from "../hand-observation";
import { createHandIdentityTracker } from "./hand-identity-tracker";

function hand(
	x: number,
	timestamp: number,
	handedness: Handedness = "unknown",
	handednessConfidence = 0.95,
): HandObservation {
	const landmarks = Array.from({ length: 21 }, () => ({ x, y: 0.3, z: 0 }));
	landmarks[0] = { x, y: 0.7, z: 0 };
	landmarks[9] = { x, y: 0.5, z: 0 };
	return { landmarks, handedness, handednessConfidence, timestamp };
}

describe("Hand identity tracking", () => {
	it("announces each hand once and preserves identities when observations reorder", () => {
		const tracker = createHandIdentityTracker();
		const first = tracker.update([hand(0.2, 0), hand(0.8, 0)], 0);
		expect(first.hands.map((item) => item.id)).toEqual([1, 2]);
		expect(first.events).toEqual([
			{ type: "hand:found", handId: 1, timestamp: 0 },
			{ type: "hand:found", handId: 2, timestamp: 0 },
		]);
		const next = tracker.update([hand(0.75, 40), hand(0.25, 40)], 40);
		expect(next.events).toEqual([]);
		expect(
			next.hands.map((item) => [item.id, item.observation.landmarks[0]?.x]),
		).toEqual([
			[1, 0.25],
			[2, 0.75],
		]);
	});

	it("preserves the first identity when a second hand enters first in the detector array", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.2, 0)], 0);
		const next = tracker.update([hand(0.8, 40), hand(0.22, 40)], 40);
		expect(
			next.hands.map((item) => [item.id, item.observation.landmarks[0]?.x]),
		).toEqual([
			[1, 0.22],
			[2, 0.8],
		]);
		expect(next.events).toEqual([
			{ type: "hand:found", handId: 2, timestamp: 40 },
		]);
	});

	it("finds a global association instead of letting the first hand claim the nearest candidate", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.3, 0), hand(0.55, 0)], 0);
		const next = tracker.update([hand(0.45, 40), hand(0.1, 40)], 40);
		expect(next.ambiguous).toBe(false);
		expect(
			next.hands.map((item) => [item.id, item.observation.landmarks[0]?.x]),
		).toEqual([
			[1, 0.1],
			[2, 0.45],
		]);
	});

	it.each([0.4, 0.99])(
		"does not swap spatially distinct hands when handedness flickers at confidence %s",
		(confidence) => {
			const tracker = createHandIdentityTracker();
			tracker.update([hand(0.2, 0, "left"), hand(0.8, 0, "right")], 0);
			const next = tracker.update(
				[hand(0.8, 40, "left", confidence), hand(0.2, 40, "right", confidence)],
				40,
			);
			expect(
				next.hands.map((item) => [item.id, item.observation.landmarks[0]?.x]),
			).toEqual([
				[1, 0.2],
				[2, 0.8],
			]);
			expect(next.events).toEqual([]);
		},
	);

	it("uses reliable handedness as supporting evidence for an otherwise uncertain association", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.3, 0, "left"), hand(0.7, 0, "right")], 0);
		const next = tracker.update([hand(0.5, 40, "right")], 40);
		expect(next.ambiguous).toBe(false);
		expect(next.hands.map((item) => [item.id, item.status])).toEqual([
			[1, "missing"],
			[2, "tracked"],
		]);
	});

	it("keeps a missing identity briefly and recovers it only near its previous position", () => {
		const tracker = createHandIdentityTracker();
		const original = tracker.update([hand(0.2, 0)], 0);
		const missing = tracker.update([], 40);
		expect(missing.hands).toMatchObject([{ id: 1, status: "missing" }]);
		expect(missing.events).toEqual([]);
		const recovered = tracker.update([hand(0.23, 100)], 100);
		expect(recovered.hands).toMatchObject([{ id: 1, status: "tracked" }]);
		expect(recovered.events).toEqual([]);
		// Les anciennes sorties doivent rester des instantanés.
		expect(original.hands[0]?.status).toBe("tracked");
		expect(original.hands[0]?.observation.timestamp).toBe(0);
		expect(missing.hands[0]?.status).toBe("missing");
	});

	it("does not attach a distant reappearance to a missing identity", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.2, 0)], 0);
		tracker.update([], 40);
		const next = tracker.update([hand(0.4, 80)], 80);
		expect(next.hands).toMatchObject([
			{ id: 1, status: "missing" },
			{ id: 2, status: "tracked" },
		]);
	});

	it("expires once after 120 ms, even without new video frames", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.2, 0)], 0);
		expect(tracker.advance(120).hands).toHaveLength(1);
		const expired = tracker.advance(121);
		expect(expired.hands).toEqual([]);
		expect(expired.events).toEqual([
			{ type: "hand:lost", handId: 1, timestamp: 121, reason: "timeout" },
		]);
		expect(tracker.advance(200).events).toEqual([]);
		expect(tracker.update([hand(0.2, 240)], 240).hands[0]?.id).toBe(2);
	});

	it("expires before matching after a long gap without an explicit missing frame", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.2, 0)], 0);
		const next = tracker.update([hand(0.2, 200)], 200);
		expect(next.hands[0]?.id).toBe(2);
		expect(next.events).toEqual([
			{ type: "hand:lost", handId: 1, timestamp: 200, reason: "timeout" },
			{ type: "hand:found", handId: 2, timestamp: 200 },
		]);
	});

	it("expires one hand without interrupting the other", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.2, 0), hand(0.8, 0)], 0);
		tracker.update([hand(0.8, 80)], 80);
		const next = tracker.update([hand(0.8, 160)], 160);
		expect(next.hands).toMatchObject([{ id: 2, status: "tracked" }]);
		expect(next.events).toMatchObject([
			{ type: "hand:lost", handId: 1, reason: "timeout" },
		]);
	});

	it("ends both identities when hands overlap and assigns fresh identities after separation", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.3, 0), hand(0.7, 0)], 0);
		const overlap = tracker.update([hand(0.48, 40), hand(0.52, 40)], 40);
		expect(overlap.ambiguous).toBe(true);
		expect(overlap.hands).toEqual([]);
		expect(overlap.events).toMatchObject([
			{ type: "hand:lost", handId: 1, reason: "ambiguous" },
			{ type: "hand:lost", handId: 2, reason: "ambiguous" },
		]);
		const stillOverlapping = tracker.update(
			[hand(0.49, 80), hand(0.51, 80)],
			80,
		);
		expect(stillOverlapping.hands).toEqual([]);
		expect(stillOverlapping.events).toEqual([]);
		const separated = tracker.update([hand(0.7, 120), hand(0.3, 120)], 120);
		expect(separated.ambiguous).toBe(false);
		expect(separated.hands.map((item) => item.id)).toEqual([3, 4]);
	});

	it("does not create identities when the initial observations overlap", () => {
		const frame = createHandIdentityTracker().update(
			[hand(0.48, 0), hand(0.52, 0)],
			0,
		);
		expect(frame.ambiguous).toBe(true);
		expect(frame.hands).toEqual([]);
		expect(frame.events).toEqual([]);
	});

	it("rejects one observation equally close to two old identities", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.3, 0), hand(0.7, 0)], 0);
		const frame = tracker.update([hand(0.5, 40)], 40);
		expect(frame.ambiguous).toBe(true);
		expect(frame.hands).toEqual([]);
		expect(frame.events).toHaveLength(2);
	});

	it("rejects two observations equally likely to continue the same identity", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.5, 0)], 0);
		const frame = tracker.update([hand(0.35, 40), hand(0.65, 40)], 40);
		expect(frame.ambiguous).toBe(true);
		expect(frame.hands).toEqual([]);
	});

	it("rejects two equally plausible complete assignments even when the observations are separated", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.3, 0), hand(0.7, 0)], 0);
		const observations = [-0.2, 0.2].map((offset) => {
			const observation = hand(0.5, 40);
			return {
				...observation,
				landmarks: observation.landmarks.map((point) => ({
					...point,
					y: point.y + offset,
				})),
			};
		});
		const frame = tracker.update(observations, 40);
		expect(frame.ambiguous).toBe(true);
		expect(frame.hands).toEqual([]);
		expect(frame.events).toHaveLength(2);
	});

	it("corrects horizontal distances for the image aspect ratio", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.2, 0)], 0, 2);
		const frame = tracker.update([hand(0.4, 40)], 40, 2);
		expect(frame.hands).toMatchObject([
			{ id: 1, status: "missing" },
			{ id: 2, status: "tracked" },
		]);
	});

	it("keeps at most two tracks when a new hand replaces a missing one", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.1, 0), hand(0.5, 0)], 0);
		tracker.update([hand(0.5, 40)], 40);
		const frame = tracker.update([hand(0.5, 80), hand(0.9, 80)], 80);
		expect(frame.hands.map((item) => item.id)).toEqual([2, 3]);
		expect(frame.events).toContainEqual({
			type: "hand:lost",
			handId: 1,
			timestamp: 80,
			reason: "replaced",
		});
	});

	it("discards malformed geometry without producing ghost identities", () => {
		const tracker = createHandIdentityTracker();
		const invalid = hand(0.2, 0);
		expect(tracker.update([{ ...invalid, landmarks: [] }], 0).hands).toEqual(
			[],
		);
		expect(tracker.update([hand(Number.NaN, 40)], 40).hands).toEqual([]);
		const flat = Array.from({ length: 21 }, () => ({ x: 0.2, y: 0.5, z: 0 }));
		expect(
			tracker.update([{ ...hand(0.2, 80), landmarks: flat }], 80).hands,
		).toEqual([]);
	});

	it("resets all state without recycling old identifiers", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.2, 100)], 100);
		tracker.reset();
		expect(tracker.advance(0)).toEqual({
			timestamp: 0,
			hands: [],
			events: [],
			ambiguous: false,
		});
		expect(tracker.update([hand(0.2, 40)], 40).hands[0]?.id).toBe(2);
	});

	it.each([15, 30, 60])(
		"keeps two identities during ordinary motion at %s fps",
		(fps) => {
			const tracker = createHandIdentityTracker();
			for (let index = 0; index <= fps; index++) {
				const timestamp = (index * 1000) / fps;
				const offset = (index / fps) * 0.1;
				const observations = [
					hand(0.2 + offset, timestamp),
					hand(0.8 - offset, timestamp),
				];
				const frame = tracker.update(
					index % 2 ? observations.reverse() : observations,
					timestamp,
				);
				expect(frame.hands.map((item) => item.id)).toEqual([1, 2]);
				expect(frame.ambiguous).toBe(false);
				if (index > 0) expect(frame.events).toEqual([]);
			}
		},
	);

	it("rejects stale observations and backward time without changing tracking state", () => {
		const tracker = createHandIdentityTracker();
		tracker.update([hand(0.2, 100)], 100);
		expect(() => tracker.update([hand(0.2, 90)], 90)).toThrow(RangeError);
		expect(() => tracker.update([hand(0.2, 100)], 110)).toThrow(RangeError);
		expect(() => tracker.advance(Number.NaN)).toThrow(RangeError);
		expect(tracker.advance(100).hands[0]?.id).toBe(1);
	});

	it("rejects an unsupported hand count and invalid image dimensions", () => {
		const tracker = createHandIdentityTracker();
		expect(() =>
			tracker.update([hand(0.1, 0), hand(0.5, 0), hand(0.9, 0)], 0),
		).toThrow(RangeError);
		expect(() => tracker.update([hand(0.2, 0)], 0, 0)).toThrow(RangeError);
	});
});
