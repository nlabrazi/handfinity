import { describe, expect, it } from "vitest";
import { createOneEuroFilter } from "./one-euro-filter";

describe("One Euro Filter", () => {
	it("returns the initial point untouched on the first sample", () => {
		const filter = createOneEuroFilter();
		expect(filter.update({ x: 0.25, y: 0.75 }, 0)).toEqual({
			x: 0.25,
			y: 0.75,
		});
	});

	it("heavily damps micro-jitter when the hand is nearly stationary", () => {
		const filter = createOneEuroFilter({ minCutoff: 1.0, beta: 0.01 });
		filter.update({ x: 0.5, y: 0.5 }, 0);
		const jittered = filter.update({ x: 0.502, y: 0.498 }, 16);
		expect(Math.abs(jittered.x - 0.5)).toBeLessThan(0.0005);
		expect(Math.abs(jittered.y - 0.5)).toBeLessThan(0.0005);
	});

	it("tracks fast movements with much higher responsiveness than slow movements", () => {
		const slow = createOneEuroFilter({ minCutoff: 1.0, beta: 2.0 });
		const fast = createOneEuroFilter({ minCutoff: 1.0, beta: 2.0 });
		slow.update({ x: 0.5, y: 0.5 }, 0);
		fast.update({ x: 0.5, y: 0.5 }, 0);

		const slowOut = slow.update({ x: 0.505, y: 0.5 }, 33);
		const fastOut = fast.update({ x: 0.9, y: 0.5 }, 33);

		const slowRatio = (slowOut.x - 0.5) / 0.005;
		const fastRatio = (fastOut.x - 0.5) / 0.4;
		expect(fastRatio).toBeGreaterThan(slowRatio * 1.5);
	});

	it("resets its internal state cleanly", () => {
		const filter = createOneEuroFilter();
		filter.update({ x: 0.1, y: 0.1 }, 0);
		filter.update({ x: 0.2, y: 0.2 }, 30);
		filter.reset();
		expect(filter.update({ x: 0.8, y: 0.9 }, 60)).toEqual({
			x: 0.8,
			y: 0.9,
		});
	});

	it("rejects invalid filter parameters", () => {
		expect(() => createOneEuroFilter({ minCutoff: 0 })).toThrow(RangeError);
		expect(() => createOneEuroFilter({ beta: -1 })).toThrow(RangeError);
		expect(() => createOneEuroFilter({ dCutoff: Number.NaN })).toThrow(
			RangeError,
		);
	});
});
