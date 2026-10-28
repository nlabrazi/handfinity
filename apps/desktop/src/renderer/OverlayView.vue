<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import VirtualKeyboard from "./components/VirtualKeyboard.vue";

const overlayBridge = window.handfinityOverlay;

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
});

onBeforeUnmount(() => {
	window.removeEventListener("keydown", onKeyDown);
});
</script>

<template>
	<div
		data-overlay-root
		class="flex h-screen w-screen flex-col items-center justify-end bg-transparent p-2 select-none overflow-hidden"
	>
		<!-- Clavier virtuel pop-up flottant draggable sans perte de focus -->
		<div class="w-full max-w-4xl drop-shadow-2xl">
			<VirtualKeyboard @press-key="onKeyPress" @close="onClose" />
		</div>
	</div>
</template>
