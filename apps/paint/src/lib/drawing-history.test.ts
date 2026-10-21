import { describe, expect, it } from "vitest";
import { createDrawingHistory, type DrawingStroke } from "./drawing-history";

const red: DrawingStroke = {
	points: [
		{ x: 0.1, y: 0.2 },
		{ x: 0.2, y: 0.3 },
	],
	color: "#ef4444",
	width: 12,
};
const blue: DrawingStroke = {
	points: [
		{ x: 0.5, y: 0.6 },
		{ x: 0.6, y: 0.7 },
	],
	color: "#2563eb",
	width: 24,
};

describe("Drawing history", () => {
	it("starts empty with no available actions", () => {
		const history = createDrawingHistory();
		expect(history.strokes).toEqual([]);
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(false);
		expect(history.undo()).toBe(false);
		expect(history.redo()).toBe(false);
		expect(history.clear()).toBe(false);
	});

	it("undoes one whole stroke and restores its points and brush", () => {
		const history = createDrawingHistory();
		history.add(red);
		history.add(blue);
		expect(history.undo()).toBe(true);
		expect(history.strokes).toEqual([red]);
		expect(history.canRedo).toBe(true);
		expect(history.redo()).toBe(true);
		expect(history.strokes).toEqual([red, blue]);
		expect(history.canRedo).toBe(false);
	});

	it("restores strokes in order after undoing everything", () => {
		const history = createDrawingHistory();
		history.add(red);
		history.add(blue);
		history.undo();
		history.undo();
		expect(history.strokes).toEqual([]);
		expect(history.canUndo).toBe(false);
		history.redo();
		expect(history.strokes).toEqual([red]);
		history.redo();
		expect(history.strokes).toEqual([red, blue]);
	});

	it("keeps a single-point stroke in the history", () => {
		const history = createDrawingHistory();
		const dot: DrawingStroke = { ...red, points: [{ x: 0.5, y: 0.5 }] };
		history.add(dot);
		history.undo();
		history.redo();
		expect(history.strokes).toEqual([dot]);
	});

	it("restores an entire cleared drawing in one undo", () => {
		const history = createDrawingHistory();
		history.add(red);
		history.add(blue);
		expect(history.clear()).toBe(true);
		expect(history.strokes).toEqual([]);
		history.undo();
		expect(history.strokes).toEqual([red, blue]);
		history.redo();
		expect(history.strokes).toEqual([]);
	});

	it("keeps clear snapshots intact across repeated undo and redo", () => {
		const history = createDrawingHistory();
		history.add(red);
		history.add(blue);
		history.clear();
		for (let repeat = 0; repeat < 3; repeat++) {
			history.undo();
			history.undo();
			expect(history.strokes).toEqual([red]);
			history.redo();
			expect(history.strokes).toEqual([red, blue]);
			history.redo();
			expect(history.strokes).toEqual([]);
		}
	});

	it("discards redo when a new stroke is added after undo", () => {
		const history = createDrawingHistory();
		history.add(red);
		history.add(blue);
		history.undo();
		history.add(red);
		expect(history.canRedo).toBe(false);
		expect(history.redo()).toBe(false);
		expect(history.strokes).toEqual([red, red]);
	});

	it("discards redo when the remaining drawing is cleared", () => {
		const history = createDrawingHistory();
		history.add(red);
		history.add(blue);
		history.undo();
		history.clear();
		expect(history.canRedo).toBe(false);
		history.undo();
		expect(history.strokes).toEqual([red]);
	});

	it("ignores empty actions without discarding redo", () => {
		const history = createDrawingHistory();
		history.add(red);
		history.undo();
		expect(history.clear()).toBe(false);
		expect(history.add({ ...blue, points: [] })).toBe(false);
		expect(history.canRedo).toBe(true);
		history.redo();
		expect(history.strokes).toEqual([red]);
	});

	it("does not add duplicate clear actions for an already empty drawing", () => {
		const history = createDrawingHistory();
		history.add(red);
		history.clear();
		expect(history.clear()).toBe(false);
		history.undo();
		expect(history.strokes).toEqual([red]);
	});

	it("detaches saved points and brush settings from mutable input", () => {
		const history = createDrawingHistory();
		const point = { x: 0.1, y: 0.2 };
		const stroke = { points: [point], color: "#ef4444", width: 12 };
		history.add(stroke);
		point.x = 0.9;
		stroke.points.length = 0;
		stroke.color = "#000000";
		stroke.width = 40;
		history.undo();
		history.redo();
		expect(history.strokes).toEqual([
			{
				points: [{ x: 0.1, y: 0.2 }],
				color: "#ef4444",
				width: 12,
			},
		]);
	});

	it("supports new drawing after Clear and undoing back through both actions", () => {
		const history = createDrawingHistory();
		history.add(red);
		history.clear();
		history.add(blue);
		history.undo();
		expect(history.strokes).toEqual([]);
		history.undo();
		expect(history.strokes).toEqual([red]);
		history.undo();
		expect(history.strokes).toEqual([]);
		history.redo();
		history.redo();
		history.redo();
		expect(history.strokes).toEqual([blue]);
	});
});
