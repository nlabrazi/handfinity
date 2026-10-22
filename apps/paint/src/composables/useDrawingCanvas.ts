import { computed, ref, shallowRef, type Ref } from "vue";
import type { Point } from "@handfinity/vision";
import { DEFAULT_BRUSH } from "../lib/brush";
import {
	createDrawingHistory,
	type DrawingStroke,
} from "../lib/drawing-history";
import { createSmoothStroke } from "../lib/smooth-stroke";

function toCanvasPoint(point: Point, canvas: HTMLCanvasElement): Point {
	return { x: point.x * canvas.width, y: point.y * canvas.height };
}

export type DrawingCanvases = {
	canvasRef: Readonly<Ref<HTMLCanvasElement | null>>;
	previewCanvasRef: Readonly<Ref<HTMLCanvasElement | null>>;
};

// Les points reçus sont déjà lissés et dans le repère du dessin (miroir appliqué).
export function useDrawingCanvas(
	{ canvasRef, previewCanvasRef }: DrawingCanvases,
	isHistoryBlocked: () => boolean,
) {
	const brushColor = ref(DEFAULT_BRUSH.color);
	const brushWidth = ref(DEFAULT_BRUSH.width);
	const activeStroke = shallowRef<DrawingStroke | null>(null);
	const history = createDrawingHistory();
	const hasPast = ref(false);
	const hasFuture = ref(false);
	const canUndo = computed(() => hasPast.value && !isHistoryBlocked());
	const canRedo = computed(() => hasFuture.value && !isHistoryBlocked());
	let stroke: ReturnType<typeof createSmoothStroke> | null = null;
	let strokePoints: Point[] = [];

	function getSurface() {
		const canvas = canvasRef.value;
		const ctx = canvas?.getContext("2d");
		const preview = previewCanvasRef.value;
		const previewCtx = preview?.getContext("2d");
		return canvas && ctx && preview && previewCtx
			? { canvas, ctx, preview, previewCtx }
			: null;
	}

	function updateHistoryControls() {
		hasPast.value = history.canUndo;
		hasFuture.value = history.canRedo;
	}

	function finishStroke() {
		stroke?.finish();
		stroke = null;
		if (activeStroke.value) {
			history.add(activeStroke.value);
			activeStroke.value = null;
			strokePoints = [];
			updateHistoryControls();
		}
	}

	function startStroke(point: Point) {
		const surface = getSurface();
		if (!surface) return;
		finishStroke();
		strokePoints = [point];
		// Copier les réglages pour garder le même style jusqu'à la fin du trait.
		activeStroke.value = {
			points: strokePoints,
			color: brushColor.value,
			width: brushWidth.value,
		};
		stroke = createSmoothStroke(
			surface.ctx,
			surface.previewCtx,
			activeStroke.value,
		);
		stroke.start(toCanvasPoint(point, surface.canvas));
	}

	function moveStroke(point: Point) {
		const canvas = canvasRef.value;
		if (!canvas || !stroke) return;
		strokePoints.push(point);
		stroke.move(toCanvasPoint(point, canvas));
	}

	function redrawHistory() {
		const surface = getSurface();
		if (!surface) return;
		const { canvas, ctx, preview, previewCtx } = surface;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		previewCtx.clearRect(0, 0, preview.width, preview.height);
		for (const drawing of history.strokes) {
			const first = drawing.points[0];
			if (!first) continue;
			// Rejouer uniquement les courbes définitives, sans aperçu intermédiaire.
			const renderer = createSmoothStroke(ctx, null, drawing);
			renderer.start(toCanvasPoint(first, canvas));
			for (const point of drawing.points.slice(1)) {
				renderer.move(toCanvasPoint(point, canvas));
			}
			renderer.finish();
		}
	}

	function resize(width: number, height: number) {
		for (const canvas of [canvasRef.value, previewCanvasRef.value]) {
			if (canvas && (canvas.width !== width || canvas.height !== height)) {
				canvas.width = width;
				canvas.height = height;
			}
		}
		// Une nouvelle résolution efface le Canvas, mais pas les traits mémorisés.
		redrawHistory();
	}

	function undo() {
		if (!canUndo.value || !history.undo()) return;
		redrawHistory();
		updateHistoryControls();
	}

	function redo() {
		if (!canRedo.value || !history.redo()) return;
		redrawHistory();
		updateHistoryControls();
	}

	function clearCanvas() {
		if (!canvasRef.value) return;
		// Conserver aussi la portion visible d'un trait interrompu pour annuler Clear.
		finishStroke();
		history.clear();
		redrawHistory();
		updateHistoryControls();
	}

	function exportPng() {
		const canvas = canvasRef.value;
		if (!canvas) return;
		// Export transparent : inclure la terminaison provisoire, jamais la webcam.
		const output = document.createElement("canvas");
		output.width = canvas.width;
		output.height = canvas.height;
		const ctx = output.getContext("2d");
		if (!ctx) return;
		ctx.drawImage(canvas, 0, 0);
		if (previewCanvasRef.value) ctx.drawImage(previewCanvasRef.value, 0, 0);
		const link = document.createElement("a");
		link.download = "handfinity-paint.png";
		link.href = output.toDataURL("image/png");
		link.click();
	}

	return {
		canvasRef,
		previewCanvasRef,
		brushColor,
		brushWidth,
		activeStroke,
		canUndo,
		canRedo,
		isReady: () => getSurface() !== null,
		startStroke,
		moveStroke,
		finishStroke,
		resize,
		undo,
		redo,
		clearCanvas,
		exportPng,
	};
}
