import { describe, expect, it } from "vitest";
import {
	createGestureEngine,
	createHandIdentityTracker,
	type HandObservation,
	type HandPoseKind,
	type PointerMoveCommand,
} from "./index";

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
			primaryHandId: null,
			selectionStatus: "unselected",
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

	it("automatically chooses the pointing hand while another remains visible", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		for (const time of [0, 80]) {
			const result = engine.update(
				identities.update(
					[hand("open-palm", time, -0.18), hand("pointing", time, 0.18)],
					time,
				),
			);
			if (time === 80) {
				expect(result.pointers.primaryHandId).toBe(2);
				expect(result.commands).toMatchObject([{ handId: 2, timestamp: 80 }]);
			}
		}
	});

	it("retains the existing controller when both hands point", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (time: number, left: HandPoseKind) =>
			engine.update(
				identities.update(
					[hand(left, time, -0.18), hand("pointing", time, 0.18)],
					time,
				),
			);
		observe(0, "open-palm");
		expect(observe(80, "open-palm").pointers.primaryHandId).toBe(2);
		observe(100, "pointing");
		const both = observe(180, "pointing");
		expect(both.pointers.pointers.map((pointer) => pointer.active)).toEqual([
			true,
			true,
		]);
		expect(both.pointers.primaryHandId).toBe(2);
		expect(both.commands).toMatchObject([{ handId: 2 }]);
	});

	it("lets the controlling hand pause with an open palm while the other hand points", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (time: number, kind: HandPoseKind) =>
			engine.update(
				identities.update(
					[hand(kind, time, -0.18), hand("pointing", time, 0.18)],
					time,
				),
			);
		observe(0, "pointing");
		expect(observe(80, "pointing").pointers.primaryHandId).toBe(1);
		observe(100, "open-palm");
		const opened = observe(180, "open-palm");
		expect(opened.pointers.primaryHandId).toBe(1);
		for (let time = 230; time <= 1630; time += 50)
			expect(observe(time, "open-palm").control.paused).toBe(false);
		const paused = observe(1680, "open-palm");
		expect(paused.pointers.primaryHandId).toBe(1);
		expect(paused.control.paused).toBe(true);
		expect(paused.commands).toEqual([]);
		observe(1700, "pointing");
		const released = observe(1780, "pointing");
		expect(released.pointers.primaryHandId).toBe(1);
		expect(released.control).toMatchObject({
			paused: true,
			requiresRelease: false,
		});
		observe(1800, "open-palm");
		observe(1880, "open-palm");
		for (let time = 1930; time <= 3330; time += 50)
			expect(observe(time, "open-palm").control.paused).toBe(true);
		const resumed = observe(3380, "open-palm");
		expect(resumed.pointers.primaryHandId).toBe(1);
		expect(resumed.control.paused).toBe(false);
	});

	it("hands control to the other pointing hand when the first stops pointing", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (time: number, left: HandPoseKind) =>
			engine.update(
				identities.update(
					[hand(left, time, -0.18), hand("pointing", time, 0.18)],
					time,
				),
			);
		observe(0, "pointing");
		expect(observe(80, "pointing").commands[0]?.handId).toBe(1);
		observe(100, "pinch");
		const next = observe(180, "pinch");
		expect(next.pointers.primaryHandId).toBe(2);
		expect(next.commands).toMatchObject([{ handId: 2, timestamp: 180 }]);
	});

	it("automatically resumes after loss with a new identity and a fresh confirmed point", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		engine.update(identities.update([hand("pointing", 0)], 0));
		expect(
			engine.update(identities.update([hand("pointing", 80)], 80)).commands,
		).toMatchObject([{ handId: 1 }]);
		expect(engine.update(identities.update([], 100)).commands).toEqual([]);
		const expired = engine.update(identities.advance(201));
		expect(expired.pointers.primaryHandId).toBeNull();
		expect(expired.commands).toEqual([]);
		const returned = engine.update(
			identities.update([hand("pointing", 240)], 240),
		);
		expect(returned.commands).toEqual([]);
		expect(engine.update(returned.tracking).commands).toEqual([]);
		const confirmed = engine.update(
			identities.update([hand("pointing", 320)], 320),
		);
		expect(confirmed.commands).toMatchObject([{ handId: 2, timestamp: 320 }]);
	});

	it("preserves a pause after losing the hand, then allows the new hand to resume it", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (kind: HandPoseKind, time: number) =>
			engine.update(identities.update([hand(kind, time)], time));
		observe("open-palm", 0);
		observe("open-palm", 80);
		for (let time = 130; time <= 1580; time += 50) observe("open-palm", time);
		expect(engine.getControlState().paused).toBe(true);
		observe("pointing", 1600);
		observe("pointing", 1680);
		expect(engine.update(identities.advance(1900)).control.paused).toBe(true);
		observe("open-palm", 2000);
		observe("open-palm", 2080);
		for (let time = 2130; time <= 3530; time += 50)
			expect(observe("open-palm", time).control.paused).toBe(true);
		const resumed = observe("open-palm", 3580);
		expect(resumed.control.paused).toBe(false);
		expect(resumed.pointers.primaryHandId).toBe(2);
	});

	it("does not move a point outside the image", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		engine.update(identities.update([hand("pointing", 0)], 0));
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

	it("resets ownership and posture state before a new session", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		engine.update(identities.update([hand("pointing", 0)], 0));
		expect(
			engine.update(identities.update([hand("pointing", 80)], 80)).commands,
		).toHaveLength(1);
		engine.reset();
		identities.reset();
		const restarted = engine.update(
			identities.update([hand("pointing", 0)], 0),
		);
		expect(restarted.poses[0]).toMatchObject({
			pose: "unknown",
			candidate: "pointing",
		});
		expect(restarted.commands).toEqual([]);
		expect(
			engine.update(identities.update([hand("pointing", 80)], 80)).commands,
		).toHaveLength(1);
	});

	it("produces identical automatic commands for identical observations", () => {
		function replay() {
			const identities = createHandIdentityTracker();
			const engine = createGestureEngine();
			return [0, 80, 100, 180].flatMap(
				(time) =>
					engine.update(
						identities.update(
							[
								hand(time >= 100 ? "pinch" : "pointing", time, -0.18),
								hand("pointing", time, 0.18),
							],
							time,
						),
					).commands,
			);
		}
		const commands = replay();
		expect(commands.map((command) => command.handId)).toEqual([1, 1, 2]);
		expect(replay()).toEqual(commands);
	});
});
