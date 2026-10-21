<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
	startPinchSession,
	type PinchEvent,
	type PinchSession,
	type Point,
} from "@handfinity/vision";
import { createSmoothStroke } from "./lib/smooth-stroke";
import { createPointSmoother } from "./lib/point-smoother";

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const previewCanvasRef = ref<HTMLCanvasElement | null>(null);

const isRunning = ref(false);
const isLoading = ref(false);
const isPinching = ref(false);
const pointer = ref<Point | null>(null);
const error = ref("");
const cameraAspect = ref("16 / 9");
const brushColor = ref("#38bdf8");
const brushWidth = ref(6);

let session: PinchSession | null = null;
let stroke: ReturnType<typeof createSmoothStroke> | null = null;
const pointSmoother = createPointSmoother();
let disposed = false;

function toCanvasPoint(point: Point, canvas: HTMLCanvasElement): Point {
	// La webcam est affichée en miroir ; le dessin reste dans le bon sens.
	return {
		x: (1 - point.x) * canvas.width,
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
	const point = toCanvasPoint(pointer.value, canvas);

	if (event.type === "pinch:start") {
		finishStroke();

		// Copier les réglages pour garder le même style jusqu'à la fin du trait.
		stroke = createSmoothStroke(ctx, previewCtx, {
			color: brushColor.value,
			width: brushWidth.value,
		});
		stroke.start(point);
		return;
	}

	if (event.type === "pinch:move" && stroke) {
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

	stroke?.cancel();
	stroke = null;
	clearPreview();
	canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
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
					class="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
					:class="isPinching ? 'bg-green-400' : 'bg-sky-400'"
					:style="{
				left: `${(1 - pointer.x) * 100}%`,
				top: `${pointer.y * 100}%`,
			}"
				/>
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

				<span
					class="text-sm"
					:class="isPinching ? 'text-green-400' : 'text-slate-400'"
				>
					{{ isPinching ? "Drawing..." : "Ready" }}
				</span>
			</div>

			<p v-if="error" role="alert" class="text-red-400">
				{{ error }}
			</p>
		</div>
	</main>
</template>
