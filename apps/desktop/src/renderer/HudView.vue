<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { OverlayHudState } from "../pointer-contract";

const overlayBridge = window.handfinityOverlay;

const hudState = ref<OverlayHudState>({
	phase: "waiting",
	statusText: "Mode pointeur prêt",
	grabProgress: 0,
	isLocked: false,
	lastAction: null,
});

const currentFeedback = ref<string | null>(null);
let feedbackTimeout: ReturnType<typeof setTimeout> | undefined;
let unsubscribeFeedback: (() => void) | undefined;
let unsubscribeHud: (() => void) | undefined;

let isDragging = false;
let startX = 0;
let startY = 0;

function onMouseDown(event: MouseEvent) {
	if (event.button !== 0) return;
	isDragging = true;
	startX = event.screenX;
	startY = event.screenY;
	window.addEventListener("mousemove", onMouseMove);
	window.addEventListener("mouseup", onMouseUp);
}

function onMouseMove(event: MouseEvent) {
	if (!isDragging) return;
	const deltaX = event.screenX - startX;
	const deltaY = event.screenY - startY;
	if (deltaX !== 0 || deltaY !== 0) {
		startX = event.screenX;
		startY = event.screenY;
		overlayBridge?.moveBy(deltaX, deltaY);
	}
}

function onMouseUp() {
	if (!isDragging) return;
	isDragging = false;
	window.removeEventListener("mousemove", onMouseMove);
	window.removeEventListener("mouseup", onMouseUp);
}

function resetPosition() {
	overlayBridge?.resetPosition();
}

function toggleKeyboard() {
	void overlayBridge?.toggle();
}

function onClose() {
	overlayBridge?.close();
}

function flashFeedback(text: string) {
	currentFeedback.value = text;
	if (feedbackTimeout) clearTimeout(feedbackTimeout);
	feedbackTimeout = setTimeout(() => {
		currentFeedback.value = null;
	}, 1800);
}

const phaseLabel = computed(() => {
	switch (hudState.value.phase) {
		case "moving":
			return "Pointeur actif";
		case "waiting":
			return "En attente";
		case "paused":
			return "En pause";
		case "starting":
			return "Démarrage…";
		case "disabled":
			return "Inactif";
		case "error":
			return "Erreur";
		default:
			return "Handfinity";
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
	onMouseUp();
	if (feedbackTimeout) clearTimeout(feedbackTimeout);
	unsubscribeFeedback?.();
	unsubscribeHud?.();
});
</script>

<template>
	<div
		data-hud-root
		class="flex h-screen w-screen flex-col items-center justify-start bg-transparent p-1.5 select-none"
	>
		<!-- Capsule HUD principale on-top au milieu -->
		<div
			data-hud-capsule
			class="w-full max-w-[480px] rounded-2xl border border-white/15 bg-slate-950/90 p-2 shadow-2xl shadow-black/80 backdrop-blur-xl"
		>
			<!-- Ligne supérieure : poignée, pastille d'état, notification flash, boutons d'action -->
			<div class="flex items-center justify-between gap-2 text-xs">
				<!-- Poignée de glisser-déposer native + fallback souris -->
				<button
					type="button"
					data-hud-drag-handle
					@mousedown="onMouseDown"
					@keydown.space.prevent="resetPosition"
					style="-webkit-app-region: drag;"
					class="flex cursor-grab items-center gap-1.5 text-slate-400 hover:text-cyan-300 active:cursor-grabbing"
					title="Cliquer et glisser pour déplacer le HUD sur l'écran (Espace pour recentrer)"
				>
					<span class="font-mono text-cyan-400 text-sm pointer-events-none"
						>⠿</span
					>
				</button>

				<!-- Badge de statut du pointeur -->
				<div
					class="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium backdrop-blur-md"
					:class="phaseBadgeClass"
				>
					<span
						class="inline-block h-2 w-2 rounded-full"
						:class="phaseDotClass"
					></span>
					<span>{{ phaseLabel }}</span>
				</div>

				<!-- Notification d'action éphémère OU texte d'état contextuel -->
				<div class="flex-1 truncate text-center">
					<Transition
						mode="out-in"
						enter-active-class="transition duration-150 ease-out"
						enter-from-class="opacity-0 scale-95"
						enter-to-class="opacity-100 scale-100"
						leave-active-class="transition duration-100 ease-in"
						leave-from-class="opacity-100 scale-100"
						leave-to-class="opacity-0 scale-95"
					>
						<span
							v-if="currentFeedback"
							key="feedback"
							class="inline-flex items-center gap-1 font-medium text-cyan-300"
						>
							<span
								class="inline-block h-1.5 w-1.5 animate-ping rounded-full bg-cyan-400"
							></span>
							{{ currentFeedback }}
						</span>
						<span
							v-else-if="hudState.statusText"
							key="status"
							class="text-[11px] text-slate-300 truncate"
							:title="hudState.statusText"
						>
							{{ hudState.statusText }}
						</span>
					</Transition>
				</div>

				<!-- Actions rapides : ouvrir clavier, recentrer, fermer -->
				<div
					style="-webkit-app-region: no-drag;"
					class="flex items-center gap-1"
				>
					<button
						type="button"
						@click="toggleKeyboard"
						class="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-400/40 hover:bg-white/15"
						title="Afficher / Masquer le clavier virtuel"
					>
						⌨️ Clavier
					</button>
					<button
						type="button"
						@click="resetPosition"
						class="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-400/40 hover:bg-white/15"
						title="Recentrer le HUD en haut au milieu"
					>
						↺
					</button>
					<button
						type="button"
						@click="onClose"
						aria-label="Fermer le HUD"
						class="rounded-md border border-red-500/30 bg-red-950/40 px-1.5 py-0.5 text-[11px] font-semibold text-red-300 transition-colors hover:bg-red-900/60 hover:text-white"
					>
						✕
					</button>
				</div>
			</div>

			<!-- Jauge de progression du poing fermé (saisie & glisser-déposer) -->
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
					data-hud-grab
					class="mt-1.5 pt-1.5 border-t border-white/10"
				>
					<div
						class="flex items-center justify-between text-[11px] font-semibold text-emerald-300 mb-1"
					>
						<span class="flex items-center gap-1">
							<span>✊</span>
							<span>{{
								hudState.isLocked
									? "Saisie verrouillée — Glisser en cours"
									: "Fermeture du poing (saisie)"
							}}</span>
						</span>
						<span class="font-mono text-[10px] font-bold text-emerald-400">
							{{
								hudState.isLocked
									? "VERROUILLÉ"
									: `${Math.round(hudState.grabProgress * 100)} %`
							}}
						</span>
					</div>
					<!-- Barre de progression -->
					<div
						class="h-1.5 w-full overflow-hidden rounded-full bg-slate-900 border border-emerald-900/50"
					>
						<div
							class="h-full rounded-full transition-all duration-75"
							:class="
								hudState.isLocked
									? 'w-full bg-emerald-400 animate-pulse'
									: 'bg-gradient-to-r from-emerald-500 to-cyan-400'
							"
							:style="{
								width: hudState.isLocked
									? '100%'
									: `${Math.max(4, Math.round(hudState.grabProgress * 100))}%`,
							}"
						></div>
					</div>
				</div>
			</Transition>
		</div>
	</div>
</template>
