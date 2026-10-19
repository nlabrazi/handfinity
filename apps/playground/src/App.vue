<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import {
	createHandTracker,
	HAND_CONNECTIONS,
	startCamera,
	stopCamera,
	type HandPoint,
	type HandTracker,
} from "@handfinity/vision";

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const isRunning = ref(false);
const isLoading = ref(false);
const handCount = ref(0);
const error = ref("");

let stream: MediaStream | null = null;
let tracker: HandTracker | null = null;
let frameId = 0;
let lastVideoTime = -1;
let disposed = false;

function drawHands(hands: HandPoint[][]) {
	const canvas = canvasRef.value;
	const video = videoRef.value;
	if (!canvas || !video) return;

	if (
		canvas.width !== video.videoWidth ||
		canvas.height !== video.videoHeight
	) {
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
	}

	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	for (const points of hands) {
		ctx.strokeStyle = "#22d3ee";
		ctx.lineWidth = 3;

		for (const connection of HAND_CONNECTIONS) {
			const start = points[connection.start];
			const end = points[connection.end];
			if (!start || !end) continue;

			ctx.beginPath();
			ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
			ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
			ctx.stroke();
		}

		ctx.fillStyle = "#facc15";

		for (const point of points) {
			ctx.beginPath();
			ctx.arc(
				point.x * canvas.width,
				point.y * canvas.height,
				5,
				0,
				Math.PI * 2,
			);
			ctx.fill();
		}
	}
}

function detectFrame() {
	const video = videoRef.value;
	if (!video || !tracker) return;

	try {
		if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
			lastVideoTime = video.currentTime;

			const hands = tracker.detect(video, performance.now());

			handCount.value = hands.length;
			drawHands(hands);
		}

		frameId = requestAnimationFrame(detectFrame);
	} catch (err) {
		stop();
		error.value = err instanceof Error ? err.message : "Tracking failed";
	}
}

function stop() {
	cancelAnimationFrame(frameId);

	tracker?.close();
	tracker = null;

	if (stream) stopCamera(stream);
	stream = null;

	if (videoRef.value) videoRef.value.srcObject = null;

	const canvas = canvasRef.value;
	if (canvas) {
		canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
	}

	isRunning.value = false;
	handCount.value = 0;
	lastVideoTime = -1;
}

async function toggleCamera() {
	if (isLoading.value) return;

	if (isRunning.value) {
		stop();
		return;
	}

	const video = videoRef.value;
	if (!video) return;

	isLoading.value = true;
	error.value = "";

	try {
		stream = await startCamera(video);

		if (disposed) {
			stop();
			return;
		}

		tracker = await createHandTracker();

		if (disposed) {
			stop();
			return;
		}

		isRunning.value = true;
		detectFrame();
	} catch (err) {
		stop();
		error.value = err instanceof Error ? err.message : "Camera unavailable";
	} finally {
		isLoading.value = false;
	}
}

onBeforeUnmount(() => {
	disposed = true;
	stop();
});
</script>

<template>
	<main class="min-h-screen bg-slate-950 p-8 text-white">
		<div class="mx-auto max-w-4xl space-y-6">
			<header>
				<h1 class="text-3xl font-bold">Handfinity</h1>
				<p class="text-slate-400">Vision Playground</p>
			</header>

			<div class="relative aspect-video overflow-hidden rounded-xl bg-black">
				<video
					ref="videoRef"
					autoplay
					muted
					playsinline
					aria-label="Live camera preview"
					class="absolute inset-0 h-full w-full -scale-x-100 object-contain"
				/>

				<canvas
					ref="canvasRef"
					aria-hidden="true"
					class="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-contain"
				/>
			</div>

			<div class="flex items-center gap-4">
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

				<span class="text-sm text-slate-400">
					Hands detected: {{ handCount }}
				</span>
			</div>

			<p v-if="error" role="alert" class="text-red-400">
				{{ error }}
			</p>
		</div>
	</main>
</template>
