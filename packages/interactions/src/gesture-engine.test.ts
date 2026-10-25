import {
	createHandIdentityTracker,
	type HandObservation,
	type HandPoseKind,
} from "@handfinity/core";
import { describe, expect, it } from "vitest";
import { createGestureEngine } from "./index";

function hand(
	kind: HandPoseKind,
	timestamp: number,
	offset = 0,
	aspectRatio = 1,
): HandObservation {
	const landmarks = [
		[0.5, 0.85],
		[0.4, 0.76],
		[0.3, 0.69],
		[0.24, 0.62],
		[0.18, 0.55],
		[0.42, 0.6],
		[0.42, 0.46],
		[0.42, 0.36],
		[0.42, 0.28],
		[0.5, 0.6],
		[0.5, 0.43],
		[0.5, 0.32],
		[0.5, 0.23],
		[0.58, 0.61],
		[0.58, 0.46],
		[0.58, 0.36],
		[0.58, 0.28],
		[0.65, 0.65],
		[0.65, 0.53],
		[0.65, 0.44],
		[0.65, 0.36],
	].map(([x = 0, y = 0]) => ({ x, y, z: 0 }));
	if (kind === "pointing") {
		for (const base of [9, 13, 17]) {
			const root = landmarks[base];
			if (!root) throw new Error("Missing fixture landmark");
			landmarks[base + 1] = { x: root.x, y: root.y - 0.14, z: 0 };
			landmarks[base + 2] = { x: root.x + 0.01, y: root.y, z: 0 };
			landmarks[base + 3] = { x: root.x + 0.01, y: root.y + 0.08, z: 0 };
		}
	}
	if (kind === "pinch") landmarks[4] = { x: 0.43, y: 0.28, z: 0 };
	return {
		landmarks: landmarks.map((point) => ({
			...point,
			x: 0.5 + (point.x - 0.5) / aspectRatio + offset,
			z: point.z / aspectRatio,
		})),
		timestamp,
		handedness: "unknown",
		handednessConfidence: null,
	};
}

describe("Shared gesture engine", () => {
	it.each([1, 16 / 9])(
		"connects real pose transitions to pointers at aspect ratio %s",
		(aspectRatio) => {
			const identities = createHandIdentityTracker();
			const engine = createGestureEngine();
			function observe(kind: HandPoseKind, timestamp: number) {
				const tracking = identities.update(
					[hand(kind, timestamp, 0, aspectRatio)],
					timestamp,
					aspectRatio,
				);
				const result = engine.update(tracking, aspectRatio);
				expect(result.tracking).toBe(tracking);
				return result;
			}

			const candidate = observe("pointing", 0);
			expect(candidate.poses[0]).toMatchObject({
				pose: "unknown",
				candidate: "pointing",
				pending: true,
			});
			expect(candidate.pointers.pointers[0]?.active).toBe(false);
			expect(candidate.poses[0]?.measurements?.pinchRatio).toBeCloseTo(
				Math.hypot(0.24, 0.27) / 0.25,
			);
			const pointing = observe("pointing", 80);
			expect(pointing.poses[0]?.pose).toBe("pointing");
			expect(pointing.pointers.pointers[0]).toMatchObject({
				handId: 1,
				active: true,
				isPrimary: true,
			});

			observe("open-palm", 100);
			const resting = observe("open-palm", 180);
			expect(resting.poses[0]?.pose).toBe("open-palm");
			expect(resting.pointers.pointers[0]?.active).toBe(false);
			expect(resting.pointers.primaryHandId).toBe(1);

			observe("pinch", 200);
			const pinching = observe("pinch", 240);
			expect(pinching.poses[0]?.pose).toBe("pinch");
			expect(pinching.pointers.pointers[0]?.active).toBe(false);
			expect(pointing.poses[0]?.pose).toBe("pointing");
			expect(pointing.pointers.pointers[0]?.active).toBe(true);
		},
	);

	it("does not confirm or filter repeated images and expires them without a new image", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		engine.update(identities.update([hand("pointing", 0)], 0));
		const repeatedCandidate = engine.update(identities.advance(80));
		expect(repeatedCandidate.poses[0]?.pose).toBe("unknown");
		expect(repeatedCandidate.pointers.pointers[0]?.active).toBe(false);

		engine.update(identities.update([hand("pointing", 80)], 80));
		const moved = engine.update(
			identities.update([hand("pointing", 100, 0.1)], 100),
		);
		expect(moved.pointers.pointers[0]?.position.x).toBeGreaterThan(0.42);
		expect(moved.pointers.pointers[0]?.position.x).toBeLessThan(0.52);
		const repeated = engine.update(identities.advance(160));
		expect(repeated.poses).toEqual(moved.poses);
		expect(repeated.pointers.pointers).toEqual(moved.pointers.pointers);
		expect(engine.update(repeated.tracking).pointers).toEqual(
			repeated.pointers,
		);

		const expired = engine.update(identities.advance(221));
		expect(expired.tracking.events).toMatchObject([
			{ type: "hand:lost", handId: 1, reason: "timeout" },
		]);
		expect(expired.poses).toEqual([]);
		expect(expired.pointers).toMatchObject({
			pointers: [],
			primaryHandId: null,
			preferredHandId: null,
		});
	});

	it("keeps both hands independent and applies explicit and automatic choices", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		engine.update(
			identities.update(
				[hand("pointing", 0, -0.18), hand("open-palm", 0, 0.18)],
				0,
			),
		);
		const confirmed = engine.update(
			identities.update(
				[hand("open-palm", 80, 0.18), hand("pointing", 80, -0.18)],
				80,
			),
		);
		expect(confirmed.poses).toMatchObject([
			{ handId: 1, pose: "pointing" },
			{ handId: 2, pose: "open-palm" },
		]);
		expect(confirmed.pointers.primaryHandId).toBe(1);
		engine.setPrimaryHand(2);
		const chosen = engine.update(identities.advance(100));
		expect(chosen.pointers).toMatchObject({
			primaryHandId: 2,
			preferredHandId: 2,
		});
		expect(chosen.pointers.pointers).toMatchObject([
			{ handId: 1, active: true, isPrimary: false },
			{ handId: 2, active: false, isPrimary: true },
		]);
		engine.setPrimaryHand(null);
		const automatic = engine.update(identities.advance(110));
		expect(automatic.pointers).toMatchObject({
			primaryHandId: 1,
			preferredHandId: null,
		});
		expect(confirmed.pointers.primaryHandId).toBe(1);
	});

	it("reserves a missing main hand, reconfirms it with fresh filtering, then releases it on loss", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		function observe(timestamp: number, rightOffset: number | null) {
			const observations = [hand("pointing", timestamp, -0.18)];
			if (rightOffset !== null)
				observations.push(hand("pointing", timestamp, rightOffset));
			return engine.update(identities.update(observations, timestamp));
		}
		observe(0, 0.18);
		observe(80, 0.18);
		engine.setPrimaryHand(2);
		const moved = observe(100, 0.14);
		expect(moved.pointers.pointers[1]?.position.x).toBeGreaterThan(0.56);
		expect(moved.pointers.pointers[1]?.position.x).toBeLessThan(0.6);

		const missing = observe(110, null);
		expect(missing.poses).toMatchObject([
			{ handId: 1, pose: "pointing" },
			{ handId: 2, status: "missing", pose: "unknown", measurements: null },
		]);
		expect(missing.pointers.primaryHandId).toBe(2);
		expect(missing.pointers.pointers).toMatchObject([
			{ handId: 1, active: true, isPrimary: false },
		]);
		expect(missing.pointers.pointers).toHaveLength(1);

		const returned = observe(120, 0.12);
		expect(returned.poses[1]).toMatchObject({
			handId: 2,
			pose: "unknown",
			candidate: "pointing",
		});
		expect(returned.pointers.pointers[1]?.active).toBe(false);
		const reconfirmed = observe(200, 0.12);
		expect(reconfirmed.pointers.pointers[1]).toMatchObject({
			handId: 2,
			active: true,
			isPrimary: true,
		});
		expect(reconfirmed.pointers.pointers[1]?.position.x).toBeCloseTo(0.54);

		observe(210, null);
		const expired = observe(330, null);
		expect(expired.tracking.events).toMatchObject([
			{ type: "hand:lost", handId: 2, reason: "timeout" },
		]);
		expect(expired.pointers).toMatchObject({
			primaryHandId: 1,
			preferredHandId: null,
			pointers: [{ handId: 1, active: true, isPrimary: true }],
		});
	});

	it("discards poses and the selected main hand after an ambiguous association", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		for (const timestamp of [0, 80]) {
			engine.update(
				identities.update(
					[
						hand("pointing", timestamp, -0.18),
						hand("pointing", timestamp, 0.18),
					],
					timestamp,
				),
			);
		}
		engine.setPrimaryHand(2);
		const ambiguous = engine.update(
			identities.update([hand("pointing", 100), hand("pointing", 100)], 100),
		);
		expect(ambiguous.tracking.ambiguous).toBe(true);
		expect(ambiguous.poses).toEqual([]);
		expect(ambiguous.pointers).toMatchObject({
			pointers: [],
			primaryHandId: null,
			preferredHandId: null,
		});
		const recovered = engine.update(
			identities.update([hand("pointing", 120, 0.1)], 120),
		);
		expect(recovered.poses[0]).toMatchObject({
			handId: 3,
			pose: "unknown",
			candidate: "pointing",
		});
		expect(recovered.pointers.pointers[0]?.active).toBe(false);
		const confirmed = engine.update(
			identities.update([hand("pointing", 200, 0.1)], 200),
		);
		expect(confirmed.pointers.primaryHandId).toBe(3);
		expect(confirmed.pointers.pointers[0]?.position.x).toBeCloseTo(0.52);
	});

	it("resets every stage before restarting with the same identities and a fresh clock", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const initial = identities.update([hand("pointing", 0)], 0);
		engine.update(initial);
		engine.update(identities.update([hand("pointing", 80)], 80));
		engine.setPrimaryHand(1);
		engine.update(identities.update([hand("pointing", 100, 0.1)], 100));

		engine.reset();
		const restarted = engine.update(initial);
		expect(restarted.poses[0]).toMatchObject({
			pose: "unknown",
			candidate: "pointing",
			pending: true,
		});
		expect(restarted.pointers).toMatchObject({
			timestamp: 0,
			primaryHandId: null,
			preferredHandId: null,
			pointers: [{ handId: 1, active: false }],
		});
		expect(restarted.pointers.pointers[0]?.position.x).toBeCloseTo(0.42);
	});
});
