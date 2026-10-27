<script setup lang="ts">
import {
	CONTROL_HOLD_MS,
	type GestureControlFrame,
	type HandPointerFrame,
} from "@handfinity/interactions";

defineProps<{
	state: GestureControlFrame;
	running: boolean;
	selectionStatus: HandPointerFrame["selectionStatus"];
}>();
const holdSeconds = CONTROL_HOLD_MS / 1000;
</script>

<template>
	<section
		aria-labelledby="gesture-control-title"
		data-gesture-control
		:data-paused="state.paused"
		class="space-y-3 rounded-lg border p-4 text-sm"
		:class="state.paused ? 'border-amber-600 bg-amber-950/30' : 'border-slate-700 bg-slate-900'"
	>
		<h2 id="gesture-control-title" class="font-medium">Gesture control</h2>
		<p role="status" :class="state.paused ? 'text-amber-300' : 'text-sky-300'">
			{{
				!running
					? "Camera off"
					: state.paused
						? "Paused — pointer movement is blocked."
						: selectionStatus === "tracked"
							? "Ready — point to move the pointer."
							: "Waiting for a visible hand."
			}}
		</p>
		<p class="text-slate-300">
			Hold all five fingers open for {{ holdSeconds }} seconds to
			{{ state.paused ? "resume" : "pause" }} using the controlling hand. If
			both hands are visible, point first to choose the controlling hand.
		</p>
		<template v-if="running && state.requiresRelease">
			<p class="text-amber-300">
				Fold your fingers or point briefly before repeating the gesture.
			</p>
		</template>
		<template v-else-if="running && state.handId !== null">
			<label for="gesture-hold" class="block text-slate-400">
				Hand #{{ state.handId }}
				· {{ state.paused ? "Resuming" : "Pausing" }}…
			</label>
			<progress
				id="gesture-hold"
				max="1"
				:value="state.holdProgress"
				class="h-2 w-full accent-cyan-400"
			/>
		</template>
		<p class="text-xs text-slate-400">
			The camera keeps tracking while paused. Removing your hand keeps the pause
			active; repeat the gesture to resume.
		</p>
	</section>
</template>
