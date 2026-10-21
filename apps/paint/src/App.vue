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

let session: PinchSession | null = null;
let stroke: ReturnType<typeof createSmoothStroke> | null = null;
const pointSmoother = createPointSmoother();
let disposed = false;

const BRUSH_COLOR = "#38bdf8";

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

		stroke = createSmoothStroke(ctx, previewCtx, {
			color: BRUSH_COLOR,
			width: Math.max(3, canvas.width * 0.005),
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
