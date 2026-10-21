<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import {
	startPinchSession,
	type PinchEvent,
	type PinchSession,
	type Point,
} from "@handfinity/vision";
import { createSmoothStroke } from "./lib/smooth-stroke";
import { createPointSmoother } from "./lib/point-smoother";
import {
	createDrawingHistory,
	type DrawingStroke,
} from "./lib/drawing-history";

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const previewCanvasRef = ref<HTMLCanvasElement | null>(null);

const isRunning = ref(false);
const isLoading = ref(false);
const isPinching = ref(false);
const hasTrackedHand = ref(false);
const pointer = ref<Point | null>(null);
const error = ref("");
const cameraAspect = ref("16 / 9");
const brushColor = ref("#38bdf8");
const brushWidth = ref(6);
const canUndo = ref(false);
const canRedo = ref(false);

let session: PinchSession | null = null;
let stroke: ReturnType<typeof createSmoothStroke> | null = null;
const activeStroke = shallowRef<DrawingStroke | null>(null);
let strokePoints: Point[] = [];
const history = createDrawingHistory();
const pointSmoother = createPointSmoother();
let disposed = false;

const gestureFeedback = computed(() => {
	if (isLoading.value) {
		return {
			state: "loading",
			label: "Starting camera",
			help: "Allow camera access and wait for hand tracking to start.",
			color: "text-slate-300",
		};
	}
	if (error.value) {
		return {
			state: "error",
			label: "Session interrupted",
			help: "Check the error below, then try starting the camera again.",
			color: "text-red-400",
		};
	}
	if (!isRunning.value) {
		return {
			state: "stopped",
			label: "Camera off",
			help: "Start the camera to draw with your hand.",
			color: "text-slate-300",
		};
	}
	if (!pointer.value) {
		return {
			state: "searching",
			label: hasTrackedHand.value ? "Tracking lost" : "Show one hand",
			help: "Keep one hand clearly visible in the camera frame.",
			color: "text-amber-300",
		};
	}
	if (isPinching.value && !activeStroke.value) {
		return {
			state: "paused",
			label: "Release to continue",
			help: "Open your fingers, then pinch again to start a new stroke.",
			color: "text-amber-300",
		};
	}
	if (isPinching.value) {
		return {
			state: "drawing",
			label: "Drawing",
			help: "Release your fingers to finish the stroke and use Undo / Redo.",
			color: "text-green-400",
		};
	}
	return {
		state: "ready",
		label: "Ready",
		help: "Pinch your thumb and index finger to draw.",
		color: "text-sky-400",
	};
});

function toCanvasPoint(point: Point, canvas: HTMLCanvasElement): Point {
	return {
		x: point.x * canvas.width,
		y: point.y * canvas.height,
	};
}

function clearPreview() {
	const preview = previewCanvasRef.value;
	if (!preview) return;
	preview.getContext("2d")?.clearRect(0, 0, preview.width, preview.height);
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

function updateHistoryControls() {
	canUndo.value = history.canUndo;
	canRedo.value = history.canRedo;
}

function redrawHistory() {
	const canvas = canvasRef.value;
	const ctx = canvas?.getContext("2d");
	const previewCtx = previewCanvasRef.value?.getContext("2d");
	if (!canvas || !ctx || !previewCtx) return;

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	clearPreview();
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

function undo() {
	if (isPinching.value || isLoading.value || !history.undo()) return;
	redrawHistory();
	updateHistoryControls();
}

function redo() {
	if (isPinching.value || isLoading.value || !history.redo()) return;
	redrawHistory();
	updateHistoryControls();
}

function handleGesture(event: PinchEvent) {
	isPinching.value = event.type !== "pinch:end";

	if (event.type === "pinch:end") {
		finishStroke();
		if (event.reason === "tracking-lost") {
			pointer.value = null;
			pointSmoother.reset();
		}
		return;
	}

	const canvas = canvasRef.value;
	const ctx = canvas?.getContext("2d");
	const preview = previewCanvasRef.value;
	const previewCtx = preview?.getContext("2d");
	if (!canvas || !ctx || !previewCtx) return;

	pointer.value = pointSmoother.update(event.position, event.timestamp);
	// Mémoriser les points lissés dans le repère du dessin, déjà adapté au miroir.
	const drawingPoint = { x: 1 - pointer.value.x, y: pointer.value.y };
	const point = toCanvasPoint(drawingPoint, canvas);

	if (event.type === "pinch:start") {
		finishStroke();

		// Copier les réglages pour garder le même style jusqu'à la fin du trait.
		strokePoints = [drawingPoint];
		activeStroke.value = {
			points: strokePoints,
			color: brushColor.value,
			width: brushWidth.value,
		};
		stroke = createSmoothStroke(ctx, previewCtx, activeStroke.value);
		stroke.start(point);
		return;
	}

	if (event.type === "pinch:move" && stroke) {
		strokePoints.push(drawingPoint);
		stroke.move(point);
	}
}

function stop() {
	session?.stop();
	session = null;
	finishStroke();
	pointSmoother.reset();
	isRunning.value = false;
	isPinching.value = false;
	hasTrackedHand.value = false;
	pointer.value = null;
}

async function toggleCamera() {
	if (isLoading.value) return;

	if (isRunning.value) {
		stop();
		return;
	}

	const video = videoRef.value;
	const canvas = canvasRef.value;
	const preview = previewCanvasRef.value;
	if (!video || !canvas || !preview) return;

	isLoading.value = true;
	error.value = "";

	try {
		const controller = await startPinchSession(video, {
			onGesture: handleGesture,
			onPointer: (point, timestamp) => {
				if (point) hasTrackedHand.value = true;
				if (!point) {
					pointer.value = null;
					pointSmoother.reset();
				} else if (!stroke) {
					pointer.value = pointSmoother.update(point, timestamp);
				}
			},
			onError: (err) => {
				stop();
				error.value = err instanceof Error ? err.message : "Tracking failed";
			},
		});

		if (disposed) {
			controller.stop();
			return;
		}

		session = controller;
		cameraAspect.value = `${video.videoWidth} / ${video.videoHeight}`;

		if (
			canvas.width !== video.videoWidth ||
			canvas.height !== video.videoHeight
		) {
			canvas.width = video.videoWidth;
			canvas.height = video.videoHeight;
		}
		if (
			preview.width !== video.videoWidth ||
			preview.height !== video.videoHeight
		) {
			preview.width = video.videoWidth;
			preview.height = video.videoHeight;
		}
		// Une nouvelle résolution vidéo efface le Canvas, mais pas les traits mémorisés.
		redrawHistory();

		isRunning.value = true;
	} catch (err) {
		stop();
		error.value = err instanceof Error ? err.message : "Camera unavailable";
	} finally {
		isLoading.value = false;
	}
}

function clearCanvas() {
	const canvas = canvasRef.value;
	if (!canvas) return;

	// Conserver aussi la portion visible d'un trait interrompu pour annuler Clear.
	finishStroke();
	history.clear();
	redrawHistory();
	updateHistoryControls();
}

function exportPng() {
	const canvas = canvasRef.value;
	if (!canvas) return;

	// Export transparent : le flux webcam n'est jamais inclus.
	// L'éventuel trait encore en cours est inclus visuellement.
	const output = document.createElement("canvas");
	output.width = canvas.width;
	output.height = canvas.height;
	const ctx = output.getContext("2d");
	if (!ctx) return;

	ctx.drawImage(canvas, 0, 0);
	if (previewCanvasRef.value) {
		ctx.drawImage(previewCanvasRef.value, 0, 0);
	}

	const link = document.createElement("a");
	link.download = "handfinity-paint.png";
	link.href = output.toDataURL("image/png");
	link.click();
}

onBeforeUnmount(() => {
	disposed = true;
	stop();
});
</script>

<template>
	<main class="min-h-screen bg-slate-950 p-6 text-white">
		<div class="mx-auto max-w-5xl space-y-6">
			<header>
				<h1 class="text-3xl font-bold">Handfinity Paint</h1>
				<p class="text-slate-400">Draw in the air with your hands.</p>
			</header>

			<div
				class="relative mx-auto w-full overflow-hidden rounded-xl bg-black"
				:style="{ aspectRatio: cameraAspect }"
			>
				<video
					ref="videoRef"
					autoplay
					muted
					playsinline
					aria-label="Live camera preview"
					class="absolute inset-0 h-full w-full -scale-x-100"
				/>

				<canvas
					ref="canvasRef"
					aria-label="Drawing canvas"
					class="pointer-events-none absolute inset-0 h-full w-full"
				/>

				<canvas
					ref="previewCanvasRef"
					aria-hidden="true"
					class="pointer-events-none absolute inset-0 h-full w-full"
				/>

				<div
					v-if="pointer"
					aria-hidden="true"
					data-gesture-cursor
					:data-state="gestureFeedback.state"
					class="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-slate-950/70 transition-[width,height,box-shadow] duration-100 motion-reduce:transition-none"
					:class="gestureFeedback.state === 'drawing'
						? 'size-7 ring-4 ring-green-400/60'
						: gestureFeedback.state === 'paused'
							? 'size-6 border-dashed ring-2 ring-amber-300/60'
							: 'size-5 ring-2 ring-sky-400/60'"
					:style="{
				left: `${(1 - pointer.x) * 100}%`,
				top: `${pointer.y * 100}%`,
			}"
				>
					<span
						v-if="gestureFeedback.state === 'drawing'"
						class="size-2.5 rounded-full border border-white"
						:style="{ backgroundColor: activeStroke?.color }"
					/>
				</div>
			</div>

			<div
				role="status"
				aria-live="polite"
				aria-atomic="true"
				class="rounded-lg border border-slate-700 bg-slate-900 px-4 py-3"
			>
				<p class="text-sm font-semibold" :class="gestureFeedback.color">
					{{ gestureFeedback.label }}
				</p>
				<p class="mt-1 text-sm text-slate-300">{{ gestureFeedback.help }}</p>
			</div>

			<fieldset class="min-w-0 rounded-lg border border-slate-700 px-4 pb-4">
				<legend class="px-2 text-sm font-medium text-slate-300">Brush</legend>
				<div class="flex flex-wrap items-center gap-6">
					<div class="flex items-center gap-3">
						<label for="brush-color" class="text-sm">Color</label>
						<input
							id="brush-color"
							v-model="brushColor"
							type="color"
							aria-describedby="brush-help"
							class="h-10 w-12 cursor-pointer rounded border border-slate-600 bg-slate-800 p-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
						>
					</div>
					<div class="space-y-1">
						<label
							for="brush-width"
							class="flex items-center justify-between gap-4 text-sm"
						>
							Width
							<output for="brush-width" class="tabular-nums text-slate-300"
								>{{ brushWidth }}
								px</output
							>
						</label>
						<input
							id="brush-width"
							v-model.number="brushWidth"
							type="range"
							min="1"
							max="40"
							step="1"
							aria-describedby="brush-help"
							class="w-40 cursor-pointer accent-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
						>
					</div>
					<svg
						role="img"
						aria-label="Brush preview"
						viewBox="0 0 96 48"
						class="h-12 w-24 rounded border border-slate-600"
						style="background-image: conic-gradient(#cbd5e1 25%, #f8fafc 0 50%, #cbd5e1 0 75%, #f8fafc 0); background-size: 12px 12px"
					>
						<title>Brush preview</title>
						<path
							d="M 24 24 H 72"
							:stroke="brushColor"
							:stroke-width="brushWidth"
							stroke-linecap="round"
						/>
					</svg>
				</div>
				<p id="brush-help" class="mt-3 text-xs text-slate-400">
					New settings apply to the next stroke.
				</p>
			</fieldset>

			<div class="flex flex-wrap items-center gap-3">
				<button
					type="button"
					:disabled="isLoading"
					@click="toggleCamera"
					class="rounded-lg bg-blue-600 px-5 py-3 font-medium hover:bg-blue-500 disabled:opacity-50"
				>
					{{
						isLoading
							? "Initializing..."
							: isRunning
								? "Stop camera"
								: "Start camera"
					}}
				</button>

				<button
					type="button"
					:disabled="!canUndo || isPinching || isLoading"
					@click="undo"
					class="rounded-lg bg-slate-800 px-5 py-3 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Undo
				</button>

				<button
					type="button"
					:disabled="!canRedo || isPinching || isLoading"
					@click="redo"
					class="rounded-lg bg-slate-800 px-5 py-3 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Redo
				</button>

				<button
					type="button"
					@click="clearCanvas"
					class="rounded-lg bg-slate-800 px-5 py-3 hover:bg-slate-700"
				>
					Clear
				</button>

				<button
					type="button"
					@click="exportPng"
					class="rounded-lg bg-slate-800 px-5 py-3 hover:bg-slate-700"
				>
					Export PNG
				</button>
			</div>

			<p v-if="error" role="alert" class="text-red-400">
				{{ error }}
			</p>
		</div>
	</main>
</template>
