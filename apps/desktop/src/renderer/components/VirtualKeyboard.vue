<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
	disabled?: boolean;
}>();

const emit = defineEmits<{
	"press-key": [key: string];
	close: [];
}>();

const layout = ref<"azerty" | "qwerty">("azerty");
const uppercase = ref(false);
const lastSentKey = ref<string | null>(null);

const rows = computed(() => {
	const base =
		layout.value === "azerty"
			? [
					["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
					["a", "z", "e", "r", "t", "y", "u", "i", "o", "p"],
					["q", "s", "d", "f", "g", "h", "j", "k", "l", "m"],
					["w", "x", "c", "v", "b", "n", ",", ".", "-", "'"],
				]
			: [
					["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
					["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
					["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"],
					["z", "x", "c", "v", "b", "n", "m", ",", ".", "-"],
				];
	return base.map((row) =>
		row.map((ch) => (uppercase.value ? ch.toUpperCase() : ch)),
	);
});

const specialKeys = [
	{ label: "⌫ Backspace", value: "Backspace" },
	{ label: "⇥ Tab", value: "Tab" },
	{ label: "␣ Space", value: "Space" },
	{ label: "↵ Enter", value: "Enter" },
	{ label: "←", value: "ArrowLeft" },
	{ label: "↑", value: "ArrowUp" },
	{ label: "↓", value: "ArrowDown" },
	{ label: "→", value: "ArrowRight" },
] as const;

function send(key: string) {
	if (props.disabled) return;
	lastSentKey.value = key;
	emit("press-key", key);
}
</script>

<template>
	<section
		data-virtual-keyboard
		aria-labelledby="virtual-keyboard-title"
		class="space-y-3 rounded-xl border border-cyan-500/40 bg-slate-900/95 p-4 text-sm shadow-2xl shadow-cyan-950/60 backdrop-blur-md"
	>
		<div
			class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3"
		>
			<div class="flex items-center gap-2">
				<span
					class="rounded bg-cyan-950 px-2 py-0.5 text-xs font-semibold text-cyan-400 border border-cyan-800"
				>
					POP-UP
				</span>
				<div>
					<h2 id="virtual-keyboard-title" class="font-medium text-white">
						Clavier virtuel Windows
					</h2>
					<p class="text-xs text-slate-400">
						Pointez et pincez une touche · Geste : rapprochez puis écartez les
						paumes 👐
					</p>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<span
					v-if="lastSentKey"
					class="rounded bg-slate-800 px-2 py-1 font-mono text-xs text-cyan-300"
				>
					Touche : {{ lastSentKey }}
				</span>
				<button
					type="button"
					@click="uppercase = !uppercase"
					:aria-pressed="uppercase"
					class="rounded border border-slate-600 px-2.5 py-1 text-xs font-medium hover:bg-slate-800"
					:class="uppercase ? 'bg-cyan-800 text-white' : 'bg-slate-950 text-slate-300'"
				>
					⇧ Maj
				</button>
				<button
					type="button"
					@click="layout = layout === 'azerty' ? 'qwerty' : 'azerty'"
					class="rounded border border-slate-600 bg-slate-950 px-2.5 py-1 text-xs font-medium uppercase text-slate-300 hover:bg-slate-800"
				>
					{{ layout }}
				</button>
				<button
					type="button"
					data-close-keyboard
					@click="emit('close')"
					aria-label="Fermer le clavier virtuel"
					class="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300 hover:border-slate-500 hover:bg-slate-700 hover:text-white"
				>
					✕ Fermer
				</button>
			</div>
		</div>

		<div class="space-y-1.5">
			<div
				v-for="(row, rowIndex) in rows"
				:key="rowIndex"
				class="grid grid-cols-10 gap-1.5"
			>
				<button
					v-for="key in row"
					:key="key"
					type="button"
					:disabled="disabled"
					@click="send(key)"
					class="rounded-md border border-slate-700 bg-slate-950 py-2.5 font-mono text-sm font-semibold text-white hover:border-cyan-500 hover:bg-slate-800 active:bg-cyan-700 disabled:opacity-40"
				>
					{{ key }}
				</button>
			</div>

			<div class="grid grid-cols-4 gap-1.5 pt-1 sm:grid-cols-8">
				<button
					v-for="special in specialKeys"
					:key="special.value"
					type="button"
					:disabled="disabled"
					@click="send(special.value)"
					class="rounded-md border border-slate-700 bg-slate-800/80 px-2 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500 hover:bg-slate-700 active:bg-cyan-700 disabled:opacity-40"
				>
					{{ special.label }}
				</button>
			</div>
		</div>
	</section>
</template>
