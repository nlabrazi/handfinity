import { describe, expect, it } from "vitest";
import { createActiveZoneMapper, DEFAULT_ACTIVE_ZONE } from "./active-zone";

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
});
