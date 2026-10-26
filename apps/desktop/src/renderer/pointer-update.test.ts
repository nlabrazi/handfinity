import {
	createHandIdentityTracker,
	type HandObservation,
} from "@handfinity/core";
import { createGestureEngine } from "@handfinity/interactions";
import { describe, expect, it } from "vitest";
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
