<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
	startPinchSession,
	type PinchEvent,
	type PinchSession,
	type Point,
} from "@handfinity/vision";

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const isRunning = ref(false);
const isLoading = ref(false);
const isPinching = ref(false);
const pointer = ref<Point | null>(null);
const error = ref("");
const cameraAspect = ref("16 / 9");

let session: PinchSession | null = null;
let lastPoint: Point | null = null;
let drawing = false;
let disposed = false;

const BRUSH_COLOR = "#38bdf8";

function toCanvasPoint(point: Point, canvas: HTMLCanvasElement) {
	// La webcam est affichée en miroir.
	return {
		x: (1 - point.x) * canvas.width,
		y: point.y * canvas.height,
	};
}

function handleGesture(event: PinchEvent) {
	const canvas = canvasRef.value;
	const ctx = canvas?.getContext("2d");
	if (!canvas || !ctx) return;

	isPinching.value = event.type !== "pinch:end";

	if (event.type === "pinch:end") {
		drawing = false;
		lastPoint = null;
		return;
	}

	const current = toCanvasPoint(event.position, canvas);

	ctx.strokeStyle = BRUSH_COLOR;
	ctx.fillStyle = BRUSH_COLOR;
	ctx.lineWidth = Math.max(3, canvas.width * 0.005);
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	if (event.type === "pinch:start") {
		drawing = true;
		lastPoint = event.position;

		ctx.beginPath();
		ctx.arc(current.x, current.y, ctx.lineWidth / 2, 0, Math.PI * 2);
		ctx.fill();
		return;
	}

	if (drawing && lastPoint) {
		const previous = toCanvasPoint(lastPoint, canvas);

		ctx.beginPath();
		ctx.moveTo(previous.x, previous.y);
		ctx.lineTo(current.x, current.y);
		ctx.stroke();
	}

	lastPoint = event.position;
}

function stop() {
	session?.stop();
	session = null;
	isRunning.value = false;
	isPinching.value = false;
	pointer.value = null;
	lastPoint = null;
	drawing = false;
}

async function toggleCamera() {
	if (isLoading.value) return;

	if (isRunning.value) {
		stop();
		return;
	}

	const video = videoRef.value;
	const canvas = canvasRef.value;
	if (!video || !canvas) return;

	isLoading.value = true;
	error.value = "";

	try {
		const controller = await startPinchSession(video, {
			onGesture: handleGesture,
			onPointer: (point) => {
				pointer.value = point;
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

	canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);

	lastPoint = null;
	drawing = false;
}

function exportPng() {
	const canvas = canvasRef.value;
	if (!canvas) return;

	const link = document.createElement("a");
	link.download = "handfinity-paint.png";
	link.href = canvas.toDataURL("image/png");
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
