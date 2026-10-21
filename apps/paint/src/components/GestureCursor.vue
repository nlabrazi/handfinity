<script setup lang="ts">
import type { Point } from "@handfinity/vision";
import type { GestureFeedback } from "../lib/gesture-feedback";

defineProps<{
	pointer: Point | null;
	state: GestureFeedback["state"];
	color?: string;
}>();
</script>

<template>
	<div
		v-if="pointer"
		aria-hidden="true"
		data-gesture-cursor
		:data-state="state"
		class="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-slate-950/70 transition-[width,height,box-shadow] duration-100 motion-reduce:transition-none"
		:class="state === 'drawing'
			? 'size-7 ring-4 ring-green-400/60'
			: state === 'paused'
				? 'size-6 border-dashed ring-2 ring-amber-300/60'
				: 'size-5 ring-2 ring-sky-400/60'"
		:style="{
	left: `${(1 - pointer.x) * 100}%`,
	top: `${pointer.y * 100}%`,
}"
	>
		<span
			v-if="state === 'drawing'"
			class="size-2.5 rounded-full border border-white"
			:style="{ backgroundColor: color }"
		/>
	</div>
</template>
