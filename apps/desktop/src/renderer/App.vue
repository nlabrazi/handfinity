<script setup lang="ts">
import {
	type BimanualGestureState,
	CONTROL_HOLD_MS,
	createGestureEngine,
	DEFAULT_ACTIVE_ZONE,
	type GestureEngineFrame,
	type HandObservation,
	type HandPointerFrame,
	type PointerActionCommand,
	type TrackedHand,
	type TrackedHandPose,
} from "@handfinity/engine";
import {
	createTrackingSession,
	HAND_CONNECTIONS,
	type TrackingSessionFrame,
} from "@handfinity/vision";
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import type { PointerControlState } from "../pointer-contract";
import { toPointerUpdate } from "./pointer-update";

const bridge = window.handfinityPointer;
const state = shallowRef<PointerControlState>({
	phase: bridge ? "disabled" : "error",
	sessionId: null,
	error: bridge ? null : "Pointer control is unavailable. Relaunch Handfinity.",
});

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const isRunning = ref(false);
const isLoading = ref(false);
const overlayKeyboardOpen = ref(false);
const handCount = ref(0);
const processedFrames = ref(0);
const cameraError = ref("");

const trackedHands = shallowRef<readonly TrackedHand[]>([]);
const trackingAmbiguous = ref(false);
const handPoses = shallowRef<readonly TrackedHandPose[]>([]);
const emptyPointers: HandPointerFrame = {
	timestamp: 0,
	pointers: [],
	primaryHandId: null,
	selectionStatus: "unselected",
};
const pointerFrame = shallowRef(emptyPointers);

const engine = createGestureEngine({ activeZone: DEFAULT_ACTIVE_ZONE });
const controlFrame = shallowRef(engine.getControlState());
const actionState = shallowRef(engine.getActionState());
const bimanualState = shallowRef<BimanualGestureState>({
	phase: "idle",
	distance: null,
	progress: 0,
	keyboardToggle: false,
});
const lastActionLabel = ref("None");

const enabled = computed(() => state.value.sessionId !== null);
const starting = computed(() => state.value.phase === "starting");
const pointerStatus = computed(() => {
	if (state.value.phase === "paused" && controlFrame.value.requiresRelease) {
		return "Paused — point or fold your fingers before resuming.";
	}
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

const selectionStatus = computed(() => {
	const { primaryHandId, selectionStatus: status } = pointerFrame.value;
	switch (status) {
		case "tracked":
			return `Controlling hand: #${primaryHandId} (automatic).`;
		case "missing":
			return `Waiting for hand #${primaryHandId} to return.`;
		case "ambiguous":
			return "Hands are ambiguous. Separate them and point again.";
		default:
			return "Show a pointing hand to start controlling the pointer.";
	}
});

const pointerReadiness = computed(() => {
	if (!isRunning.value) return "Start the camera to begin.";
	if (bimanualState.value.phase === "palms-together") {
		return "Paumes jointes détectées 👐 — écartez les mains pour afficher/masquer le clavier pop-up !";
	}
	if (controlFrame.value.handId !== null)
		return `Hold your open palm to ${controlFrame.value.paused ? "resume" : "pause"} — ${Math.round(controlFrame.value.holdProgress * 100)}%.`;
	if (controlFrame.value.paused)
		return controlFrame.value.requiresRelease
			? "Paused — point or fold your fingers before holding your palm to resume."
			: "Paused — hold your open palm for 1.5 seconds to resume.";
	if (controlFrame.value.requiresRelease)
		return "Point or fold your fingers before holding your palm to pause again.";
	if (pointerFrame.value.selectionStatus !== "tracked")
		return "Show a pointing hand to control the pointer.";
	if (actionState.value.leftButtonDown)
		return "Grab locked — move your closed fist to drag, or open your hand to release.";
	if (actionState.value.grabProgress > 0)
		return `Locking fist grab — ${Math.round(actionState.value.grabProgress * 100)}% (hold 0.6s).`;
	if (actionState.value.pendingChord === "left-click")
		return "2-finger chord detected — confirming left-click…";
	if (actionState.value.pendingChord === "right-click")
		return "3-finger chord detected — confirming right-click…";
	if (actionState.value.scrolling) {
		const dir =
			actionState.value.scrollVelocity === 0
				? "neutral zone"
				: actionState.value.scrollVelocity < 0
					? "scrolling up ↑"
					: "scrolling down ↓";
		return `Joystick scroll active (${dir}) — raise or lower your pinched hand.`;
	}
	const pointer = pointerFrame.value.pointers.find((item) => item.isPrimary);
	if (pointer?.active) return "Pointing detected — pointer active.";
	const pose = handPoses.value.find(
		(item) => item.handId === pointerFrame.value.primaryHandId,
	);
	if (pose?.pose === "pointing")
		return "Pointer inactive — keep your index inside the camera image.";
	return `Pointer inactive — detected pose: ${pose?.pose ?? "unknown"}. Show a pointing hand.`;
});

const session = createTrackingSession(
	{
		onFrame: handleTrackingFrame,
		onError(err) {
			stopCamera();
			cameraError.value =
				err instanceof Error ? err.message : "Tracking failed";
		},
	},
	{ scheduling: "timer" },
);

let sessionGeneration = 0;
let unsubscribe: (() => void) | undefined;
let disposed = false;

function pushHudState(latestActionStr?: string | null) {
	if (!window.handfinityOverlay) return;
	const isLocked = actionState.value.leftButtonDown;
	const grabProgress = actionState.value.grabProgress;
	let action = latestActionStr ?? null;
	if (!action && lastActionLabel.value && lastActionLabel.value !== "None") {
		action = lastActionLabel.value;
	}
	window.handfinityOverlay.updateHud({
		phase: state.value.phase,
		statusText: pointerReadiness.value,
		grabProgress,
		isLocked,
		lastAction: action,
	});
}

function showState(next: PointerControlState) {
	if (!disposed) {
		state.value = next;
		pushHudState();
	}
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

async function togglePointer() {
	if (!bridge) return;
	if (enabled.value || starting.value) {
		await disablePointer();
		return;
	}
	if (!isRunning.value) return;
	try {
		showState(await bridge.enable());
	} catch (error) {
		showError(error);
	}
}

function formatAction(action: PointerActionCommand): string {
	switch (action.type) {
		case "pointer:down":
			return action.button === "left"
				? "✊ Saisie verrouillée"
				: `Bouton ${action.button} enfoncé`;
		case "pointer:up":
			return action.button === "left"
				? "🖐️ Relâchement"
				: `Bouton ${action.button} relâché`;
		case "pointer:click":
			return action.button === "left"
				? "✌️ Clic gauche"
				: action.button === "right"
					? "🤟 Clic droit"
					: `Clic ${action.button}`;
		case "pointer:scroll":
			return `📜 Défilement (${action.deltaY > 0 ? "↓" : "↑"})`;
	}
}

function submit(frame: GestureEngineFrame) {
	const sessionId = state.value.sessionId;
	if (!bridge || sessionId === null) return;
	const update = toPointerUpdate(frame, sessionId, performance.timeOrigin);
	if (update) bridge.submit(update);
}

function handColor(id: number) {
	return (
		["#22d3ee", "#fb923c", "#a78bfa", "#4ade80"][(id - 1) % 4] ?? "#22d3ee"
	);
}

function drawHands(hands: readonly HandObservation[]) {
	const canvas = canvasRef.value;
	const video = videoRef.value;
	if (!canvas || !video) return;

	if (
		canvas.width !== video.videoWidth ||
		canvas.height !== video.videoHeight
	) {
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;
	}

	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	ctx.clearRect(0, 0, canvas.width, canvas.height);

	const az = engine.getActiveZone();
	if (az) {
		ctx.save();
		ctx.strokeStyle = "#38bdf855";
		ctx.lineWidth = 2;
		ctx.setLineDash([6, 6]);
		ctx.strokeRect(
			az.minX * canvas.width,
			az.minY * canvas.height,
			(az.maxX - az.minX) * canvas.width,
			(az.maxY - az.minY) * canvas.height,
		);
		ctx.fillStyle = "#38bdf8aa";
		ctx.font = "11px monospace";
		ctx.fillText(
			"ZONE ACTIVE",
			az.minX * canvas.width + 6,
			az.minY * canvas.height + 14,
		);
		ctx.restore();
	}

	for (const observation of hands) {
		const points = observation.landmarks;
		const tracked = trackedHands.value.find(
			(hand) => hand.status === "tracked" && hand.observation === observation,
		);
		ctx.strokeStyle = tracked ? handColor(tracked.id) : "#94a3b8";
		ctx.lineWidth = 3;

		for (const connection of HAND_CONNECTIONS) {
			const start = points[connection.start];
			const end = points[connection.end];
			if (!start || !end) continue;

			ctx.beginPath();
			ctx.moveTo(start.x * canvas.width, start.y * canvas.height);
			ctx.lineTo(end.x * canvas.width, end.y * canvas.height);
			ctx.stroke();
		}

		ctx.fillStyle = "#facc15";
		for (const point of points) {
			ctx.beginPath();
			ctx.arc(
				point.x * canvas.width,
				point.y * canvas.height,
				5,
				0,
				Math.PI * 2,
			);
			ctx.fill();
		}
	}

	for (const pointer of pointerFrame.value.pointers) {
		if (
			pointer.isPrimary &&
			(actionState.value.grabProgress > 0 ||
				actionState.value.leftButtonDown ||
				actionState.value.scrolling)
		) {
			ctx.save();
			ctx.translate(
				pointer.palmPosition.x * canvas.width,
				pointer.palmPosition.y * canvas.height,
			);
			ctx.fillStyle = "#020617cc";
			ctx.beginPath();
			ctx.arc(0, 0, 22, 0, Math.PI * 2);
			ctx.fill();
			ctx.lineWidth = 4;
			ctx.strokeStyle = actionState.value.scrolling ? "#38bdf8" : "#4ade80";
			const progress = actionState.value.scrolling
				? 1
				: actionState.value.grabProgress;
			ctx.beginPath();
			ctx.arc(
				0,
				0,
				22,
				-Math.PI / 2,
				-Math.PI / 2 + Math.PI * 2 * Math.max(0.08, progress),
			);
			ctx.stroke();
			ctx.restore();
		}
		if (!pointer.active) continue;
		ctx.save();
		ctx.translate(
			pointer.position.x * canvas.width,
			pointer.position.y * canvas.height,
		);
		ctx.strokeStyle = pointer.isPrimary ? "#ffffff" : "#fb923c";
		ctx.fillStyle = "#020617dd";
		ctx.lineWidth = 3;
		ctx.setLineDash(pointer.isPrimary ? [] : [5, 4]);
		ctx.beginPath();
		ctx.arc(0, 0, 18, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();
		ctx.restore();
	}

	if (
		bimanualState.value.phase === "palms-together" &&
		pointerFrame.value.pointers.length >= 2
	) {
		const p1 = pointerFrame.value.pointers[0]?.palmPosition;
		const p2 = pointerFrame.value.pointers[1]?.palmPosition;
		if (p1 && p2) {
			ctx.save();
			ctx.strokeStyle = "#38bdf8";
			ctx.lineWidth = 3;
			ctx.setLineDash([6, 4]);
			ctx.beginPath();
			ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
			ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
			ctx.stroke();
			ctx.fillStyle = "#38bdf8";
			ctx.font = "bold 12px sans-serif";
			const midX = ((p1.x + p2.x) / 2) * canvas.width;
			const midY = ((p1.y + p2.y) / 2) * canvas.height;
			ctx.fillText(
				"👐 Écartez pour ouvrir le clavier",
				Math.max(10, midX - 90),
				midY - 12,
			);
			ctx.restore();
		}
	}
}

async function toggleKeyboard() {
	if (window.handfinityOverlay) {
		overlayKeyboardOpen.value = await window.handfinityOverlay.toggle();
	} else {
		overlayKeyboardOpen.value = !overlayKeyboardOpen.value;
	}
}

function handleTrackingFrame({
	tracking,
	aspectRatio,
	hasNewFrame,
}: TrackingSessionFrame) {
	const frame = engine.update(tracking, aspectRatio);
	if (hasNewFrame) processedFrames.value += 1;
	trackedHands.value = frame.tracking.hands;
	trackingAmbiguous.value = frame.tracking.ambiguous;
	handPoses.value = frame.poses;
	pointerFrame.value = frame.pointers;
	controlFrame.value = frame.control;
	actionState.value = frame.actionState;
	bimanualState.value = frame.bimanual;
	if (frame.bimanual.keyboardToggle) {
		void toggleKeyboard();
		lastActionLabel.value = "👐 Clavier virtuel Windows";
	}
	const latestAction = frame.actions.at(-1);
	if (latestAction) {
		lastActionLabel.value = formatAction(latestAction);
	}
	pushHudState(latestAction ? formatAction(latestAction) : null);
	submit(frame);
	const visible = frame.tracking.hands
		.filter((hand) => hand.status === "tracked")
		.map((hand) => hand.observation);
	handCount.value = visible.length;
	drawHands(visible);
}

function stopCamera() {
	sessionGeneration += 1;
	void disablePointer();
	session.stop();

	const canvas = canvasRef.value;
	if (canvas) {
		canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
	}

	isRunning.value = false;
	isLoading.value = false;
	handCount.value = 0;
	processedFrames.value = 0;
	trackedHands.value = [];
	engine.reset();
	controlFrame.value = engine.getControlState();
	actionState.value = engine.getActionState();
	bimanualState.value = {
		phase: "idle",
		distance: null,
		progress: 0,
		keyboardToggle: false,
	};
	lastActionLabel.value = "None";
	handPoses.value = [];
	pointerFrame.value = emptyPointers;
	trackingAmbiguous.value = false;
	pushHudState(null);
}

async function toggleCamera() {
	if (disposed || isLoading.value) return;

	if (isRunning.value) {
		stopCamera();
		return;
	}

	const video = videoRef.value;
	if (!video) return;

	isLoading.value = true;
	cameraError.value = "";

	const generation = sessionGeneration;
	try {
		await session.start(video);
		if (disposed || generation !== sessionGeneration) return;
		isRunning.value = true;
	} catch (err) {
		if (disposed || generation !== sessionGeneration) return;
		stopCamera();
		cameraError.value =
			err instanceof Error ? err.message : "Camera unavailable";
	} finally {
		if (generation === sessionGeneration) isLoading.value = false;
	}
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
	stopCamera();
});
</script>

<template>
	<main class="min-h-screen bg-slate-950 p-4 text-white sm:p-5">
		<div class="mx-auto max-w-5xl space-y-4">
			<header class="flex flex-wrap items-baseline justify-between gap-2">
				<div>
					<h1 class="text-2xl font-bold">Handfinity Desktop</h1>
					<p class="text-sm text-slate-400">
						Hands-free mouse (move, left/right click, drag, scroll) and virtual
						keyboard.
					</p>
				</div>
				<div class="flex items-center gap-3 text-xs text-slate-400">
					<button
						type="button"
						data-toggle-keyboard
						@click="toggleKeyboard"
						class="rounded border px-2.5 py-1 text-slate-200 transition-colors hover:bg-slate-800"
						:class="overlayKeyboardOpen ? 'border-cyan-500 bg-cyan-950/60 text-cyan-300' : 'border-slate-700 bg-slate-900'"
					>
						{{
							overlayKeyboardOpen
								? "Masquer clavier Windows"
								: "Clavier virtuel Windows (👐)"
						}}
					</button>
					<span>
						Emergency stop:
						<kbd class="rounded bg-slate-800 px-1.5 py-0.5"
							>Ctrl + Alt + Esc</kbd
						>
					</span>
				</div>
			</header>

			<section
				aria-label="Camera and pointer controls"
				class="grid gap-3 rounded-lg bg-slate-900 p-4 lg:grid-cols-2"
			>
				<div class="space-y-2">
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="button"
							:disabled="isLoading"
							@click="toggleCamera"
							class="rounded-lg bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500 disabled:opacity-50"
						>
							{{
								isLoading
									? "Initializing..."
									: isRunning
										? "Stop camera"
										: "Start camera"
							}}
						</button>
						<p class="text-xs text-slate-400">
							Hands: {{ handCount }} ·
							<span data-processed-frames>Frames: {{ processedFrames }}</span>
						</p>
					</div>
					<p
						data-hand-selection
						:data-status="pointerFrame.selectionStatus"
						role="status"
						class="text-sm"
						:class="pointerFrame.selectionStatus === 'tracked' ? 'text-sky-300' : 'text-amber-300'"
					>
						{{ selectionStatus }}
					</p>
					<p
						data-pointer-readiness
						role="status"
						class="text-sm"
						:class="controlFrame.paused ? 'text-amber-300' : 'text-slate-300'"
					>
						{{ pointerReadiness }}
					</p>
					<p class="text-xs text-slate-400">
						Last input action:
						<span class="font-mono text-cyan-300">{{ lastActionLabel }}</span>
					</p>
					<div
						v-if="actionState.grabProgress > 0 || actionState.leftButtonDown"
						data-grab-progress
						class="space-y-1 pt-1"
					>
						<div class="flex justify-between text-xs text-emerald-300">
							<span>
								{{
									actionState.leftButtonDown
										? "✊ Grab locked — move palm to drag"
										: "✊ Hold fist to grab (0.6s)…"
								}}
							</span>
							<span>{{ Math.round(actionState.grabProgress * 100) }}%</span>
						</div>
						<div class="h-2 w-full overflow-hidden rounded-full bg-slate-800">
							<div
								class="h-full bg-emerald-400 transition-all duration-75"
								:style="{
									width: `${Math.round(actionState.grabProgress * 100)}%`,
								}"
							/>
						</div>
					</div>
					<p v-if="cameraError" role="alert" class="text-sm text-red-400">
						{{ cameraError }}
					</p>
				</div>

				<section
					data-system-pointer
					:data-phase="state.phase"
					aria-labelledby="system-pointer-title"
					class="flex flex-col justify-between gap-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm"
				>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div class="min-w-0">
							<h2 id="system-pointer-title" class="font-medium">
								Windows pointer & keyboard
							</h2>
							<p
								role="status"
								:class="state.phase === 'error' ? 'text-red-400' : 'text-slate-300'"
							>
								{{ pointerStatus }}
							</p>
						</div>
						<button
							type="button"
							data-toggle-system-pointer
							:disabled="!bridge || state.phase === 'unsupported' || (!isRunning && !enabled && !starting)"
							@click="togglePointer"
							class="rounded-lg bg-cyan-700 px-4 py-2 font-medium hover:bg-cyan-600 disabled:opacity-50"
						>
							{{
								enabled || starting
									? "Stop Windows pointer"
									: "Enable Windows pointer"
							}}
						</button>
					</div>
					<div
						class="grid grid-cols-2 gap-1.5 text-xs text-slate-400 sm:grid-cols-4"
					>
						<span class="rounded bg-slate-900 px-2 py-1">☝️ 1 Finger: Move</span>
						<span class="rounded bg-slate-900 px-2 py-1"
							>✌️ 2 Fingers: Left-click</span
						>
						<span class="rounded bg-slate-900 px-2 py-1"
							>🤟 3 Fingers: Right-click</span
						>
						<span class="rounded bg-slate-900 px-2 py-1"
							>✊ Fist (0.6s): Grab &amp; Drag</span
						>
						<span class="rounded bg-slate-900 px-2 py-1"
							>🤏 Pinch + ↑/↓: Scroll</span
						>
						<span class="rounded bg-slate-900 px-2 py-1"
							>🖐️ Palm (1.5s): Pause</span
						>
						<span
							class="col-span-2 rounded border border-cyan-800/60 bg-cyan-950/40 px-2 py-1 font-medium text-cyan-300"
							>👐 Paumes jointes → écartées : Clavier</span
						>
					</div>
					<p
						v-if="bridge && state.phase !== 'unsupported' && !enabled && !starting && !isRunning"
						class="text-xs text-amber-300"
					>
						Start the camera to enable control.
					</p>
				</section>
			</section>

			<section
				aria-label="Camera preview"
				class="space-y-2 rounded-lg bg-slate-900 p-3"
			>
				<h2 class="font-medium">Camera preview</h2>
				<div
					class="relative aspect-video max-h-[26rem] overflow-hidden rounded-lg bg-black"
				>
					<video
						ref="videoRef"
						autoplay
						muted
						playsinline
						aria-label="Live camera preview"
						class="absolute inset-0 h-full w-full -scale-x-100 object-contain"
					/>
					<canvas
						ref="canvasRef"
						aria-hidden="true"
						class="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-contain"
					/>
				</div>
			</section>
		</div>
	</main>
</template>
