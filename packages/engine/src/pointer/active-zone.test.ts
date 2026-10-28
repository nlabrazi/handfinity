import { describe, expect, it } from "vitest";
import { createGestureEngine } from "../gesture-engine";
import type { HandObservation } from "../hand-observation";
import { createHandIdentityTracker } from "../tracking/hand-identity-tracker";
import { createActiveZoneMapper, DEFAULT_ACTIVE_ZONE } from "./active-zone";

function makePointingHand(dx = 0, dy = 0, timestamp = 0): HandObservation {
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

	for (const base of [9, 13, 17]) {
		const root = landmarks[base];
		if (!root) throw new Error("Missing fixture landmark");
		landmarks[base + 1] = { x: root.x, y: root.y - 0.14, z: 0 };
		landmarks[base + 2] = { x: root.x + 0.01, y: root.y, z: 0 };
		landmarks[base + 3] = { x: root.x + 0.01, y: root.y + 0.08, z: 0 };
	}

	return {
		landmarks,
		timestamp,
		handedness: "unknown",
		handednessConfidence: null,
	};
}

describe("Active zone mapper", () => {
	it("maps the center of the default active zone to the center of the screen", () => {
		const mapper = createActiveZoneMapper();
		expect(mapper.project({ x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5 });
	});

	it("maps active zone boundaries to screen edges and clamps outside points", () => {
		const mapper = createActiveZoneMapper();
		expect(
			mapper.project({
				x: DEFAULT_ACTIVE_ZONE.minX,
				y: DEFAULT_ACTIVE_ZONE.minY,
			}),
		).toEqual({ x: 0, y: 0 });
		expect(
			mapper.project({
				x: DEFAULT_ACTIVE_ZONE.maxX,
				y: DEFAULT_ACTIVE_ZONE.maxY,
			}),
		).toEqual({ x: 1, y: 1 });
		expect(mapper.project({ x: 0.02, y: 0.98 })).toEqual({ x: 0, y: 1 });
	});

	it("rejects invalid active zone bounds", () => {
		expect(() =>
			createActiveZoneMapper({ minX: 0.8, maxX: 0.2, minY: 0.1, maxY: 0.9 }),
		).toThrow(RangeError);
		expect(() =>
			createActiveZoneMapper({ minX: -0.1, maxX: 0.9, minY: 0.1, maxY: 0.9 }),
		).toThrow(RangeError);
	});

	it("projects pointer move commands when activeZone is configured on GestureEngine", () => {
		const identities = createHandIdentityTracker();
		const engine = createGestureEngine({ activeZone: DEFAULT_ACTIVE_ZONE });
		expect(engine.getActiveZone()).toEqual(DEFAULT_ACTIVE_ZONE);

		const hand = makePointingHand(0, 0, 0);
		engine.update(identities.update([hand], 0));
		const frame80 = engine.update(
			identities.update([{ ...hand, timestamp: 80 }], 80),
		);
		expect(frame80.commands).toHaveLength(1);
		// Without active zone, 1 - 0.42 = 0.58; projected through [0.12, 0.88] gives (0.58 - 0.12) / 0.76 ≈ 0.605
		expect(frame80.commands[0]?.position.x).toBeCloseTo(0.605, 2);
		expect(frame80.commands[0]?.position.y).toBeCloseTo(0.185, 2);

		// Dynamic update via setActiveZone to null returns raw coordinates
		engine.setActiveZone(null);
		expect(engine.getActiveZone()).toBeNull();
		const frame100 = engine.update(
			identities.update([{ ...hand, timestamp: 100 }], 100),
		);
		expect(frame100.commands[0]?.position.x).toBeCloseTo(0.58, 2);
		expect(frame100.commands[0]?.position.y).toBeCloseTo(0.28, 2);
	});
});
