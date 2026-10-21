import type { Point } from "@handfinity/vision";

export type DrawingStroke = {
	// Coordonnées normalisées dans le dessin, indépendantes de la résolution vidéo.
	readonly points: readonly Readonly<Point>[];
	readonly color: string;
	readonly width: number;
};

type DrawingAction =
	| { type: "stroke"; stroke: DrawingStroke }
	| { type: "clear"; strokes: readonly DrawingStroke[] };

export function createDrawingHistory() {
	let strokes: DrawingStroke[] = [];
	const past: DrawingAction[] = [];
	const future: DrawingAction[] = [];

	function add(stroke: DrawingStroke): boolean {
		if (stroke.points.length === 0) return false;
		// Détacher les données du tampon utilisé pendant le dessin.
		const saved: DrawingStroke = {
			points: stroke.points.map((point) => ({ ...point })),
			color: stroke.color,
			width: stroke.width,
		};
		strokes.push(saved);
		past.push({ type: "stroke", stroke: saved });
		future.length = 0;
		return true;
	}

	function clear(): boolean {
		if (strokes.length === 0) return false;
		past.push({ type: "clear", strokes });
		strokes = [];
		future.length = 0;
		return true;
	}

	function undo(): boolean {
		const action = past.pop();
		if (!action) return false;
		if (action.type === "stroke") {
			strokes.pop();
		} else {
			strokes = [...action.strokes];
		}
		future.push(action);
		return true;
	}

	function redo(): boolean {
		const action = future.pop();
		if (!action) return false;
		if (action.type === "stroke") {
			strokes.push(action.stroke);
		} else {
			strokes = [];
		}
		past.push(action);
		return true;
	}

	return {
		add,
		clear,
		undo,
		redo,
		get strokes(): readonly DrawingStroke[] {
			return strokes;
		},
		get canUndo() {
			return past.length > 0;
		},
		get canRedo() {
			return future.length > 0;
		},
	};
}
