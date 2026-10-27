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

describe("Desktop updates with automatic hand control", () => {
	it("forwards a fresh mirrored command with its image timestamp", () => {
		const { pointing } = setup();
		const update = toPointerUpdate(pointing, 7, 10_000);
		expect(update).toMatchObject({ sessionId: 7, capturedAt: 10_080 });
		expect(update?.command).toBe(pointing.commands[0]);
		expect(update?.command?.position.x).toBeCloseTo(0.58);
		expect(update?.command?.position.y).toBeCloseTo(0.28);
	});

	it("does not replay or refresh repeated active images", () => {
		const { engine, identities, pointing } = setup();
		for (const frame of [
			engine.update(pointing.tracking),
			engine.update(identities.advance(160)),
		]) {
			expect(frame.commands).toEqual([]);
			expect(toPointerUpdate(frame, 7, 10_000)).toBeNull();
		}
	});

	it("suspends immediately on a missing hand and on expiry", () => {
		const { observe, identities, engine } = setup();
		const missing = observe(100, []);
		expect(toPointerUpdate(missing, 7, 10_000)).toEqual({
			sessionId: 7,
			capturedAt: 10_100,
			paused: false,
			command: null,
		});
		const expired = engine.update(identities.advance(201));
		expect(toPointerUpdate(expired, 7, 10_000)).toEqual({
			sessionId: 7,
			capturedAt: 10_201,
			paused: false,
			command: null,
		});
	});

	it("suspends when the controlling hand stops pointing or tracking is ambiguous", () => {
		const { observe } = setup();
		observe(100, [hand("open-palm", 100)]);
		const resting = observe(180, [hand("open-palm", 180)]);
		expect(toPointerUpdate(resting, 7, 10_000)?.command).toBeNull();
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		for (const timestamp of [0, 80])
			engine.update(
				identities.update(
					[
						hand("pointing", timestamp, -0.18),
						hand("pointing", timestamp, 0.18),
					],
					timestamp,
				),
			);
		const ambiguous = engine.update(
			identities.update([hand("pointing", 100), hand("pointing", 100)], 100),
		);
		expect(ambiguous.tracking.ambiguous).toBe(true);
		expect(toPointerUpdate(ambiguous, 7, 10_000)?.command).toBeNull();
	});

	it("keeps the first pointing hand when both point, then transfers on fresh loss", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		for (const time of [0, 80]) {
			const frame = engine.update(
				identities.update(
					[hand("pointing", time, -0.18), hand("pointing", time, 0.18)],
					time,
				),
			);
			if (time === 80) expect(frame.commands[0]?.handId).toBe(1);
		}
		const transferred = engine.update(
			identities.update([hand("pointing", 100, 0.18)], 100),
		);
		expect(transferred.pointers.primaryHandId).toBe(2);
		expect(toPointerUpdate(transferred, 7, 10_000)?.command).toMatchObject({
			handId: 2,
			timestamp: 100,
		});
	});

	it("stops the native pointer on loss and resumes automatically from the new hand's fresh observation", async () => {
		vi.useFakeTimers();
		const epoch = 1_800_000_000_000;
		vi.setSystemTime(epoch + 80);
		const { engine, identities, observe, pointing } = setup();
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
			if (sessionId === null) throw new Error("Missing pointer session");
			async function publish(frame: GestureEngineFrame) {
				simulation.execute(frame.commands);
				const packet = toPointerUpdate(frame, sessionId, epoch);
				if (packet) controller.submit(packet);
				await Promise.resolve();
				await Promise.resolve();
			}
			await publish(pointing);
			expect(driver.move).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(20);
			await publish(observe(100, []));
			expect(controller.getState().phase).toBe("waiting");
			await vi.advanceTimersByTimeAsync(101);
			await publish(engine.update(identities.advance(201)));
			await vi.advanceTimersByTimeAsync(39);
			const returned = observe(240, [hand("pointing", 240, 0.1)]);
			await publish(returned);
			expect(driver.move).toHaveBeenCalledOnce();
			await vi.advanceTimersByTimeAsync(80);
			const confirmed = observe(320, [hand("pointing", 320, 0.1)]);
			await publish(confirmed);
			const target = confirmed.commands[0]?.position;
			if (!target) throw new Error("Missing resumed command");
			expect(confirmed.commands[0]?.handId).toBe(2);
			expect(simulation.execute([]).position).toEqual(target);
			expect(driver.move).toHaveBeenCalledTimes(2);
			expect(driver.move).toHaveBeenLastCalledWith(
				{ x: Math.round(target.x * 1000), y: Math.round(target.y * 1000) },
				epoch + 320 + 250,
			);
			expect(controller.getState()).toMatchObject({
				phase: "moving",
				sessionId,
			});
			controller.disable();
			await vi.advanceTimersByTimeAsync(20);
			await publish(observe(340, [hand("pointing", 340, 0.1)]));
			expect(controller.getState().phase).toBe("disabled");
			expect(driver.move).toHaveBeenCalledTimes(2);
		} finally {
			controller.disable();
			vi.useRealTimers();
		}
	});
});
