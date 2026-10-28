<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { OverlayHudState } from "../pointer-contract";
import VirtualKeyboard from "./components/VirtualKeyboard.vue";

const overlayBridge = window.handfinityOverlay;
const showKeyboard = ref(true);

const hudState = ref<OverlayHudState>({
	phase: "waiting",
	statusText: "En attente du geste…",
	grabProgress: 0,
	isLocked: false,
	lastAction: null,
});

const currentFeedback = ref<string | null>(null);
let feedbackTimeout: ReturnType<typeof setTimeout> | undefined;
let unsubscribeFeedback: (() => void) | undefined;
let unsubscribeHud: (() => void) | undefined;

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
		overlayBridge?.moveBy(deltaX, deltaY);
	}
}

function onDragEnd() {
	isDragging = false;
	window.removeEventListener("pointermove", onDragMove);
	window.removeEventListener("pointerup", onDragEnd);
	window.removeEventListener("pointercancel", onDragEnd);
}

function resetPosition() {
	overlayBridge?.resetPosition();
}

function onKeyPress(key: string) {
	overlayBridge?.pressKey(key);
}

function onClose() {
	overlayBridge?.close();
}

function onKeyDown(event: KeyboardEvent) {
	if (event.key === "Escape") {
		onClose();
	}
}

function flashFeedback(text: string) {
	currentFeedback.value = text;
	if (feedbackTimeout) clearTimeout(feedbackTimeout);
	feedbackTimeout = setTimeout(() => {
		currentFeedback.value = null;
	}, 2000);
}

const phaseLabel = computed(() => {
	switch (hudState.value.phase) {
		case "moving":
			return "Mode pointeur actif";
		case "waiting":
			return "En attente de la main";
		case "paused":
			return "Mode pause";
		case "starting":
			return "Démarrage…";
		case "disabled":
			return "Pointeur inactif";
		case "error":
			return "Erreur";
		case "unsupported":
			return "Non supporté";
		default:
			return "Suivi gestuel";
	}
});

const phaseBadgeClass = computed(() => {
	switch (hudState.value.phase) {
		case "moving":
			return "border-emerald-500/40 bg-emerald-950/80 text-emerald-300";
		case "waiting":
			return "border-sky-500/40 bg-sky-950/80 text-sky-300";
		case "paused":
			return "border-amber-500/40 bg-amber-950/80 text-amber-300";
		case "starting":
			return "border-cyan-500/40 bg-cyan-950/80 text-cyan-300";
		case "error":
			return "border-red-500/40 bg-red-950/80 text-red-300";
		default:
			return "border-slate-700/50 bg-slate-900/80 text-slate-400";
	}
});

const phaseDotClass = computed(() => {
	switch (hudState.value.phase) {
		case "moving":
			return "bg-emerald-400 animate-pulse";
		case "waiting":
			return "bg-sky-400 animate-pulse";
		case "paused":
			return "bg-amber-400";
		case "starting":
			return "bg-cyan-400 animate-pulse";
		case "error":
			return "bg-red-400 animate-pulse";
		default:
			return "bg-slate-500";
	}
});

onMounted(() => {
	window.addEventListener("keydown", onKeyDown);
	unsubscribeFeedback = overlayBridge?.subscribeFeedback((feedback) => {
		flashFeedback(feedback);
	});
	unsubscribeHud = overlayBridge?.subscribeHud((state) => {
		hudState.value = state;
		if (state.lastAction) {
			flashFeedback(state.lastAction);
		}
	});
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", onKeyDown);
	onDragEnd();
	if (feedbackTimeout) clearTimeout(feedbackTimeout);
	unsubscribeFeedback?.();
	unsubscribeHud?.();
});
</script>

<template>
	<div
		data-overlay-root
		class="flex h-screen w-screen flex-col items-center justify-end bg-transparent p-2 select-none"
	>
		<!-- Module HUD supérieur flottant draggable -->
		<div data-overlay-hud class="w-full max-w-3xl space-y-2">
			<!-- Barre de poignée et d'actions rapides -->
			<div
				class="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-1.5 shadow-2xl backdrop-blur-md text-xs"
			>
				<!-- Poignée de glisser-déposer globale -->
				<div
					data-hud-drag-handle
					@pointerdown="onDragStart"
					class="flex cursor-grab items-center gap-1.5 font-medium text-slate-300 hover:text-cyan-300 active:cursor-grabbing"
					title="Cliquer et glisser pour déplacer l'ensemble de l'overlay"
				>
					<span class="font-mono text-cyan-400 text-sm">⠿</span>
					<span
						class="text-[11px] font-semibold tracking-wide uppercase text-slate-400"
						>Handfinity HUD</span
					>
				</div>

				<!-- Badge d'état du pointeur -->
				<div class="flex items-center gap-1.5">
					<div
						class="flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium backdrop-blur-md shadow-sm"
						:class="phaseBadgeClass"
					>
						<span
							class="inline-block h-2 w-2 rounded-full"
							:class="phaseDotClass"
						></span>
						<span>{{ phaseLabel }}</span>
					</div>

					<!-- Statut textuel contextuel (affiché si disponible) -->
					<div
						v-if="hudState.statusText"
						class="hidden max-w-[280px] truncate rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-slate-300 sm:inline-block"
						:title="hudState.statusText"
					>
						{{ hudState.statusText }}
					</div>
				</div>

				<!-- Contrôles rapides (Afficher/Masquer clavier, recentrer, fermer) -->
				<div class="flex items-center gap-1.5">
					<button
						type="button"
						@click="showKeyboard = !showKeyboard"
						class="rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-400/40 hover:bg-white/10"
						:title="showKeyboard ? 'Masquer le clavier virtuel' : 'Afficher le clavier virtuel'"
					>
						⌨️ {{ showKeyboard ? "Masquer clavier" : "Afficher clavier" }}
					</button>
					<button
						type="button"
						@click="resetPosition"
						class="rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-400/40 hover:bg-white/10"
						title="Recentrer en bas de l'écran"
					>
						↺
					</button>
					<button
						type="button"
						@click="onClose"
						aria-label="Fermer l'overlay"
						class="rounded-lg border border-red-500/30 bg-red-950/40 px-2 py-0.5 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-900/60 hover:text-white"
					>
						✕
					</button>
				</div>
			</div>

			<!-- Barre de progression du geste de saisie (poing fermé pour glisser-déposer) -->
			<Transition
				enter-active-class="transition duration-150 ease-out"
				enter-from-class="opacity-0 -translate-y-1 scale-95"
				enter-to-class="opacity-100 translate-y-0 scale-100"
				leave-active-class="transition duration-100 ease-in"
				leave-from-class="opacity-100 translate-y-0 scale-100"
				leave-to-class="opacity-0 -translate-y-1 scale-95"
			>
				<div
					v-if="hudState.grabProgress > 0 || hudState.isLocked"
					data-grab-progress
					class="rounded-xl border border-emerald-500/50 bg-slate-950/90 p-2.5 shadow-2xl backdrop-blur-md"
				>
					<div
						class="flex items-center justify-between text-xs font-semibold text-emerald-300 mb-1.5"
					>
						<span class="flex items-center gap-1.5">
							<span class="text-base">✊</span>
							<span>{{
								hudState.isLocked
									? "Saisie verrouillée — Glisser en cours"
									: "Fermeture du poing (saisie & glisser)"
							}}</span>
						</span>
						<span class="font-mono text-xs font-bold text-emerald-400">
							{{
								hudState.isLocked
									? "VERROUILLÉ"
									: `${Math.round(hudState.grabProgress * 100)} %`
							}}
						</span>
					</div>
					<!-- Jauge de progression animée -->
					<div
						class="h-2 w-full overflow-hidden rounded-full bg-slate-900 border border-emerald-900/60"
					>
						<div
							class="h-full rounded-full transition-all duration-75"
							:class="hudState.isLocked ? 'w-full bg-emerald-400 animate-pulse' : 'bg-gradient-to-r from-emerald-500 to-cyan-400'"
							:style="{ width: hudState.isLocked ? '100%' : `${Math.max(4, Math.round(hudState.grabProgress * 100))}%` }"
						></div>
					</div>
					<div
						class="mt-1 flex items-center justify-between text-[10px] text-slate-300"
					>
						<span>{{
							hudState.isLocked
								? "Déplacez le poing pour faire glisser l'élément"
								: "Maintenez le poing fermé 0,6 s pour verrouiller la prise"
						}}</span>
						<span class="font-medium text-emerald-400">{{
							hudState.isLocked ? "Ouvrez la main pour relâcher" : "0,6 s"
						}}</span>
					</div>
				</div>
			</Transition>

			<!-- Notification toast d'action flash (clics, touches, raccourcis) -->
			<Transition
				enter-active-class="transition duration-150 ease-out"
				enter-from-class="opacity-0 translate-y-1 scale-95"
				enter-to-class="opacity-100 translate-y-0 scale-100"
				leave-active-class="transition duration-150 ease-in"
				leave-from-class="opacity-100 translate-y-0 scale-100"
				leave-to-class="opacity-0 translate-y-1 scale-95"
			>
				<div
					v-if="currentFeedback"
					data-action-notification
					class="flex items-center justify-center"
				>
					<div
						class="flex items-center gap-2 rounded-full border border-cyan-400/50 bg-slate-950/95 px-3.5 py-1 text-xs font-medium text-cyan-200 shadow-xl shadow-cyan-950/60 backdrop-blur-md"
					>
						<span
							class="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400"
						></span>
						<span>{{ currentFeedback }}</span>
					</div>
				</div>
			</Transition>
		</div>

		<!-- Clavier virtuel pop-up flottant sans perte de focus (repliable) -->
		<div
			v-show="showKeyboard"
			class="w-full max-w-3xl drop-shadow-2xl mt-2 transition-all duration-200"
		>
			<VirtualKeyboard @press-key="onKeyPress" @close="onClose" />
		</div>
	</div>
</template>
