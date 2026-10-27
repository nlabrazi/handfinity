<script setup lang="ts">
import {
	CONTROL_HOLD_MS,
	type GestureEngineFrame,
} from "@handfinity/interactions";
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
			return "Available on Windows only.";
		case "starting":
			return "Starting…";
		case "waiting":
			return "On — waiting for a pointing hand.";
		case "moving":
			return "On — following the pointing hand.";
		case "paused":
			return `Paused — hold your open palm for ${CONTROL_HOLD_MS / 1000} seconds to resume.`;
		case "error":
			return state.value.error;
		default:
			return "Off.";
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
				class="space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm"
			>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="min-w-0">
						<h2 id="system-pointer-title" class="font-medium">
							Windows pointer
						</h2>
						<p
							role="status"
							:class="state.phase === 'error' ? 'text-red-400' : 'text-slate-300'"
						>
							{{ status }}
						</p>
					</div>
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
				</div>
				<p
					v-if="bridge && state.phase !== 'unsupported' && !enabled && !starting && !isRunning"
					class="text-xs text-amber-300"
				>
					Start the camera to enable control.
				</p>
				<p class="text-xs text-slate-400">
					Emergency stop: <kbd>Ctrl + Alt + Esc</kbd> · Stop camera also turns
					control off.
				</p>
			</section>
		</template>
	</Playground>
</template>
