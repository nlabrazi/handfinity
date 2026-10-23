<script setup lang="ts">
import {
	computed,
	onBeforeUnmount,
	onMounted,
	shallowRef,
	useTemplateRef,
	watch,
} from "vue";
import type { TrackedHand } from "@handfinity/core";
import {
	hitTestTargets,
	projectHandPoint,
	type HandPointerFrame,
	type InteractionRect,
	type InteractionTarget,
} from "@handfinity/interactions";

const props = defineProps<{
	frame: HandPointerFrame;
	hands: readonly TrackedHand[];
	isRunning: boolean;
}>();
const emit = defineEmits<{ "primary-hand-change": [handId: number | null] }>();
const boardRef = useTemplateRef<HTMLDivElement>("board");
const cardsRef = useTemplateRef<HTMLLIElement[]>("cards");
const surface = shallowRef<InteractionRect | null>(null);
const targets = shallowRef<readonly InteractionTarget[]>([]);
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

// Pointeurs et cibles utilisent les coordonnées client ; le miroir est appliqué ici.
const boardPointers = computed(() => {
	const bounds = surface.value;
	if (!props.isRunning || !bounds) return [];
	return props.frame.pointers
		.filter((pointer) => pointer.active)
		.flatMap((pointer) => {
			const point = projectHandPoint(pointer.position, bounds, {
				mirrorX: true,
			});
			return point
				? [
						{
							...pointer,
							clientPosition: point,
							left: ((point.x - bounds.left) / bounds.width) * 100,
							top: ((point.y - bounds.top) / bounds.height) * 100,
						},
					]
				: [];
		});
});
const primaryPointer = computed(() =>
	boardPointers.value.find((pointer) => pointer.isPrimary),
);
const hoveredId = computed(
	() =>
		hitTestTargets(primaryPointer.value?.clientPosition ?? null, targets.value)
			?.id ?? null,
);
const hoveredProject = computed(() =>
	projects.find((project) => project.id === hoveredId.value),
);
const status = computed(() => {
	if (!props.isRunning)
		return "Start the camera to try hovering with your hand.";
	if (props.frame.primaryHandId === null)
		return "Point with your index to choose the main hand.";
	if (!primaryPointer.value)
		return `Hand #${props.frame.primaryHandId} keeps control. Point again or choose another hand.`;
	return hoveredProject.value
		? `Hand #${props.frame.primaryHandId} · Hovering: ${hoveredProject.value.title}`
		: `Hand #${props.frame.primaryHandId} · Move the cursor onto a card.`;
});

function rectOf(element: HTMLElement): InteractionRect {
	const { left, top, width, height } = element.getBoundingClientRect();
	return { left, top, width, height };
}

function refreshTargets() {
	const board = boardRef.value;
	surface.value = board ? rectOf(board) : null;
	targets.value = (cardsRef.value ?? []).flatMap((card) => {
		const id = card.dataset.project;
		return id ? [{ id, rect: rectOf(card) }] : [];
	});
}

function choosePrimaryHand(event: Event) {
	const value = (event.target as HTMLSelectElement).value;
	emit("primary-hand-change", value === "auto" ? null : Number(value));
}

watch(() => props.frame, refreshTargets, { flush: "post" });
onMounted(() => {
	observer = new ResizeObserver(refreshTargets);
	if (boardRef.value) observer.observe(boardRef.value);
	for (const card of cardsRef.value ?? []) observer.observe(card);
	window.addEventListener("resize", refreshTargets);
	window.addEventListener("scroll", refreshTargets, {
		capture: true,
		passive: true,
	});
	refreshTargets();
});
onBeforeUnmount(() => {
	observer?.disconnect();
	window.removeEventListener("resize", refreshTargets);
	window.removeEventListener("scroll", refreshTargets, true);
});
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
				Point with your index finger to highlight a card with the main hand.
			</p>
		</header>

		<div class="space-y-2 rounded-xl bg-slate-900 p-4 text-sm">
			<label for="primary-hand" class="block font-medium">Main hand</label>
			<select
				id="primary-hand"
				:value="frame.preferredHandId ?? 'auto'"
				:disabled="!isRunning || !hands.length"
				@change="choosePrimaryHand"
				class="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
			>
				<option value="auto">
					Automatic{{
						frame.primaryHandId !== null
							? ` (main: #${frame.primaryHandId})`
							: ""
					}}
				</option>
				<option v-for="hand in hands" :key="hand.id" :value="hand.id">
					Hand #{{ hand.id }} · {{ hand.observation.handedness }} ·
					{{ hand.status }}
				</option>
			</select>
			<p class="text-slate-400">
				The main hand keeps control while tracked. Choose another hand to
				switch. Only its solid cursor highlights cards.
			</p>
		</div>

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
				v-for="pointer in boardPointers"
				:key="pointer.handId"
				data-navigation-cursor
				:data-hand-id="pointer.handId"
				:data-primary="pointer.isPrimary"
				aria-hidden="true"
				class="pointer-events-none absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-slate-950/90 text-[10px] font-semibold"
				:class="pointer.isPrimary ? 'border-white text-white ring-4 ring-sky-400/40' : 'border-dashed border-amber-300 text-amber-300 opacity-60'"
				:style="{ left: `${pointer.left}%`, top: `${pointer.top}%` }"
			>
				#{{ pointer.handId }}
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
