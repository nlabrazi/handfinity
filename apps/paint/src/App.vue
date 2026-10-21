<script setup lang="ts">
import { useTemplateRef } from "vue";
import BrushControls from "./components/BrushControls.vue";
import GestureCursor from "./components/GestureCursor.vue";
import { usePaint } from "./composables/usePaint";

const videoRef = useTemplateRef<HTMLVideoElement>("videoRef");
const canvasRef = useTemplateRef<HTMLCanvasElement>("canvasRef");
const previewCanvasRef = useTemplateRef<HTMLCanvasElement>("previewCanvasRef");

const {
	isRunning,
	isLoading,
	pointer,
	error,
	cameraAspect,
	brushColor,
	brushWidth,
	activeStroke,
	canUndo,
	canRedo,
	gestureFeedback,
	toggleCamera,
	undo,
	redo,
	clearCanvas,
	exportPng,
} = usePaint({ videoRef, canvasRef, previewCanvasRef });
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

				<GestureCursor
					:pointer="pointer"
					:state="gestureFeedback.state"
					:color="activeStroke?.color"
				/>
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

			<BrushControls v-model:color="brushColor" v-model:width="brushWidth" />

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
					:disabled="!canUndo"
					@click="undo"
					class="rounded-lg bg-slate-800 px-5 py-3 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Undo
				</button>

				<button
					type="button"
					:disabled="!canRedo"
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
