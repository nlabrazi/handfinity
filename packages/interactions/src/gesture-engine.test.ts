import {
	createHandIdentityTracker,
	type HandObservation,
	type HandPoseKind,
} from "@handfinity/core";
import { describe, expect, it } from "vitest";
import { createGestureEngine, type PointerMoveCommand } from "./index";

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
	it("pauses and resumes with real confirmed palms while keeping pointing observations", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (kind: HandPoseKind, timestamp: number) =>
			engine.update(identities.update([hand(kind, timestamp)], timestamp));
		observe("pointing", 0);
		engine.setPrimaryHand(1);
		expect(observe("pointing", 80).commands).toHaveLength(1);
		observe("open-palm", 100);
		observe("open-palm", 180);
		for (let time = 230; time <= 1630; time += 50)
			expect(observe("open-palm", time).control.paused).toBe(false);
		expect(observe("open-palm", 1680).control.paused).toBe(true);
		for (let time = 1730; time <= 3380; time += 50)
			expect(observe("open-palm", time).control.paused).toBe(true);
		observe("pointing", 3400);
		const pausedPoint = observe("pointing", 3480);
		expect(pausedPoint.pointers.pointers[0]?.active).toBe(true);
		expect(pausedPoint.commands).toEqual([]);
		expect(pausedPoint.control).toMatchObject({
			paused: true,
			requiresRelease: false,
		});
		observe("open-palm", 3500);
		observe("open-palm", 3580);
		for (let time = 3630; time <= 5030; time += 50)
			expect(observe("open-palm", time).control.paused).toBe(true);
		expect(observe("open-palm", 5080).control.paused).toBe(false);
		observe("pointing", 5100);
		const resumed = observe("pointing", 5180);
		expect(resumed.commands).toMatchObject([{ timestamp: 5180, handId: 1 }]);
		expect(engine.update(resumed.tracking).commands).toEqual([]);
		engine.reset();
		expect(engine.getControlState()).toEqual({
			paused: false,
			handId: null,
			holdProgress: 0,
			requiresRelease: false,
		});
	});

	it("discards a partial palm hold after loss and requires fresh confirmation", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (timestamp: number) =>
			engine.update(
				identities.update([hand("open-palm", timestamp)], timestamp),
			);
		observe(0);
		engine.setPrimaryHand(1);
		observe(80);
		for (let time = 130; time <= 780; time += 50) observe(time);
		expect(engine.update(identities.update([], 800)).control.holdProgress).toBe(
			0,
		);
		observe(830);
		observe(910);
		for (let time = 960; time <= 2360; time += 50)
			expect(observe(time).control.paused).toBe(false);
		expect(observe(2410).control.paused).toBe(true);
	});

	it("requires reselection of a newly identified hand before gesture resumption", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (kind: HandPoseKind, timestamp: number) =>
			engine.update(identities.update([hand(kind, timestamp)], timestamp));
		observe("open-palm", 0);
		engine.setPrimaryHand(1);
		observe("open-palm", 80);
		for (let time = 130; time <= 1580; time += 50) observe("open-palm", time);
		expect(engine.getControlState().paused).toBe(true);
		observe("pointing", 1600);
		observe("pointing", 1680);
		expect(engine.update(identities.advance(1900)).control.paused).toBe(true);
		observe("open-palm", 2000);
		expect(engine.getControlState().paused).toBe(true);
		engine.setPrimaryHand(2);
		observe("open-palm", 2080);
		for (let time = 2130; time <= 3530; time += 50)
			expect(observe("open-palm", time).control.paused).toBe(true);
		const resumed = observe("open-palm", 3580);
		expect(resumed.control.paused).toBe(false);
		expect(resumed.tracking.hands[0]?.id).toBe(2);
		expect(resumed.pointers.primaryHandId).toBe(2);
	});

	it("does not use a long pinch as a pause gesture", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		for (let timestamp = 0; timestamp <= 3000; timestamp += 50) {
			const result = engine.update(
				identities.update([hand("pinch", timestamp)], timestamp),
			);
			expect(result.control.paused).toBe(false);
			expect(result.control.holdProgress).toBe(0);
		}
	});

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
			engine.setPrimaryHand(1);
			expect(candidate.poses[0]).toMatchObject({
				pose: "unknown",
				candidate: "pointing",
				pending: true,
			});
			expect(candidate.pointers.pointers[0]?.active).toBe(false);
			expect(candidate.commands).toEqual([]);
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
			const command: PointerMoveCommand | undefined = pointing.commands[0];
			expect(pointing.commands).toHaveLength(1);
			expect(command).toMatchObject({
				type: "pointer:move",
				handId: 1,
				timestamp: 80,
			});
			expect(command?.position.x).toBeCloseTo(0.5 + 0.08 / aspectRatio);
			expect(command?.position.y).toBeCloseTo(0.28);

			observe("open-palm", 100);
			const resting = observe("open-palm", 180);
			expect(resting.poses[0]?.pose).toBe("open-palm");
			expect(resting.pointers.pointers[0]?.active).toBe(false);
			expect(resting.pointers.primaryHandId).toBe(1);
			expect(resting.commands).toEqual([]);

			observe("pinch", 200);
			const pinching = observe("pinch", 240);
			expect(pinching.poses[0]?.pose).toBe("pinch");
			expect(pinching.pointers.pointers[0]?.active).toBe(false);
			expect(pinching.commands).toEqual([]);
			expect(pointing.poses[0]?.pose).toBe("pointing");
			expect(pointing.pointers.pointers[0]?.active).toBe(true);
		},
	);

	it("does not confirm or filter repeated images and expires them without a new image", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		engine.update(identities.update([hand("pointing", 0)], 0));
		engine.setPrimaryHand(1);
		const repeatedCandidate = engine.update(identities.advance(80));
		expect(repeatedCandidate.poses[0]?.pose).toBe("unknown");
		expect(repeatedCandidate.pointers.pointers[0]?.active).toBe(false);
		expect(repeatedCandidate.commands).toEqual([]);

		expect(
			engine.update(identities.update([hand("pointing", 80)], 80)).commands,
		).toHaveLength(1);
		const moved = engine.update(
			identities.update([hand("pointing", 100, 0.1)], 100),
		);
		expect(moved.pointers.pointers[0]?.position.x).toBeGreaterThan(0.42);
		expect(moved.pointers.pointers[0]?.position.x).toBeLessThan(0.52);
		expect(moved.commands).toHaveLength(1);
		expect(moved.commands[0]?.position.x).toBeGreaterThan(0.48);
		expect(moved.commands[0]?.position.x).toBeLessThan(0.58);
		expect(moved.commands[0]?.timestamp).toBe(100);
		const repeated = engine.update(identities.advance(160));
		expect(repeated.poses).toEqual(moved.poses);
		expect(repeated.pointers.pointers).toEqual(moved.pointers.pointers);
		expect(repeated.commands).toEqual([]);
		expect(engine.update(repeated.tracking).commands).toEqual([]);
		expect(engine.update(repeated.tracking).pointers).toEqual(
			repeated.pointers,
		);

		const expired = engine.update(identities.advance(221));
		expect(expired.tracking.events).toMatchObject([
			{ type: "hand:lost", handId: 1, reason: "timeout" },
		]);
		expect(expired.poses).toEqual([]);
		expect(expired.commands).toEqual([]);
		expect(expired.pointers).toMatchObject({
			pointers: [],
			primaryHandId: 1,
			selectionStatus: "lost",
		});
	});

	it("keeps pointer commands when a rigid depth rotation overlaps the fingertips in 2D", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const norm = Math.hypot(0.27, 0.24);
		const axisX = 0.27 / norm;
		const axisY = 0.24 / norm;
		for (const [timestamp = 0, degrees = 0] of [
			[0, 0],
			[80, 0],
			[100, 20],
			[120, 40],
			[140, 60],
			[160, 80],
			[180, 85],
			[220, 85],
			[260, 85],
		]) {
			const observation = hand("pointing", timestamp);
			const angle = (degrees * Math.PI) / 180;
			const landmarks = observation.landmarks.map((point) => {
				const x = point.x - 0.5;
				const y = point.y - 0.5;
				const dot = axisX * x + axisY * y;
				return {
					x:
						0.5 +
						0.5 * (x * Math.cos(angle) + axisX * dot * (1 - Math.cos(angle))),
					y:
						0.5 +
						0.5 * (y * Math.cos(angle) + axisY * dot * (1 - Math.cos(angle))),
					z: 0.5 * (axisX * y - axisY * x) * Math.sin(angle),
				};
			});
			const result = engine.update(
				identities.update([{ ...observation, landmarks }], timestamp),
			);
			if (timestamp < 80) {
				engine.setPrimaryHand(1);
				continue;
			}
			expect(result.tracking.hands[0]?.id).toBe(1);
			expect(result.poses[0]).toMatchObject({
				pose: "pointing",
				candidate: "pointing",
			});
			expect(result.poses[0]?.measurements?.pinchRatio).toBeCloseTo(
				Math.hypot(0.24, 0.27) / 0.25,
			);
			expect(result.pointers.pointers[0]?.active).toBe(true);
			expect(result.commands).toMatchObject([{ handId: 1, timestamp }]);
			if (degrees === 85) {
				const thumb = landmarks[4];
				const index = landmarks[8];
				const wrist = landmarks[0];
				const middle = landmarks[9];
				if (!thumb || !index || !wrist || !middle)
					throw new Error("Missing fixture landmark");
				const projectedRatio =
					Math.hypot(thumb.x - index.x, thumb.y - index.y) /
					Math.hypot(wrist.x - middle.x, wrist.y - middle.y);
				expect(projectedRatio).toBeLessThan(0.32);
			}
		}
	});

	it("keeps both hands independent and clears an explicit choice without a fallback", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		engine.update(
			identities.update(
				[hand("pointing", 0, -0.18), hand("open-palm", 0, 0.18)],
				0,
			),
		);
		engine.setPrimaryHand(1);
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
		expect(confirmed.commands).toMatchObject([{ handId: 1, timestamp: 80 }]);
		engine.setPrimaryHand(2);
		const chosen = engine.update(identities.advance(100));
		expect(chosen.pointers).toMatchObject({
			primaryHandId: 2,
			selectionStatus: "tracked",
		});
		expect(chosen.pointers.pointers).toMatchObject([
			{ handId: 1, active: true, isPrimary: false },
			{ handId: 2, active: false, isPrimary: true },
		]);
		expect(chosen.commands).toEqual([]);
		engine.setPrimaryHand(null);
		const cleared = engine.update(identities.advance(110));
		expect(cleared.pointers).toMatchObject({
			primaryHandId: null,
			selectionStatus: "unselected",
		});
		expect(cleared.commands).toEqual([]);
		expect(confirmed.pointers.primaryHandId).toBe(1);
	});

	it("reserves a missing main hand, reconfirms it with fresh filtering, then blocks it after definite loss", () => {
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
		expect(missing.commands).toEqual([]);

		const returned = observe(120, 0.12);
		expect(returned.poses[1]).toMatchObject({
			handId: 2,
			pose: "unknown",
			candidate: "pointing",
		});
		expect(returned.pointers.pointers[1]?.active).toBe(false);
		expect(returned.commands).toEqual([]);
		const reconfirmed = observe(200, 0.12);
		expect(reconfirmed.pointers.pointers[1]).toMatchObject({
			handId: 2,
			active: true,
			isPrimary: true,
		});
		expect(reconfirmed.pointers.pointers[1]?.position.x).toBeCloseTo(0.54);
		expect(reconfirmed.commands).toMatchObject([
			{ handId: 2, timestamp: 200, position: { y: 0.28 } },
		]);
		expect(reconfirmed.commands[0]?.position.x).toBeCloseTo(0.46);

		observe(210, null);
		const expired = observe(330, null);
		expect(expired.tracking.events).toMatchObject([
			{ type: "hand:lost", handId: 2, reason: "timeout" },
		]);
		expect(expired.pointers).toMatchObject({
			primaryHandId: 2,
			selectionStatus: "lost",
			pointers: [{ handId: 1, active: true, isPrimary: false }],
		});
		expect(expired.commands).toEqual([]);
	});

	it("discards poses and blocks the selected hand after an ambiguous association", () => {
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
		expect(ambiguous.commands).toEqual([]);
		expect(ambiguous.pointers).toMatchObject({
			pointers: [],
			primaryHandId: 2,
			selectionStatus: "ambiguous",
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
		expect(recovered.commands).toEqual([]);
		const confirmed = engine.update(
			identities.update([hand("pointing", 200, 0.1)], 200),
		);
		expect(confirmed.pointers.primaryHandId).toBe(2);
		expect(confirmed.pointers.selectionStatus).toBe("lost");
		expect(confirmed.pointers.pointers[0]?.position.x).toBeCloseTo(0.52);
		expect(confirmed.commands).toEqual([]);
		engine.setPrimaryHand(3);
		expect(
			engine.update(identities.update([hand("pointing", 220, 0.1)], 220))
				.commands,
		).toMatchObject([{ handId: 3, timestamp: 220 }]);
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
			selectionStatus: "unselected",
			pointers: [{ handId: 1, active: false }],
		});
		expect(restarted.pointers.pointers[0]?.position.x).toBeCloseTo(0.42);
		expect(restarted.commands).toEqual([]);
		engine.setPrimaryHand(1);
		const reconfirmed = engine.update({
			...initial,
			timestamp: 80,
			hands: initial.hands.map((tracked) => ({
				...tracked,
				observation: hand("pointing", 80),
			})),
		});
		expect(reconfirmed.commands).toMatchObject([{ handId: 1, timestamp: 80 }]);
	});
});

describe("Shared pointer commands", () => {
	it("does not let any unselected hand move or change pause state", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		for (let time = 0; time <= 2000; time += 50) {
			const frame = engine.update(
				identities.update(
					[hand(time < 500 ? "pointing" : "open-palm", time)],
					time,
				),
			);
			expect(frame.commands).toEqual([]);
			expect(frame.control.paused).toBe(false);
			expect(frame.control.holdProgress).toBe(0);
			expect(frame.pointers.selectionStatus).toBe("unselected");
		}
	});

	it("publishes a selection immediately without replaying the image or an old move", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		engine.update(identities.update([hand("pointing", 0)], 0));
		const unselected = engine.update(
			identities.update([hand("pointing", 80)], 80),
		);
		const chosen = engine.setPrimaryHand(1);
		expect(chosen).toMatchObject({
			selectionChanged: true,
			pointers: { primaryHandId: 1, selectionStatus: "tracked" },
			commands: [],
		});
		expect(chosen?.tracking).toBe(unselected.tracking);
		expect(chosen?.pointers.pointers[0]?.isPrimary).toBe(true);
		expect(unselected.pointers.pointers[0]?.isPrimary).toBe(false);
		expect(engine.setPrimaryHand(1)?.selectionChanged).toBe(false);
		expect(engine.update(unselected.tracking).commands).toEqual([]);
		expect(
			engine.update(identities.update([hand("pointing", 100)], 100)).commands,
		).toMatchObject([{ handId: 1, timestamp: 100 }]);
		expect(engine.setPrimaryHand(null)).toMatchObject({
			selectionChanged: true,
			pointers: { primaryHandId: null, selectionStatus: "unselected" },
			commands: [],
		});
		expect(
			engine.update(identities.update([hand("pointing", 120)], 120)).commands,
		).toEqual([]);
	});

	it("cancels a partial palm hold when switching hands and preserves an acquired pause", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (time: number) =>
			engine.update(
				identities.update(
					[hand("open-palm", time, -0.18), hand("open-palm", time, 0.18)],
					time,
				),
			);
		observe(0);
		engine.setPrimaryHand(1);
		observe(80);
		for (let time = 130; time <= 780; time += 50) observe(time);
		expect(engine.getControlState().holdProgress).toBeGreaterThan(0);
		expect(engine.setPrimaryHand(2)?.control).toMatchObject({
			paused: false,
			holdProgress: 0,
		});
		for (let time = 830; time <= 2280; time += 50)
			expect(observe(time).control.paused).toBe(false);
		expect(observe(2330).control.paused).toBe(true);
		expect(engine.setPrimaryHand(1)?.control.paused).toBe(true);
		expect(engine.setPrimaryHand(null)?.control.paused).toBe(true);
	});

	it("keeps a lost selection blocked even when the same handedness reappears", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observed = (time: number) => ({
			...hand("pointing", time),
			handedness: "right" as const,
			handednessConfidence: 0.99,
		});
		engine.update(identities.update([observed(0)], 0));
		engine.setPrimaryHand(1);
		expect(
			engine.update(identities.update([observed(80)], 80)).commands,
		).toHaveLength(1);
		engine.update(identities.advance(201));
		for (const time of [240, 320, 400]) {
			const frame = engine.update(identities.update([observed(time)], time));
			expect(frame.pointers).toMatchObject({
				primaryHandId: 1,
				selectionStatus: "lost",
			});
			expect(frame.commands).toEqual([]);
		}
		expect(() => engine.setPrimaryHand(1)).toThrow(RangeError);
		engine.setPrimaryHand(2);
		expect(
			engine.update(identities.update([observed(440)], 440)).commands,
		).toMatchObject([{ handId: 2 }]);
	});

	it("rejects an unavailable choice without clearing the current owner or palm hold", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		expect(() => engine.setPrimaryHand(1)).toThrow(RangeError);
		expect(engine.setPrimaryHand(null)).toBeNull();
		engine.update(identities.update([hand("open-palm", 0)], 0));
		engine.setPrimaryHand(1);
		for (let time = 50; time <= 800; time += 50)
			engine.update(identities.update([hand("open-palm", time)], time));
		const prior = engine.getControlState();
		expect(() => engine.setPrimaryHand(2)).toThrow(RangeError);
		expect(engine.getControlState()).toEqual(prior);
	});

	it("emits once per fresh image and waits for a new image after a main-hand change", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		function tracking(timestamp: number) {
			return identities.update(
				[hand("pointing", timestamp, -0.18), hand("pointing", timestamp, 0.18)],
				timestamp,
			);
		}
		engine.update(tracking(0));
		engine.setPrimaryHand(1);
		const image = tracking(80);
		const first = engine.update(image);
		expect(first.commands).toMatchObject([{ handId: 1, timestamp: 80 }]);
		expect(engine.update(image).commands).toEqual([]);
		engine.setPrimaryHand(2);
		expect(engine.update(image).commands).toEqual([]);
		expect(engine.update(identities.advance(100)).commands).toEqual([]);
		const next = engine.update(tracking(100));
		expect(next.commands).toMatchObject([{ handId: 2, timestamp: 100 }]);
		expect(first.commands).toMatchObject([{ handId: 1, timestamp: 80 }]);
	});

	it("consumes fresh images without commands before selecting another hand", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		function tracking(timestamp: number) {
			return identities.update(
				[
					hand("open-palm", timestamp, -0.18),
					hand("pointing", timestamp, 0.18),
				],
				timestamp,
			);
		}
		engine.update(tracking(0));
		engine.setPrimaryHand(2);
		expect(engine.update(tracking(80)).commands).toMatchObject([
			{ handId: 2, timestamp: 80 },
		]);
		engine.setPrimaryHand(1);
		const resting = tracking(100);
		expect(engine.update(resting).commands).toEqual([]);
		engine.setPrimaryHand(2);
		expect(engine.update(resting).commands).toEqual([]);
		expect(engine.update(tracking(120)).commands).toMatchObject([
			{ handId: 2, timestamp: 120 },
		]);
	});

	it("does not transfer movement from an expired main hand using a stale secondary image", () => {
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
		engine.setPrimaryHand(1);
		const missing = engine.update(
			identities.update([hand("pointing", 100, 0.18)], 100),
		);
		expect(missing.pointers.primaryHandId).toBe(1);
		expect(missing.commands).toEqual([]);
		const expired = engine.update(identities.advance(201));
		expect(expired.pointers.primaryHandId).toBe(1);
		expect(expired.pointers.selectionStatus).toBe("lost");
		expect(expired.pointers.pointers[0]?.active).toBe(true);
		expect(expired.commands).toEqual([]);
		expect(
			engine.update(identities.update([hand("pointing", 210, 0.18)], 210))
				.commands,
		).toEqual([]);
	});

	it("does not move an out-of-image pointer even while pointing stays confirmed", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		engine.update(identities.update([hand("pointing", 0)], 0));
		engine.setPrimaryHand(1);
		engine.update(identities.update([hand("pointing", 80)], 80));
		const outside = hand("pointing", 100);
		const frame = engine.update(
			identities.update(
				[
					{
						...outside,
						landmarks: outside.landmarks.map((point, index) =>
							index === 8 ? { ...point, x: -0.1 } : point,
						),
					},
				],
				100,
			),
		);
		expect(frame.poses[0]?.pose).toBe("pointing");
		expect(frame.pointers.pointers[0]?.active).toBe(false);
		expect(frame.commands).toEqual([]);
	});

	it("produces identical commands for identical observations and main-hand choices", () => {
		function replay() {
			const identities = createHandIdentityTracker();
			const engine = createGestureEngine();
			const commands: PointerMoveCommand[] = [];
			for (const timestamp of [0, 80, 100, 140]) {
				if (timestamp === 80) engine.setPrimaryHand(1);
				if (timestamp === 100) engine.setPrimaryHand(2);
				commands.push(
					...engine.update(
						identities.update(
							[
								hand("pointing", timestamp, -0.18),
								hand("pointing", timestamp, timestamp > 80 ? 0.14 : 0.18),
							],
							timestamp,
						),
					).commands,
				);
				commands.push(
					...engine.update(identities.advance(timestamp + 10)).commands,
				);
			}
			return commands;
		}
		const commands = replay();
		expect(commands).toHaveLength(3);
		expect(commands.map((command) => command.handId)).toEqual([1, 2, 2]);
		expect(replay()).toEqual(commands);
	});
});
