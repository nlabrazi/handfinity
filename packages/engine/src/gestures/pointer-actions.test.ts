import { describe, expect, it } from "vitest";
import {
	CLICK_FREEZE_MS,
	createGestureEngine,
	createHandIdentityTracker,
	type HandObservation,
	SCROLL_HOLD_MS,
	SECONDARY_PINCH_HOLD_MS,
} from "../index";

type TestFixtureKind =
	| "pointing"
	| "pinch"
	| "open-palm"
	| "secondary-pinch"
	| "scroll";

function makeHand(
	kind: TestFixtureKind,
	timestamp: number,
	dx = 0,
	dy = 0,
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
	].map(([x = 0, y = 0]) => ({ x: x + dx, y: y + dy, z: 0 }));

	const foldBases =
		kind === "pointing" || kind === "secondary-pinch"
			? [9, 13, 17]
			: kind === "scroll"
				? [13, 17]
				: [];

	for (const base of foldBases) {
		const root = landmarks[base];
		if (!root) throw new Error("Missing fixture landmark");
		landmarks[base + 1] = { x: root.x, y: root.y - 0.14, z: 0 };
		landmarks[base + 2] = { x: root.x + 0.01, y: root.y, z: 0 };
		landmarks[base + 3] = { x: root.x + 0.01, y: root.y + 0.08, z: 0 };
	}

	if (kind === "pinch") {
		landmarks[4] = { x: 0.43 + dx, y: 0.28 + dy, z: 0 };
	} else if (kind === "secondary-pinch") {
		const middleTip = landmarks[12];
		if (!middleTip) throw new Error("Missing middle tip");
		landmarks[4] = { x: middleTip.x + 0.01, y: middleTip.y, z: 0 };
	}

	return {
		landmarks,
		timestamp,
		handedness: "unknown",
		handednessConfidence: null,
	};
}

describe("Pointer actions (click, drag, right-click, scroll)", () => {
	it("emits pointer:down and pointer:up for a primary click after pointing, freezing cursor during click onset", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (
			kind: TestFixtureKind,
			timestamp: number,
			dx = 0,
			dy = 0,
		) =>
			engine.update(
				identities.update([makeHand(kind, timestamp, dx, dy)], timestamp),
			);

		observe("pointing", 0);
		const pointed = observe("pointing", 80);
		const targetPos = pointed.commands[0]?.position;
		expect(targetPos).toBeDefined();

		observe("pinch", 100, 0.02, 0.01);
		const down = observe("pinch", 140, 0.02, 0.01);
		expect(down.actionState.leftButtonDown).toBe(true);
		expect(down.actions).toEqual([
			{
				type: "pointer:down",
				button: "left",
				handId: 1,
				timestamp: 140,
				position: targetPos,
			},
		]);
		// Pendant CLICK_FREEZE_MS, aucun déplacement parasite n'est émis
		const frozen = observe("pinch", 140 + CLICK_FREEZE_MS - 10, 0.04, 0.02);
		expect(frozen.commands).toEqual([]);

		// Relâchement du pinch -> pointer:up
		observe("pointing", 260);
		const up = observe("pointing", 320);
		expect(up.actionState.leftButtonDown).toBe(false);
		expect(up.actions).toEqual([
			{
				type: "pointer:up",
				button: "left",
				handId: 1,
				timestamp: 320,
				position: targetPos,
			},
		]);
	});

	it("emits drag move commands when holding pinch past the freeze window and moving", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (
			kind: TestFixtureKind,
			timestamp: number,
			dx = 0,
			dy = 0,
		) =>
			engine.update(
				identities.update([makeHand(kind, timestamp, dx, dy)], timestamp),
			);

		observe("pointing", 0);
		observe("pointing", 80);
		observe("pinch", 100);
		const down = observe("pinch", 140);
		expect(down.actions[0]?.type).toBe("pointer:down");

		observe("pinch", 200, 0.04, 0.03);
		observe("pinch", 250, 0.08, 0.05);
		const dragged = observe("pinch", 140 + CLICK_FREEZE_MS + 40, 0.12, 0.08);
		expect(dragged.actionState.dragging).toBe(true);
		expect(dragged.commands).toHaveLength(1);
		expect(dragged.commands[0]?.type).toBe("pointer:move");
	});

	it("automatically releases a held left button when the hand is lost", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		engine.update(identities.update([makeHand("pointing", 0)], 0));
		engine.update(identities.update([makeHand("pointing", 80)], 80));
		engine.update(identities.update([makeHand("pinch", 100)], 100));
		const down = engine.update(
			identities.update([makeHand("pinch", 140)], 140),
		);
		expect(down.actionState.leftButtonDown).toBe(true);

		const lost = engine.update(identities.update([], 180));
		expect(lost.actionState.leftButtonDown).toBe(false);
		expect(lost.actions).toMatchObject([
			{ type: "pointer:up", button: "left", handId: 1, timestamp: 180 },
		]);
	});

	it("emits a single right-click on secondary pinch (thumb + middle) and requires release", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (kind: TestFixtureKind, timestamp: number) =>
			engine.update(identities.update([makeHand(kind, timestamp)], timestamp));

		observe("pointing", 0);
		observe("pointing", 80);
		observe("secondary-pinch", 100);
		const clicked = observe("secondary-pinch", 100 + SECONDARY_PINCH_HOLD_MS);
		expect(clicked.actions).toMatchObject([
			{ type: "pointer:click", button: "right", handId: 1 },
		]);

		// Maintenir la posture ne déclenche pas de second clic droit
		expect(
			observe("secondary-pinch", 100 + SECONDARY_PINCH_HOLD_MS + 60).actions,
		).toEqual([]);
	});

	it("emits vertical scroll commands when holding the two-finger scroll pose and moving vertically", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (kind: TestFixtureKind, timestamp: number, dy = 0) =>
			engine.update(
				identities.update([makeHand(kind, timestamp, 0, dy)], timestamp),
			);

		observe("pointing", 0);
		observe("pointing", 80);
		observe("scroll", 100, 0);
		const ready = observe("scroll", 100 + SCROLL_HOLD_MS, 0);
		expect(ready.actionState.scrolling).toBe(true);

		const scrolled = observe("scroll", 100 + SCROLL_HOLD_MS + 40, 0.05);
		expect(scrolled.actions).toMatchObject([
			{ type: "pointer:scroll", handId: 1 },
		]);
		if (scrolled.actions[0]?.type === "pointer:scroll") {
			expect(scrolled.actions[0].deltaY).toBeGreaterThan(0);
		}
	});
});
