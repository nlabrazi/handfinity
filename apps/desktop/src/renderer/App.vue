<script setup lang="ts">
import type { GestureEngineFrame } from "@handfinity/interactions";
import Playground from "playground/view";
import { computed, onBeforeUnmount, onMounted, shallowRef } from "vue";
import type { PointerControlState } from "../pointer-contract";
import { toPointerUpdate } from "./pointer-update";

const bridge = window.handfinityPointer;
const state = shallowRef<PointerControlState>({
	phase: bridge ? "disabled" : "error",
	sessionId: null,
	error: bridge ? null : "Pointer control is unavailable. Relaunch Handfinity.",
});
const enabled = computed(() => state.value.sessionId !== null);
const starting = computed(() => state.value.phase === "starting");
const status = computed(() => {
	switch (state.value.phase) {
		case "unsupported":
			return "System pointer control requires Windows.";
		case "starting":
			return "Starting Windows pointer control…";
		case "waiting":
			return "Enabled — waiting for a pointing hand.";
		case "moving":
			return "Enabled — following your main hand.";
		case "error":
			return state.value.error;
		default:
			return "Windows pointer control is off.";
	}
});
let unsubscribe: (() => void) | undefined;
let disposed = false;

function showState(next: PointerControlState) {
	if (!disposed) state.value = next;
}

function showError(error: unknown) {
	showState({
		phase: "error",
		sessionId: null,
		error: error instanceof Error ? error.message : "Pointer control failed",
	});
}

async function disablePointer() {
	if (!bridge) return;
	try {
		showState(await bridge.disable());
	} catch (error) {
		showError(error);
	}
}

async function togglePointer(cameraRunning: boolean) {
	if (!bridge) return;
	if (enabled.value || starting.value) {
		await disablePointer();
		return;
	}
	if (!cameraRunning) return;
	try {
		showState(await bridge.enable());
	} catch (error) {
		showError(error);
	}
}

function submit(frame: GestureEngineFrame) {
	const sessionId = state.value.sessionId;
	if (!bridge || sessionId === null) return;
	const update = toPointerUpdate(frame, sessionId, performance.timeOrigin);
	if (update) bridge.submit(update);
}

onMounted(async () => {
	if (!bridge) return;
	unsubscribe = bridge.subscribe(showState);
	try {
		showState(await bridge.getState());
	} catch (error) {
		showError(error);
	}
});

onBeforeUnmount(() => {
	disposed = true;
	unsubscribe?.();
	void disablePointer();
});
</script>

<template>
	<Playground
		:tracking-options="{ scheduling: 'timer' }"
		@gesture-frame="submit"
		@tracking-stop="disablePointer"
	>
		<template #description>
			Start the camera, then enable the Windows pointer to control your primary
			display. Clicking and keyboard input are not available yet.
		</template>
		<template #controls="{ isRunning }">
			<section
				data-system-pointer
				:data-phase="state.phase"
				aria-labelledby="system-pointer-title"
				class="space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-4 text-sm"
			>
				<h2 id="system-pointer-title" class="font-medium">Windows pointer</h2>
				<p class="text-slate-400">
					Point with your main hand to move the cursor on the primary display.
					Open your hand or remove it from view to stop moving.
				</p>
				<button
					type="button"
					data-toggle-system-pointer
					:disabled="!bridge || state.phase === 'unsupported' || (!isRunning && !enabled && !starting)"
					@click="togglePointer(isRunning)"
					class="rounded-lg bg-cyan-700 px-4 py-2 font-medium hover:bg-cyan-600 disabled:opacity-50"
				>
					{{
						enabled || starting
							? "Stop Windows pointer"
							: "Enable Windows pointer"
					}}
				</button>
				<p
					role="status"
					:class="state.phase === 'error' ? 'text-red-400' : 'text-slate-300'"
				>
					{{ status }}
				</p>
				<p class="text-slate-400">
					Stop control at any time with <kbd>Ctrl + Alt + Esc</kbd>, even in
					another application. Stopping the camera also turns pointer control
					off.
				</p>
			</section>
		</template>
	</Playground>
</template>
