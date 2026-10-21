import { describe, expect, it } from "vitest";
import { createPointSmoother } from "./point-smoother";

describe("Point smoothing", () => {
	it("reduces stationary jitter without drifting", () => {
		const smoother = createPointSmoother();
		smoother.update({ x: 0.5, y: 0.5 }, 0);
		const samples = Array.from({ length: 60 }, (_, index) =>
			smoother.update(
				{ x: 0.5 + (index % 2 ? 0.01 : -0.01), y: 0.5 },
				((index + 1) * 1000) / 60,
			),
		);
		expect(
			Math.max(...samples.map((point) => Math.abs(point.x - 0.5))),
		).toBeLessThan(0.005);
		expect(samples.every((point) => point.y === 0.5)).toBe(true);
	});

	it("has the same response over the same elapsed time at different frame rates", () => {
		const positions = [15, 30, 60].map((fps) => {
			const smoother = createPointSmoother();
			let point = smoother.update({ x: 0, y: 0 }, 0);
			for (let frame = 1; frame <= fps / 3; frame++) {
				point = smoother.update({ x: 1, y: 1 }, (frame * 1000) / fps);
			}
			return point.x;
		});
		expect(positions[0]).toBeCloseTo(positions[1] ?? 0, 10);
		expect(positions[1]).toBeCloseTo(positions[2] ?? 0, 10);
	});

	it("does not filter the same sample twice when a pinch starts", () => {
		const smoother = createPointSmoother();
		smoother.update({ x: 0, y: 0 }, 0);
		const point = smoother.update({ x: 1, y: 1 }, 30);
		expect(smoother.update({ x: 1, y: 1 }, 30)).toEqual(point);
	});

	it("resets at the new position after tracking loss", () => {
		const smoother = createPointSmoother();
		smoother.update({ x: 0, y: 0 }, 0);
		smoother.reset();
		expect(smoother.update({ x: 1, y: 1 }, 30)).toEqual({ x: 1, y: 1 });
	});
});
