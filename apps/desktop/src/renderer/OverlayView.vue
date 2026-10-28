<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import VirtualKeyboard from "./components/VirtualKeyboard.vue";

const overlayBridge = window.handfinityOverlay;
const currentFeedback = ref<string | null>(null);
let feedbackTimeout: ReturnType<typeof setTimeout> | undefined;
let unsubscribe: (() => void) | undefined;

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

onMounted(() => {
	window.addEventListener("keydown", onKeyDown);
	unsubscribe = overlayBridge?.subscribeFeedback((feedback) => {
		currentFeedback.value = feedback;
		if (feedbackTimeout) clearTimeout(feedbackTimeout);
		feedbackTimeout = setTimeout(() => {
			currentFeedback.value = null;
		}, 1800);
	});
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", onKeyDown);
	if (feedbackTimeout) clearTimeout(feedbackTimeout);
	unsubscribe?.();
});
</script>

<template>
	<div
		data-overlay-root
		class="flex h-screen w-screen flex-col items-center justify-end bg-transparent p-2 select-none"
	>
		<!-- Notification HUD discrète en surimpression -->
		<Transition
			enter-active-class="transition duration-150 ease-out"
			enter-from-class="opacity-0 translate-y-2 scale-95"
			enter-to-class="opacity-100 translate-y-0 scale-100"
			leave-active-class="transition duration-150 ease-in"
			leave-from-class="opacity-100 translate-y-0 scale-100"
			leave-to-class="opacity-0 translate-y-2 scale-95"
		>
			<div
				v-if="currentFeedback"
				class="mb-2 flex items-center gap-1.5 rounded-full border border-cyan-500/50 bg-slate-900/95 px-3 py-1 text-xs font-medium text-cyan-300 shadow-xl shadow-cyan-950/60 backdrop-blur-md"
			>
				<span
					class="inline-block h-2 w-2 animate-pulse rounded-full bg-cyan-400"
				></span>
				<span>{{ currentFeedback }}</span>
			</div>
		</Transition>

		<!-- Clavier virtuel pop-up flottant sans perte de focus -->
		<div class="w-full max-w-3xl drop-shadow-2xl">
			<VirtualKeyboard @press-key="onKeyPress" @close="onClose" />
		</div>
	</div>
</template>
