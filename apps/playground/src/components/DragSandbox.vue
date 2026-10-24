<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import type { TrackedHand, TrackedHandPose } from "@handfinity/core";
import {
	createDragController,
	projectHandPoint,
	type DragCancelReason,
	type DragEvent,
	type DragFrame,
	type HandPointerFrame,
	type InteractionTarget,
} from "@handfinity/interactions";

const props = defineProps<{
	frame: HandPointerFrame;
	hands: readonly TrackedHand[];
	poses: readonly TrackedHandPose[];
	isRunning: boolean;
}>();
const emit = defineEmits<{ "primary-hand-change": [handId: number | null] }>();

// Un repère logique partagé avec les pourcentages CSS : indépendant du format écran.
const bounds = { left: 0, top: 0, width: 1, height: 1 };
const tileSize = { width: 0.32, height: 0.26 };
function initialTiles() {
	return [
		{ id: "tile-a", title: "Tile A", x: 0.12, y: 0.18 },
		{ id: "tile-b", title: "Tile B", x: 0.56, y: 0.56 },
	];
}
const tiles = shallowRef(initialTiles());
const targets = computed<readonly InteractionTarget[]>(() =>
	tiles.value.map((tile, priority) => ({
		id: tile.id,
		rect: { left: tile.x, top: tile.y, ...tileSize },
		priority,
	})),
);
const controller = createDragController();
const drag = shallowRef<DragFrame>({
	timestamp: 0,
	phase: "idle",
	handId: null,
	targetId: null,
	position: null,
	events: [],
});
const lastEvent = shallowRef<DragEvent | null>(null);
const droppedId = ref<string | null>(null);
const completedDrops = ref(0);
let wasRunning = false;

const cursors = computed(() => {
	if (!props.isRunning) return [];
	return props.frame.pointers.flatMap((pointer) => {
		if (
			!pointer.active &&
			!(pointer.isPrimary && drag.value.phase === "dragging")
		)
			return [];
		const point = projectHandPoint(pointer.position, bounds, { mirrorX: true });
		return point ? [{ ...pointer, point }] : [];
	});
});

const cancelLabels: Record<DragCancelReason, string> = {
	"tracking-lost": "hand tracking interrupted",
	"hand-changed": "main hand changed",
	"target-unavailable": "tile unavailable",
	"surface-unavailable": "surface unavailable",
	"pointer-unavailable": "pointer outside the surface",
	reset: "tiles reset",
	stopped: "camera stopped",
};

function tileTitle(id: string | null) {
	return tiles.value.find((tile) => tile.id === id)?.title ?? "tile";
}

const feedback = computed(() => {
	if (!props.isRunning)
		return "Start the camera to move the tiles. Their positions are kept when the camera stops.";
	if (drag.value.phase === "dragging")
		return `Dragging: ${tileTitle(drag.value.targetId)}. Move while pinching; separate thumb and index to drop.`;
	if (lastEvent.value?.type === "drag:cancel")
		return `Interrupted: ${cancelLabels[lastEvent.value.reason]}. The tile stays at its last position. Point again to grab.`;
	if (lastEvent.value?.type === "drag:end")
		return `Dropped: ${tileTitle(lastEvent.value.targetId)}. Point and pinch to move a tile again.`;
	if (drag.value.phase === "ready")
		return `Ready: ${tileTitle(drag.value.targetId)}. Touch thumb to index to grab.`;
	return "Extend your index, fold the other three fingers, and aim at a tile with the solid cursor.";
});

function applyDrag(result: DragFrame) {
	drag.value = result;
	for (const event of result.events) {
		if (event.type !== "drag:move") lastEvent.value = event;
		if (event.type === "drag:start") {
			droppedId.value = null;
			const tile = tiles.value.find((item) => item.id === event.targetId);
			// La cible capturée passe devant ; l'ordre du rendu et des priorités reste identique.
			if (tile)
				tiles.value = [
					...tiles.value.filter((item) => item.id !== tile.id),
					tile,
				];
		}
		if (
			event.type === "drag:move" ||
			event.type === "drag:end" ||
			event.type === "drag:cancel"
		) {
			tiles.value = tiles.value.map((tile) =>
				tile.id === event.targetId
					? { ...tile, x: event.position.x, y: event.position.y }
					: tile,
			);
		}
		if (event.type === "drag:end") {
			droppedId.value = event.targetId;
			completedDrops.value += 1;
		}
	}
}

function updateDrag() {
	if (!props.isRunning) {
		applyDrag(controller.cancel("stopped"));
		droppedId.value = null;
		wasRunning = false;
		return;
	}
	if (!wasRunning) {
		controller.reset();
		lastEvent.value = null;
		wasRunning = true;
	}
	const pointer = props.frame.pointers.find((item) => item.isPrimary);
	applyDrag(
		controller.update({
			frame: props.frame,
			pose:
				props.poses.find((item) => item.handId === props.frame.primaryHandId) ??
				null,
			point: pointer
				? projectHandPoint(pointer.position, bounds, { mirrorX: true })
				: null,
			targets: targets.value,
			bounds,
		}),
	);
}

function choosePrimaryHand(event: Event) {
	applyDrag(controller.cancel("hand-changed"));
	const value = (event.target as HTMLSelectElement).value;
	emit("primary-hand-change", value === "auto" ? null : Number(value));
}

function resetTiles() {
	applyDrag(controller.cancel("reset"));
	tiles.value = initialTiles();
	droppedId.value = null;
	completedDrops.value = 0;
	lastEvent.value = null;
}

watch([() => props.frame, () => props.isRunning], updateDrag, {
	immediate: true,
	flush: "post",
});
onBeforeUnmount(() => controller.cancel("stopped"));
</script>

<template>
	<section aria-labelledby="drag-title" class="min-w-0 space-y-4">
		<header>
			<p class="text-xs font-medium uppercase tracking-widest text-sky-400">
				Movement practice
			</p>
			<h2 id="drag-title" class="mt-1 text-xl font-semibold">
				Grab &amp; drag
			</h2>
			<ol
				class="mt-2 list-inside list-decimal space-y-1 text-sm text-slate-400"
			>
				<li>
					Extend your index, fold the other three fingers, and aim at a tile.
				</li>
				<li>Touch thumb to index and keep pinching: move the amber tile.</li>
				<li>Separate thumb and index: drop the tile where it is.</li>
			</ol>
			<p class="mt-2 text-sm text-slate-400">
				Opening all five fingers also drops the tile. Interrupted tracking stops
				the movement at its last position.
			</p>
		</header>

		<div class="space-y-2 rounded-xl bg-slate-900 p-4 text-sm">
			<label for="drag-primary-hand" class="block font-medium">Main hand</label>
			<select
				id="drag-primary-hand"
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
				Only the solid cursor can grab a tile. Changing the main hand interrupts
				a drag.
			</p>
		</div>

		<div
			role="status"
			aria-live="polite"
			aria-atomic="true"
			data-drag-result
			class="space-y-1 rounded-xl bg-slate-900 p-4 text-sm"
		>
			<p
				:class="drag.phase === 'dragging' ? 'text-amber-300' : lastEvent?.type === 'drag:end' ? 'text-emerald-300' : 'text-slate-300'"
			>
				{{ feedback }}
			</p>
			<p class="text-slate-400">Completed drops: {{ completedDrops }}</p>
		</div>

		<div
			data-drag-board
			:data-drag-phase="drag.phase"
			class="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-900"
		>
			<div
				v-for="tile in tiles"
				:key="tile.id"
				:data-drag-tile="tile.id"
				:data-grabbed="drag.phase === 'dragging' && drag.targetId === tile.id"
				class="absolute flex select-none flex-col items-center justify-center gap-1 rounded-xl border-2 text-center"
				:class="drag.phase === 'dragging' && drag.targetId === tile.id ? 'border-amber-300 bg-amber-950' : droppedId === tile.id ? 'border-emerald-300 bg-emerald-950' : drag.phase === 'ready' && drag.targetId === tile.id ? 'border-sky-300 bg-sky-950' : 'border-slate-600 bg-slate-800'"
				:style="{ left: `${tile.x * 100}%`, top: `${tile.y * 100}%`, width: `${tileSize.width * 100}%`, height: `${tileSize.height * 100}%` }"
			>
				<span class="text-sm font-semibold sm:text-lg">{{ tile.title }}</span>
				<span class="text-xs text-slate-300">{{
					drag.phase === "dragging" && drag.targetId === tile.id
						? "Dragging"
						: droppedId === tile.id
							? "Dropped"
							: "Point & pinch"
				}}</span>
			</div>
			<div
				v-for="cursor in cursors"
				:key="cursor.handId"
				data-drag-cursor
				:data-primary="cursor.isPrimary"
				aria-hidden="true"
				class="pointer-events-none absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-slate-950/90 text-[10px] font-semibold"
				:class="cursor.isPrimary ? drag.phase === 'dragging' ? 'border-amber-300 text-amber-300 ring-4 ring-amber-400/40' : 'border-white text-white ring-4 ring-sky-400/40' : 'border-dashed border-amber-300 text-amber-300 opacity-60'"
				:style="{ left: `${cursor.point.x * 100}%`, top: `${cursor.point.y * 100}%` }"
			>
				#{{ cursor.handId }}
			</div>
		</div>

		<button
			type="button"
			@click="resetTiles"
			class="rounded-lg border border-slate-600 px-4 py-2 text-sm hover:bg-slate-800"
		>
			Reset tiles
		</button>
	</section>
</template>
