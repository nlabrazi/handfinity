<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { startCamera, stopCamera } from "@handfinity/vision";

const videoRef = ref<HTMLVideoElement | null>(null);
const isRunning = ref(false);
const error = ref("");

let stream: MediaStream | null = null;

async function toggleCamera() {
	if (stream) {
		stopCamera(stream);
		stream = null;

		if (videoRef.value) {
			videoRef.value.srcObject = null;
		}

		isRunning.value = false;
		return;
	}

	if (!videoRef.value) return;

	try {
		error.value = "";
		stream = await startCamera(videoRef.value);
		isRunning.value = true;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "Camera unavailable";
	}
}

onBeforeUnmount(() => {
	if (stream) stopCamera(stream);
});
</script>

<template>
	<main class="min-h-screen bg-slate-950 p-8 text-white">
		<div class="mx-auto max-w-4xl space-y-6">
			<header>
				<h1 class="text-3xl font-bold">Handfinity</h1>
				<p class="text-slate-400">Vision Playground</p>
			</header>

			<div class="overflow-hidden rounded-xl bg-black">
				<video
					ref="videoRef"
					autoplay
					muted
					playsinline
					aria-label="Live camera preview"
					class="aspect-video w-full object-cover"
				/>
			</div>

			<button
				type="button"
				@click="toggleCamera"
				class="rounded-lg bg-blue-600 px-5 py-3 font-medium hover:bg-blue-500"
			>
				{{ isRunning ? "Stop camera" : "Start camera" }}
			</button>

			<p v-if="error" role="alert" class="text-red-400">
				{{ error }}
			</p>
		</div>
	</main>
</template>
