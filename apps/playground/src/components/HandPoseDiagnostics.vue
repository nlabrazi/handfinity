<script setup lang="ts">
import type { HandPoseKind, TrackedHandPose } from "@handfinity/core";

defineProps<{ hands: readonly TrackedHandPose[] }>();

const poseLabels: Record<HandPoseKind, string> = {
	unknown: "Unknown",
	pointing: "Pointing",
	"open-palm": "Open palm",
	pinch: "Pinch",
};

const fingers = [
	{ key: "thumb", label: "Thumb" },
	{ key: "index", label: "Index" },
	{ key: "middle", label: "Middle" },
	{ key: "ring", label: "Ring" },
	{ key: "pinky", label: "Little" },
] as const;
</script>

<template>
	<section
		aria-labelledby="pose-diagnostics-title"
		class="space-y-3 rounded-lg bg-slate-900 p-3 text-sm"
		data-pose-diagnostics
	>
		<h2 id="pose-diagnostics-title" class="font-medium">Hand poses</h2>
		<p class="text-slate-400">
			Point your index, open your palm or pinch. Hold the pose briefly to
			confirm it.
		</p>
		<p v-if="!hands.length" class="text-slate-400">No identified hands.</p>
		<div
			v-for="hand in hands"
			:key="hand.handId"
			:data-pose-hand="hand.handId"
			class="space-y-2 rounded-lg border border-slate-700 p-3"
		>
			<p class="font-medium">Hand #{{ hand.handId }}</p>
			<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
				<dt class="text-slate-400">Confirmed</dt>
				<dd
					:class="hand.pose === 'unknown' ? 'text-slate-400' : 'text-sky-300'"
				>
					{{ poseLabels[hand.pose] }}
				</dd>
				<dt class="text-slate-400">Candidate</dt>
				<dd>
					{{ poseLabels[hand.candidate]
					}}<span v-if="hand.pending" class="text-amber-300">
						· confirming</span
					>
				</dd>
			</dl>
			<template v-if="hand.measurements">
				<ul
					class="flex flex-wrap gap-1.5"
					aria-label="Estimated finger extension"
				>
					<li
						v-for="finger in fingers"
						:key="finger.key"
						class="rounded bg-slate-800 px-2 py-1 text-xs"
						:class="{
						'text-emerald-300': hand.measurements.fingers[finger.key] === 'extended',
						'text-slate-400': hand.measurements.fingers[finger.key] === 'folded',
						'text-amber-300': hand.measurements.fingers[finger.key] === 'uncertain',
					}"
					>
						{{ finger.label }}: {{ hand.measurements.fingers[finger.key] }}
					</li>
				</ul>
				<p class="text-xs text-slate-400">
					Pinch ratio: {{ hand.measurements.pinchRatio.toFixed(2) }}
				</p>
			</template>
			<p v-else class="text-xs text-slate-400">
				{{
					hand.status === "missing"
						? "Tracking interrupted. Hold the pose again when your hand returns."
						: "Landmarks unavailable."
				}}
			</p>
		</div>
	</section>
</template>
