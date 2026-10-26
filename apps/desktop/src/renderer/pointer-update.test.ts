import {
	createHandIdentityTracker,
	type HandObservation,
} from "@handfinity/core";
import {
	createGestureEngine,
	type GestureEngineFrame,
} from "@handfinity/interactions";
import { describe, expect, it, vi } from "vitest";
import { createPointerSimulation } from "../../../playground/src/pointer-simulation";
import { createPointerController } from "../pointer-controller";
import { toPointerUpdate } from "./pointer-update";

function hand(
	pose: "pointing" | "open-palm",
	timestamp: number,
	offset = 0,
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
	].map(([x = 0, y = 0]) => ({ x: x + offset, y, z: 0 }));
	if (pose === "pointing") {
		for (const base of [9, 13, 17]) {
			const root = landmarks[base];
			if (!root) throw new Error("Missing fixture landmark");
			landmarks[base + 1] = { x: root.x, y: root.y - 0.14, z: 0 };
			landmarks[base + 2] = { x: root.x + 0.01, y: root.y, z: 0 };
			landmarks[base + 3] = { x: root.x + 0.01, y: root.y + 0.08, z: 0 };
		}
	}
	return {
		landmarks,
		timestamp,
		handedness: "unknown",
		handednessConfidence: null,
	};
}

function setup() {
	const identities = createHandIdentityTracker();
	const engine = createGestureEngine();
	function observe(
		timestamp: number,
		observations: HandObservation[] = [hand("pointing", timestamp)],
	) {
		return engine.update(identities.update(observations, timestamp));
	}
	observe(0);
	const pointing = observe(80);
	expect(pointing.commands).toHaveLength(1);
	return { identities, engine, observe, pointing };
}

describe("Desktop pointer updates from the shared engine", () => {
	it("keeps simulation and native execution paused through pointing and loss, then resumes from a fresh target", async () => {
		vi.useFakeTimers();
		const epoch = 1_800_000_000_000;
		vi.setSystemTime(epoch + 80);
		const { observe, pointing } = setup();
		const simulation = createPointerSimulation();
		const driver = {
			start: vi.fn(async () => {}),
			move: vi.fn(async () => true),
			stop: vi.fn(),
		};
		const controller = createPointerController({
			supported: true,
			driver,
			getBounds: () => ({ x: 0, y: 0, width: 1001, height: 1001 }),
			registerStop: () => true,
			unregisterStop() {},
			onState() {},
		});
		try {
			const { sessionId } = await controller.enable();
			if (sessionId === null)
				throw new Error("Native test session did not start");
			async function publish(frame: GestureEngineFrame) {
				simulation.execute(frame.commands);
				const packet = toPointerUpdate(frame, sessionId, epoch);
				if (packet) controller.submit(packet);
				await Promise.resolve();
				await Promise.resolve();
				return frame;
			}
			let now = 80;
			async function sample(
				time: number,
				kind: "pointing" | "open-palm",
				present = true,
			) {
				await vi.advanceTimersByTimeAsync(time - now);
				now = time;
				return publish(
					observe(
						time,
						present ? [hand(kind, time, time >= 1700 ? 0.06 : 0)] : [],
					),
				);
			}
			await publish(pointing);
			expect(driver.move).toHaveBeenCalledOnce();
			await sample(100, "open-palm");
			await sample(180, "open-palm");
			for (let time = 230; time <= 1680; time += 50)
				await sample(time, "open-palm");
			expect(controller.getState()).toMatchObject({
				phase: "paused",
				sessionId,
			});
			const position = simulation.execute([]).position;
			const count = simulation.execute([]).commandCount;
			const nativeCount = driver.move.mock.calls.length;
			await sample(1700, "pointing");
			const pointed = await sample(1780, "pointing");
			expect(pointed.pointers.pointers[0]?.active).toBe(true);
			expect(pointed.commands).toEqual([]);
			await sample(1850, "pointing", false);
			await sample(2000, "pointing", false);
			expect(controller.getState().phase).toBe("paused");
			expect(simulation.execute([])).toMatchObject({
				position,
				commandCount: count,
			});
			expect(driver.move).toHaveBeenCalledTimes(nativeCount);
			await sample(2100, "open-palm");
			await sample(2180, "open-palm");
			for (let time = 2230; time <= 3680; time += 50)
				await sample(time, "open-palm");
			expect(controller.getState().phase).toBe("waiting");
			expect(driver.move).toHaveBeenCalledTimes(nativeCount);
			await sample(3700, "pointing");
			const resumed = await sample(3780, "pointing");
			const target = resumed.commands[0]?.position;
			if (!target) throw new Error("Missing resumed command");
			expect(simulation.execute([]).position).toBe(target);
			expect(driver.move).toHaveBeenLastCalledWith(
				{ x: Math.round(target.x * 1000), y: Math.round(target.y * 1000) },
				epoch + 3780 + 250,
			);
			expect(controller.getState().phase).toBe("moving");
			controller.disable();
			const stoppedCount = driver.move.mock.calls.length;
			await sample(3830, "pointing");
			expect(controller.getState().phase).toBe("disabled");
			expect(driver.move).toHaveBeenCalledTimes(stoppedCount);
		} finally {
			controller.disable();
			vi.useRealTimers();
		}
	});

	it("preserves the command and its mirror using the frame capture time", () => {
		const { pointing } = setup();
		const update = toPointerUpdate(pointing, 7, 10_000);
		expect(update).toMatchObject({ sessionId: 7, capturedAt: 10_080 });
		expect(update?.command).toBe(pointing.commands[0]);
		expect(update?.command?.position.x).toBeCloseTo(0.58);
		expect(update?.command?.position.y).toBeCloseTo(0.28);
	});

	it("does not send or refresh a command for repeated active images", () => {
		const { engine, identities, pointing } = setup();
		const repeated = engine.update(pointing.tracking);
		const advanced = engine.update(identities.advance(160));
		for (const frame of [repeated, advanced]) {
			expect(frame.commands).toEqual([]);
			expect(frame.pointers.pointers).toMatchObject([
				{ isPrimary: true, active: true, timestamp: 80 },
			]);
			expect(toPointerUpdate(frame, 7, 10_000)).toBeNull();
		}
		expect(pointing.commands).toHaveLength(1);
	});

	it("suspends an expired identity instead of replaying its last observation", () => {
		const { engine, identities } = setup();
		const expired = engine.update(identities.advance(201));
		expect(expired.tracking.events).toMatchObject([
			{ type: "hand:lost", reason: "timeout" },
		]);
		expect(toPointerUpdate(expired, 7, 10_000)).toEqual({
			sessionId: 7,
			capturedAt: 10_201,
			paused: false,
			command: null,
		});
	});

	it("suspends immediately when a fresh image loses the main hand", () => {
		const { observe } = setup();
		const missing = observe(100, []);
		expect(missing.tracking.hands).toMatchObject([{ status: "missing" }]);
		expect(toPointerUpdate(missing, 7, 10_000)).toEqual({
			sessionId: 7,
			capturedAt: 10_100,
			paused: false,
			command: null,
		});
	});

	it("suspends when the shared engine confirms a resting posture", () => {
		const { observe } = setup();
		observe(100, [hand("open-palm", 100)]);
		const resting = observe(180, [hand("open-palm", 180)]);
		expect(resting.poses[0]?.pose).toBe("open-palm");
		expect(toPointerUpdate(resting, 7, 10_000)?.command).toBeNull();
	});

	it("suspends on ambiguity between two previously active hands", () => {
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
		const ambiguous = engine.update(
			identities.update([hand("pointing", 100), hand("pointing", 100)], 100),
		);
		expect(ambiguous.tracking.ambiguous).toBe(true);
		expect(toPointerUpdate(ambiguous, 7, 10_000)?.command).toBeNull();
	});

	it("does not treat an active secondary hand as active primary control", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		for (const timestamp of [0, 80]) {
			engine.update(
				identities.update(
					[
						hand("pointing", timestamp, -0.18),
						hand("open-palm", timestamp, 0.18),
					],
					timestamp,
				),
			);
		}
		engine.setPrimaryHand(2);
		const restingPrimary = engine.update(identities.advance(100));
		expect(restingPrimary.pointers.pointers).toMatchObject([
			{ isPrimary: false, active: true },
			{ isPrimary: true, active: false },
		]);
		expect(toPointerUpdate(restingPrimary, 7, 10_000)?.command).toBeNull();
	});
});
