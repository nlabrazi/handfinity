<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";

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

const opacityOptions = [
	{
		label: "20%",
		class:
			"bg-slate-950/20 border-cyan-500/25 shadow-black/40 backdrop-blur-md",
	},
	{
		label: "40%",
		class:
			"bg-slate-950/40 border-cyan-500/35 shadow-black/60 backdrop-blur-lg",
	},
	{
		label: "70%",
		class:
			"bg-slate-900/70 border-cyan-500/45 shadow-black/80 backdrop-blur-xl",
	},
] as const;

const opacityIndex = ref(0);
const currentOpacityClass = computed(
	() => opacityOptions[opacityIndex.value]?.class ?? opacityOptions[0].class,
);
const currentOpacityLabel = computed(
	() => opacityOptions[opacityIndex.value]?.label ?? "20%",
);

function cycleOpacity() {
	opacityIndex.value = (opacityIndex.value + 1) % opacityOptions.length;
}

let isDragging = false;
let lastScreenX = 0;
let lastScreenY = 0;

function onDragStart(event: PointerEvent) {
	if (event.button !== 0) return;
	isDragging = true;
	lastScreenX = event.screenX;
	lastScreenY = event.screenY;
	const target = event.currentTarget as HTMLElement | null;
	target?.setPointerCapture(event.pointerId);
	window.addEventListener("pointermove", onDragMove);
	window.addEventListener("pointerup", onDragEnd);
	window.addEventListener("pointercancel", onDragEnd);
}

function onDragMove(event: PointerEvent) {
	if (!isDragging) return;
	const deltaX = event.screenX - lastScreenX;
	const deltaY = event.screenY - lastScreenY;
	lastScreenX = event.screenX;
	lastScreenY = event.screenY;
	if (deltaX !== 0 || deltaY !== 0) {
		window.handfinityOverlay?.moveBy(deltaX, deltaY);
	}
}

function onDragEnd() {
	isDragging = false;
	window.removeEventListener("pointermove", onDragMove);
	window.removeEventListener("pointerup", onDragEnd);
	window.removeEventListener("pointercancel", onDragEnd);
}

function resetPosition() {
	window.handfinityOverlay?.resetPosition();
}

onBeforeUnmount(() => {
	onDragEnd();
});

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
		class="space-y-2 rounded-2xl border p-3 text-sm shadow-2xl transition-all duration-200 select-none"
		:class="currentOpacityClass"
	>
		<!-- Poignée de glisser-déposer supérieure -->
		<div
			data-drag-handle
			@pointerdown="onDragStart"
			class="flex cursor-grab items-center justify-center rounded-lg border border-white/10 bg-white/5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-cyan-400/40 hover:bg-white/10 active:cursor-grabbing"
			title="Cliquer et glisser pour déplacer le clavier sur l'écran"
		>
			<span class="flex items-center gap-1.5">
				<span class="font-mono text-cyan-400">⠿</span>
				<span>Glisser pour déplacer le clavier</span>
			</span>
		</div>

		<div
			class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2"
		>
			<div class="flex items-center gap-2">
				<span
					class="rounded bg-cyan-950/60 px-2 py-0.5 text-xs font-semibold text-cyan-300 border border-cyan-800/50"
				>
					OVERLAY
				</span>
				<div>
					<h2
						id="virtual-keyboard-title"
						class="font-medium text-white/95 text-xs"
					>
						Clavier virtuel Windows
					</h2>
					<p class="text-[11px] text-slate-400">
						Sans perte de focus · Pointez et cliquez ou touchez
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5 text-xs">
				<span
					v-if="lastSentKey"
					class="rounded bg-slate-800/60 px-2 py-0.5 font-mono text-cyan-300 border border-cyan-700/40"
				>
					{{ lastSentKey }}
				</span>
				<button
					type="button"
					@click="resetPosition"
					title="Recentrer le clavier en bas de l'écran"
					class="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300 hover:bg-white/15"
				>
					↺ Recentrer
				</button>
				<button
					type="button"
					@click="cycleOpacity"
					title="Changer le niveau de transparence"
					class="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300 hover:bg-white/15"
				>
					Transparence : {{ currentOpacityLabel }}
				</button>
				<button
					type="button"
					@click="uppercase = !uppercase"
					:aria-pressed="uppercase"
					class="rounded border px-2 py-0.5 font-medium transition-colors"
					:class="uppercase ? 'bg-cyan-600/50 text-white border-cyan-400/60' : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/15'"
				>
					⇧ Maj
				</button>
				<button
					type="button"
					@click="layout = layout === 'azerty' ? 'qwerty' : 'azerty'"
					class="rounded border border-white/15 bg-white/5 px-2 py-0.5 font-medium uppercase text-slate-300 hover:bg-white/15"
				>
					{{ layout }}
				</button>
				<button
					type="button"
					data-close-keyboard
					@click="emit('close')"
					aria-label="Fermer le clavier virtuel"
					class="rounded-lg border border-red-500/30 bg-red-950/30 px-2 py-0.5 font-medium text-red-300 hover:bg-red-900/50 hover:text-white"
				>
					✕
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
					class="rounded-lg border border-white/10 bg-slate-900/30 py-2 font-mono text-sm font-semibold text-white/95 shadow-sm transition-all hover:border-cyan-400/60 hover:bg-cyan-950/40 active:bg-cyan-500/50 disabled:opacity-30"
				>
					{{ key }}
				</button>
			</div>

			<div class="grid grid-cols-4 gap-1.5 pt-0.5 sm:grid-cols-8">
				<button
					v-for="special in specialKeys"
					:key="special.value"
					type="button"
					:disabled="disabled"
					@click="send(special.value)"
					class="rounded-lg border border-white/10 bg-slate-800/30 px-2 py-1.5 text-xs font-medium text-slate-200/90 shadow-sm transition-all hover:border-cyan-400/60 hover:bg-cyan-950/40 active:bg-cyan-500/50 disabled:opacity-30"
				>
					{{ special.label }}
				</button>
			</div>
		</div>
	</section>
</template>
