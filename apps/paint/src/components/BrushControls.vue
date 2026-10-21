<script setup lang="ts">
import { MIN_BRUSH_WIDTH, MAX_BRUSH_WIDTH } from "../lib/brush";

const color = defineModel<string>("color", { required: true });
const width = defineModel<number>("width", { required: true });
</script>

<template>
	<fieldset class="min-w-0 rounded-lg border border-slate-700 px-4 pb-4">
		<legend class="px-2 text-sm font-medium text-slate-300">Brush</legend>
		<div class="flex flex-wrap items-center gap-6">
			<div class="flex items-center gap-3">
				<label for="brush-color" class="text-sm">Color</label>
				<input
					id="brush-color"
					v-model="color"
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
						>{{ width }}
						px</output
					>
				</label>
				<input
					id="brush-width"
					v-model.number="width"
					type="range"
					:min="MIN_BRUSH_WIDTH"
					:max="MAX_BRUSH_WIDTH"
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
					:stroke="color"
					:stroke-width="width"
					stroke-linecap="round"
				/>
			</svg>
		</div>
		<p id="brush-help" class="mt-3 text-xs text-slate-400">
			New settings apply to the next stroke.
		</p>
	</fieldset>
</template>
