<script setup lang="ts">
import {
	computed,
	onBeforeUnmount,
	onMounted,
	ref,
	useTemplateRef,
	watch,
} from "vue";
import type { Point } from "@handfinity/core";

const props = defineProps<{ pointer: Point | null; isRunning: boolean }>();
const boardRef = useTemplateRef<HTMLDivElement>("board");
const cardsRef = useTemplateRef<HTMLLIElement[]>("cards");
const hoveredId = ref<string | null>(null);
let observer: ResizeObserver | null = null;

const projects = [
	{
		id: "paint",
		title: "Paint",
		description: "Draw in the air.",
		label: "Creative space",
		symbol: "01",
	},
	{
		id: "playground",
		title: "Playground",
		description: "Explore your gestures.",
		label: "Experiment",
		symbol: "02",
	},
	{
		id: "project-03",
		title: "Project 03",
		description: "More ways to interact.",
		label: "Coming soon",
		symbol: "03",
	},
	{
		id: "project-04",
		title: "Project 04",
		description: "Room for new ideas.",
		label: "Coming soon",
		symbol: "04",
	},
];

// Même repère normalisé que la caméra ; appliquer le miroir à l'affichage.
const boardPointer = computed(() =>
	props.pointer
		? {
				x: Math.max(0, Math.min(1, 1 - props.pointer.x)),
				y: Math.max(0, Math.min(1, props.pointer.y)),
			}
		: null,
);
const hoveredProject = computed(() =>
	projects.find((project) => project.id === hoveredId.value),
);
const status = computed(() => {
	if (!props.isRunning)
		return "Start the camera to try hovering with your hand.";
	if (!boardPointer.value) return "Keep one hand visible to move the cursor.";
	return hoveredProject.value
		? `Hovering: ${hoveredProject.value.title}`
		: "Move the cursor onto a card.";
});

function updateHover() {
	hoveredId.value = null;
	const point = boardPointer.value;
	const board = boardRef.value;
	if (!point || !board) return;
	const bounds = board.getBoundingClientRect();
	const x = bounds.left + point.x * bounds.width;
	const y = bounds.top + point.y * bounds.height;
	// Mesurer les cibles affichées pour suivre aussi les changements de disposition.
	const target = cardsRef.value?.find((card) => {
		const rect = card.getBoundingClientRect();
		return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
	});
	hoveredId.value = target?.dataset.project ?? null;
}

watch(boardPointer, updateHover, { flush: "post" });
onMounted(() => {
	observer = new ResizeObserver(updateHover);
	if (boardRef.value) observer.observe(boardRef.value);
	updateHover();
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
	<section aria-labelledby="navigation-title" class="min-w-0 space-y-4">
		<header>
			<p class="text-xs font-medium uppercase tracking-widest text-sky-400">
				Hover practice
			</p>
			<h2 id="navigation-title" class="mt-1 text-xl font-semibold">
				Navigation sandbox
			</h2>
			<p class="mt-1 text-sm text-slate-400">
				Move your index finger to highlight a card.
			</p>
		</header>

		<div
			ref="board"
			data-navigation-board
			class="relative rounded-2xl bg-slate-900 p-4 sm:p-6"
		>
			<ul class="grid grid-cols-2 gap-3 sm:gap-4">
				<li
					v-for="project in projects"
					:key="project.id"
					ref="cards"
					:data-project="project.id"
					:data-hovered="hoveredId === project.id"
					class="min-w-0 rounded-xl border p-3 transition-colors duration-150 motion-reduce:transition-none sm:p-5"
					:class="hoveredId === project.id ? 'border-sky-300 bg-sky-400/15 ring-2 ring-sky-300/30' : 'border-slate-700 bg-slate-950/60'"
				>
					<div
						class="mb-5 flex items-center justify-between gap-2"
						aria-hidden="true"
					>
						<span class="text-sm font-medium tabular-nums text-slate-400">{{
							project.symbol
						}}</span>
						<span
							class="flex size-6 items-center justify-center rounded-full border"
							:class="hoveredId === project.id ? 'border-sky-300' : 'border-slate-600'"
						>
							<span
								class="size-2 rounded-full bg-sky-300"
								:class="hoveredId === project.id ? 'opacity-100' : 'opacity-0'"
							/>
						</span>
					</div>
					<h3 class="text-base font-semibold sm:text-lg">
						{{ project.title }}
					</h3>
					<p class="mt-1 min-h-10 text-sm text-slate-400">
						{{ project.description }}
					</p>
					<p
						class="mt-4 text-xs font-medium"
						:class="hoveredId === project.id ? 'text-sky-200' : 'text-slate-400'"
					>
						{{ project.label }}
					</p>
				</li>
			</ul>
			<div
				v-if="boardPointer"
				data-navigation-cursor
				aria-hidden="true"
				class="pointer-events-none absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-slate-950/80 ring-4 ring-sky-400/40"
				:style="{ left: `${boardPointer.x * 100}%`, top: `${boardPointer.y * 100}%` }"
			>
				<span class="size-1.5 rounded-full bg-sky-300" />
			</div>
		</div>

		<p
			role="status"
			aria-live="polite"
			aria-atomic="true"
			class="min-h-10 text-sm text-slate-300"
		>
			{{ status }}
		</p>
	</section>
</template>
