<script setup lang="ts">
import type { PointerSimulationFrame } from "../pointer-simulation";

defineProps<{ frame: PointerSimulationFrame }>();
</script>

<template>
	<section
		aria-labelledby="pointer-commands-title"
		data-pointer-commands
		class="space-y-3 rounded-lg bg-slate-900 p-4 text-sm"
	>
		<div class="flex flex-wrap items-center justify-between gap-2">
			<h2 id="pointer-commands-title" class="font-medium">Pointer commands</h2>
			<span class="rounded bg-sky-950 px-2 py-1 text-xs text-sky-300"
				>Simulation only</span
			>
		</div>
		<p class="text-slate-400">
			Only the main pointing hand moves this cursor. It keeps its last position
			when no command is sent.
		</p>
		<div
			role="img"
			:aria-label="frame.position ? `Simulated cursor at x ${frame.position.x.toFixed(3)}, y ${frame.position.y.toFixed(3)}` : 'Pointer simulation waiting for a move command'"
			data-pointer-simulation
			class="relative aspect-video overflow-hidden rounded-lg border border-slate-700 bg-slate-950"
		>
			<div
				aria-hidden="true"
				class="absolute inset-0 grid grid-cols-4 grid-rows-3 opacity-40"
			>
				<span
					v-for="cell in 12"
					:key="cell"
					class="border-r border-b border-slate-700"
				/>
			</div>
			<span
				v-if="frame.position"
				data-simulated-pointer
				class="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-100 bg-sky-400"
				:style="{ left: `${frame.position.x * 100}%`, top: `${frame.position.y * 100}%` }"
			/>
			<p
				v-else
				class="absolute inset-0 flex items-center justify-center p-4 text-center text-slate-400"
			>
				Waiting for a move command.
			</p>
		</div>
		<p v-if="frame.position" class="font-mono text-xs text-slate-400">
			Destination x: {{ frame.position.x.toFixed(3) }} · y:
			{{ frame.position.y.toFixed(3) }}
		</p>
		<h3 class="font-medium">Command log · {{ frame.commandCount }} received</h3>
		<p v-if="!frame.commands.length" class="text-slate-400">
			No pointer commands yet.
		</p>
		<ol v-else class="space-y-2" aria-label="Latest pointer commands">
			<li
				v-for="command in frame.commands"
				:key="`${command.timestamp}-${command.handId}`"
				class="rounded-lg border border-slate-700 p-2 font-mono text-xs"
			>
				<p class="text-sky-300">
					{{ command.type }} · Hand #{{ command.handId }}
				</p>
				<p class="mt-1 text-slate-400">
					{{ command.timestamp.toFixed(1) }} ms · x:
					{{ command.position.x.toFixed(3) }} · y:
					{{ command.position.y.toFixed(3) }}
				</p>
			</li>
		</ol>
		<p class="text-xs text-slate-400">Last 8 commands, newest first.</p>
	</section>
</template>
