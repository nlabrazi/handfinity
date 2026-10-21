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
import {
	createPinchDetector,
	createPointSmoother,
	type HandPose,
	type Point,
} from "@handfinity/core";
import NavigationSandbox from "./components/NavigationSandbox.vue";

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const isRunning = ref(false);
const isLoading = ref(false);
const handCount = ref(0);
const error = ref("");

const pinchActive = ref(false);
const pinchTransition = ref("Aucun");
const pointer = ref<Point | null>(null);

const pinch = createPinchDetector();
const pointSmoother = createPointSmoother();
const POINTER_STALE_MS = 120;
let lastPointerAt: number | null = null;

let stream: MediaStream | null = null;
let tracker: HandTracker | null = null;
let frameId = 0;
let lastVideoTime = -1;
let disposed = false;

function resetPointer() {
	pointer.value = null;
	lastPointerAt = null;
	pointSmoother.reset();
}

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
		ctx.strokeStyle = pinchActive.value ? "#4ade80" : "#22d3ee";
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
		const timestamp = performance.now();
		// Retirer aussi le curseur si le flux cesse de fournir des images.
		if (
			lastPointerAt !== null &&
			timestamp - lastPointerAt > POINTER_STALE_MS
		) {
			resetPointer();
		}
		if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
			lastVideoTime = video.currentTime;

			const hands = tracker.detect(video, timestamp);

			handCount.value = hands.length;

			// V1 : une seule main pour éviter de mélanger les gestes.
			const hand = hands.length === 1 ? hands[0] : undefined;

			const pose: HandPose | null =
				hand?.[0] && hand[4] && hand[8] && hand[9]
					? {
							wrist: hand[0],
							thumbTip: hand[4],
							indexTip: hand[8],
							middleBase: hand[9],
						}
					: null;

			if (pose) {
				pointer.value = pointSmoother.update(pose.indexTip, timestamp);
				lastPointerAt = timestamp;
			} else {
				resetPointer();
			}

			const gesture = pinch.update(
				pose,
				video.videoWidth / video.videoHeight,
				timestamp,
			);

			if (gesture) {
				pinchActive.value = gesture.type !== "pinch:end";

				if (gesture.type !== "pinch:move") {
					pinchTransition.value = gesture.type;
					console.info("[Handfinity]", gesture);
				}
			}

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

	pinch.reset();
	resetPointer();
	pinchActive.value = false;
	pinchTransition.value = "Aucun";
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
	<main class="min-h-screen bg-slate-950 p-4 text-white sm:p-8">
		<div class="mx-auto max-w-6xl space-y-6">
			<header>
				<h1 class="text-3xl font-bold">Handfinity</h1>
				<p class="text-slate-400">Vision Playground</p>
			</header>

			<div class="grid items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
				<section
					aria-label="Camera and gesture diagnostics"
					class="min-w-0 space-y-4"
				>
					<div
						class="relative aspect-video overflow-hidden rounded-xl bg-black"
					>
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

					<div class="flex flex-wrap items-center gap-4">
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

					<div class="flex flex-wrap items-center gap-4 text-sm">
						<span
							class="rounded-lg px-4 py-2 font-medium"
							:class="pinchActive
		            ? 'bg-green-500/20 text-green-400'
		            : 'bg-slate-800 text-slate-400'
		          "
						>
							{{ pinchActive ? "PINCH ACTIVE" : "PINCH INACTIVE" }}
						</span>

						<span class="text-slate-400">
							Last transition: {{ pinchTransition }}
						</span>
					</div>

					<p v-if="error" role="alert" class="text-red-400">
						{{ error }}
					</p>
				</section>

				<NavigationSandbox :pointer="pointer" :is-running="isRunning" />
			</div>
		</div>
	</main>
</template>
