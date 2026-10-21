import type { Point } from "@handfinity/vision";
import type { BrushSettings } from "./brush";

export function createSmoothStroke(
	ctx: CanvasRenderingContext2D,
	preview: CanvasRenderingContext2D | null,
	options: BrushSettings,
) {
	let previous: Point | null = null;
	let previousMidpoint: Point | null = null;

	function clearPreview() {
		preview?.clearRect(0, 0, preview.canvas.width, preview.canvas.height);
	}

	function cancel() {
		previous = null;
		previousMidpoint = null;
		clearPreview();
	}

	function start(point: Point) {
		cancel();
		for (const context of [ctx, preview]) {
			if (!context) continue;
			context.strokeStyle = options.color;
			context.fillStyle = options.color;
			context.lineWidth = options.width;
			context.lineCap = "round";
			context.lineJoin = "round";
		}

		previous = { ...point };
		previousMidpoint = { ...point };

		ctx.beginPath();
		ctx.arc(point.x, point.y, options.width / 2, 0, Math.PI * 2);
		ctx.fill();
	}

	function move(point: Point) {
		if (!previous || !previousMidpoint) return;

		const midpoint = {
			x: (previous.x + point.x) / 2,
			y: (previous.y + point.y) / 2,
		};

		ctx.beginPath();
		ctx.moveTo(previousMidpoint.x, previousMidpoint.y);
		ctx.quadraticCurveTo(previous.x, previous.y, midpoint.x, midpoint.y);
		ctx.stroke();

		previous = { ...point };
		previousMidpoint = midpoint;

		// Seule la terminaison reste provisoire, jusqu'à la position du curseur.
		clearPreview();
		if (preview) drawTail(preview);
	}

	function drawTail(context: CanvasRenderingContext2D) {
		if (!previous || !previousMidpoint) return;
		context.beginPath();
		context.moveTo(previousMidpoint.x, previousMidpoint.y);
		context.lineTo(previous.x, previous.y);
		context.stroke();
	}

	function finish() {
		drawTail(ctx);
		cancel();
	}

	return { start, move, finish, cancel };
}
