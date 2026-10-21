import { describe, expect, it, vi } from "vitest";
import { createSmoothStroke } from "./smooth-stroke";

function createContext() {
	const calls = {
		canvas: { width: 1280, height: 720 },
		beginPath: vi.fn(),
		arc: vi.fn(),
		fill: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		quadraticCurveTo: vi.fn(),
		stroke: vi.fn(),
		clearRect: vi.fn(),
	};
	return { calls, ctx: calls as unknown as CanvasRenderingContext2D };
}

function setup() {
	const ink = createContext();
	const preview = createContext();
	const stroke = createSmoothStroke(ink.ctx, preview.ctx, {
		color: "#38bdf8",
		width: 6,
	});
	return { ink: ink.calls, preview: preview.calls, stroke };
}

describe("Smooth stroke", () => {
	it("keeps a stationary pinch visible as a dot", () => {
		const { ink, stroke } = setup();
		stroke.start({ x: 10, y: 20 });
		stroke.finish();
		expect(ink.arc).toHaveBeenCalledWith(10, 20, 3, 0, Math.PI * 2);
		expect(ink.fill).toHaveBeenCalledOnce();
	});

	it("preserves a short stroke and commits the same endpoint as its preview", () => {
		const { ink, preview, stroke } = setup();
		stroke.start({ x: 10, y: 20 });
		stroke.move({ x: 11, y: 20 });
		expect(preview.lineTo).toHaveBeenLastCalledWith(11, 20);
		stroke.finish();
		expect(ink.lineTo).toHaveBeenLastCalledWith(11, 20);
		expect(preview.clearRect).toHaveBeenLastCalledWith(0, 0, 1280, 720);
	});

	it("keeps every accepted point instead of trimming the end of a stroke", () => {
		const { ink, preview, stroke } = setup();
		stroke.start({ x: 0, y: 0 });
		for (let x = 10; x <= 60; x += 10) stroke.move({ x, y: 20 });
		expect(preview.lineTo).toHaveBeenLastCalledWith(60, 20);
		stroke.finish();
		expect(ink.lineTo).toHaveBeenLastCalledWith(60, 20);
		const strokes = ink.stroke.mock.calls.length;
		stroke.finish();
		stroke.move({ x: 100, y: 100 });
		expect(ink.stroke).toHaveBeenCalledTimes(strokes);
	});

	it("does not reconnect two separate strokes", () => {
		const { ink, stroke } = setup();
		stroke.start({ x: 0, y: 0 });
		stroke.move({ x: 20, y: 20 });
		stroke.finish();
		stroke.start({ x: 100, y: 100 });
		stroke.move({ x: 120, y: 100 });
		expect(ink.moveTo).toHaveBeenLastCalledWith(100, 100);
	});

	it("does not restore a cancelled tail after clearing", () => {
		const { ink, stroke } = setup();
		stroke.start({ x: 0, y: 0 });
		stroke.move({ x: 20, y: 20 });
		stroke.cancel();
		const strokes = ink.stroke.mock.calls.length;
		stroke.finish();
		stroke.move({ x: 100, y: 100 });
		expect(ink.stroke).toHaveBeenCalledTimes(strokes);
	});
});
