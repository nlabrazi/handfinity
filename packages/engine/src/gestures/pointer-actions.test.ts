import { describe, expect, it } from "vitest";
import {
	CHORD_HOLD_MS,
	createGestureEngine,
	createHandIdentityTracker,
	GRAB_HOLD_MS,
	type HandObservation,
	SCROLL_HOLD_MS,
} from "../index";

type TestFixtureKind =
	| "pointing"
	| "fist"
	| "two-fingers"
	| "three-fingers"
	| "pinch"
	| "open-palm";

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
		kind === "fist"
			? [5, 9, 13, 17]
			: kind === "pointing" || kind === "pinch"
				? [9, 13, 17]
				: kind === "two-fingers"
					? [13, 17]
					: kind === "three-fingers"
						? [17]
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
	}

	return {
		landmarks,
		timestamp,
		handedness: "unknown",
		handednessConfidence: null,
	};
}

describe("Palm-anchored pointer actions (fist grab, finger chords, joystick scroll)", () => {
	it("progresses grabProgress over 600 ms of closed fist, freezes cursor, drags with palm, and releases on open", () => {
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

		// Début du poing fermé à t = 100 ms : le curseur est immédiatement figé
		const startFist = observe("fist", 100, 0.02, 0.01);
		expect(startFist.commands).toEqual([]);
		expect(startFist.actionState.leftButtonDown).toBe(false);

		for (let t = 200; t < 100 + GRAB_HOLD_MS; t += 100) {
			const mid = observe("fist", t, 0.02, 0.01);
			expect(mid.commands).toEqual([]);
			expect(mid.actionState.leftButtonDown).toBe(false);
			expect(mid.actionState.grabProgress).toBeCloseTo(
				(t - 100) / GRAB_HOLD_MS,
				2,
			);
		}

		// À 100 + 600 = 700 ms, la saisie est verrouillée (pointer:down)
		const grabbed = observe("fist", 100 + GRAB_HOLD_MS, 0.02, 0.01);
		expect(grabbed.actionState.leftButtonDown).toBe(true);
		expect(grabbed.actionState.dragging).toBe(true);
		expect(grabbed.actionState.grabProgress).toBe(1);
		expect(grabbed.actions).toEqual([
			{
				type: "pointer:down",
				button: "left",
				handId: 1,
				timestamp: 100 + GRAB_HOLD_MS,
				position: targetPos,
			},
		]);

		// Déplacement de la paume poing fermé -> pointer:move
		observe("fist", 760, 0.08, 0.05);
		const dragged = observe("fist", 820, 0.14, 0.09);
		expect(dragged.commands).toHaveLength(1);
		expect(dragged.commands[0]?.type).toBe("pointer:move");

		// Réouverture de la main -> pointer:up
		const released = observe("pointing", 880, 0.14, 0.09);
		expect(released.actionState.leftButtonDown).toBe(false);
		expect(released.actionState.grabProgress).toBe(0);
		expect(released.actions).toMatchObject([
			{
				type: "pointer:up",
				button: "left",
				handId: 1,
				timestamp: 880,
			},
		]);
	});

	it("automatically releases a held fist grab when the hand is lost", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		engine.update(identities.update([makeHand("pointing", 0)], 0));
		engine.update(identities.update([makeHand("pointing", 80)], 80));
		for (let t = 100; t <= 100 + GRAB_HOLD_MS; t += 100) {
			engine.update(identities.update([makeHand("fist", t)], t));
		}
		expect(engine.getActionState().leftButtonDown).toBe(true);

		const lost = engine.update(identities.update([], 760));
		expect(lost.actionState.leftButtonDown).toBe(false);
		expect(lost.actions).toMatchObject([
			{ type: "pointer:up", button: "left", handId: 1, timestamp: 760 },
		]);
	});

	it("emits a single left-click on a 2-finger chord (index + middle) and requires returning to 1 finger", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (kind: TestFixtureKind, timestamp: number) =>
			engine.update(identities.update([makeHand(kind, timestamp)], timestamp));

		observe("pointing", 0);
		const pointed = observe("pointing", 80);
		const targetPos = pointed.commands[0]?.position;

		const pending = observe("two-fingers", 100);
		expect(pending.commands).toEqual([]);
		expect(pending.actionState.pendingChord).toBe("left-click");

		observe("two-fingers", 180);
		const clicked = observe("two-fingers", 100 + CHORD_HOLD_MS);
		expect(clicked.actions).toEqual([
			{
				type: "pointer:click",
				button: "left",
				handId: 1,
				timestamp: 100 + CHORD_HOLD_MS,
				position: targetPos,
			},
		]);

		// Maintenir les 2 doigts ne déclenche pas de second clic
		expect(observe("two-fingers", 320).actions).toEqual([]);

		// Retour au pointage à 1 doigt réarme l'accord
		observe("pointing", 380);
		observe("two-fingers", 440);
		observe("two-fingers", 520);
		expect(observe("two-fingers", 440 + CHORD_HOLD_MS).actions).toMatchObject([
			{ type: "pointer:click", button: "left", handId: 1 },
		]);
	});

	it("freezes the cursor immediately when chord onset begins, preventing index twitch from moving the cursor", () => {
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
		expect(pointed.commands).toHaveLength(1);

		// Le majeur commence à s'ouvrir (accord à deux doigts avec sursaut de l'index dx = 0.03) :
		// le curseur est immédiatement figé, aucune commande parasite de déplacement n'est émise.
		const twitching = observe("two-fingers", 100, 0.03, 0.02);
		expect(twitching.commands).toEqual([]);
	});

	it("emits a right-click on a 3-finger chord without firing a false left-click during transition", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (kind: TestFixtureKind, timestamp: number) =>
			engine.update(identities.update([makeHand(kind, timestamp)], timestamp));

		observe("pointing", 0);
		observe("pointing", 80);

		// Passage transitoire par 2 doigts (< CHORD_HOLD_MS) avant d'ouvrir le 3e doigt
		observe("two-fingers", 100);
		const pendingRight = observe("three-fingers", 160);
		expect(pendingRight.actions).toEqual([]);
		expect(pendingRight.actionState.pendingChord).toBe("right-click");

		observe("three-fingers", 240);
		const rightClicked = observe("three-fingers", 160 + CHORD_HOLD_MS);
		expect(rightClicked.actions).toMatchObject([
			{
				type: "pointer:click",
				button: "right",
				handId: 1,
				timestamp: 160 + CHORD_HOLD_MS,
			},
		]);
	});

	it("emits continuous joystick scroll commands when holding pinch and offsetting the palm vertically", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine();
		const observe = (kind: TestFixtureKind, timestamp: number, dy = 0) =>
			engine.update(
				identities.update([makeHand(kind, timestamp, 0, dy)], timestamp),
			);

		observe("pointing", 0);
		observe("pointing", 80);

		// Entrée en pincement et confirmation après SCROLL_HOLD_MS
		observe("pinch", 100, 0);
		observe("pinch", 140, 0);
		observe("pinch", 200, 0);
		const anchored = observe("pinch", 140 + SCROLL_HOLD_MS, 0);
		expect(anchored.actionState.scrolling).toBe(true);
		expect(anchored.actionState.scrollVelocity).toBe(0);
		expect(anchored.actions).toEqual([]);

		// Main abaissée à dy = +0.06 et maintenue fixe : défilement continu à chaque frame !
		const tick1 = observe("pinch", 300, 0.06);
		const tick2 = observe("pinch", 360, 0.06);
		expect(tick1.actions).toMatchObject([
			{ type: "pointer:scroll", handId: 1 },
		]);
		expect(tick2.actions).toMatchObject([
			{ type: "pointer:scroll", handId: 1 },
		]);
		expect(tick2.actionState.scrollVelocity).toBeGreaterThan(0);
	});
});
