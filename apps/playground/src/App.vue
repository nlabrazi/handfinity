<script setup lang="ts">
import type {
	HandObservation,
	HandTrackingFrame,
	TrackedHand,
	TrackedHandPose,
} from "@handfinity/core";
import {
	createGestureEngine,
	type GestureEngineFrame,
	type HandPointerFrame,
} from "@handfinity/interactions";
import {
	createTrackingSession,
	HAND_CONNECTIONS,
	type TrackingSessionFrame,
	type TrackingSessionOptions,
} from "@handfinity/vision";
import { computed, onBeforeUnmount, ref, shallowRef } from "vue";
import GestureControlDiagnostics from "./components/GestureControlDiagnostics.vue";
import HandPoseDiagnostics from "./components/HandPoseDiagnostics.vue";
import PointerCommandDiagnostics from "./components/PointerCommandDiagnostics.vue";
import { createPointerSimulation } from "./pointer-simulation";

const props = defineProps<{ trackingOptions?: TrackingSessionOptions }>();
const emit = defineEmits<{
	"gesture-frame": [frame: GestureEngineFrame];
	"tracking-stop": [];
}>();

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const isRunning = ref(false);
const isLoading = ref(false);
const handCount = ref(0);
const processedFrames = ref(0);
const error = ref("");

const trackedHands = shallowRef<readonly TrackedHand[]>([]);
const trackingAmbiguous = ref(false);
const trackingTransition = ref("None");
const handPoses = shallowRef<readonly TrackedHandPose[]>([]);
const emptyPointers: HandPointerFrame = {
	timestamp: 0,
	pointers: [],
	primaryHandId: null,
	selectionStatus: "unselected",
};
const pointerFrame = shallowRef(emptyPointers);
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

const engine = createGestureEngine();
const controlFrame = shallowRef(engine.getControlState());
const simulator = createPointerSimulation();
const pointerSimulation = shallowRef(simulator.reset());
const pointerReadiness = computed(() => {
	if (!isRunning.value) return "Start the camera to begin.";
	if (controlFrame.value.paused)
		return pointerFrame.value.selectionStatus === "tracked"
			? "Paused — hold your open palm to resume."
			: "Paused — show a hand, then hold your open palm to resume.";
	if (pointerFrame.value.selectionStatus !== "tracked")
		return "Show a pointing hand to control the pointer.";
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
			stop();
			error.value = err instanceof Error ? err.message : "Tracking failed";
		},
	},
	props.trackingOptions,
);
let sessionGeneration = 0;
let disposed = false;

function showTracking(frame: HandTrackingFrame) {
	trackedHands.value = frame.hands;
	trackingAmbiguous.value = frame.ambiguous;
	if (frame.events.length) {
		trackingTransition.value = frame.events
			.map((event) =>
				event.type === "hand:found"
					? `Hand #${event.handId} appeared`
					: `Hand #${event.handId} lost (${event.reason})`,
			)
			.join(" · ");
	}
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

		const wrist = points[0];
		if (tracked && wrist) {
			ctx.save();
			ctx.translate(wrist.x * canvas.width, wrist.y * canvas.height);
			// Le canvas entier est affiché en miroir : retourner aussi le texte.
			ctx.scale(-1, 1);
			ctx.font = "bold 24px sans-serif";
			ctx.lineWidth = 4;
			ctx.strokeStyle = "#020617";
			ctx.fillStyle = handColor(tracked.id);
			ctx.strokeText(`#${tracked.id}`, 10, -12);
			ctx.fillText(`#${tracked.id}`, 10, -12);
			ctx.restore();
		}
	}

	// Même repère que les repères vidéo ; le miroir reste celui du canvas.
	for (const pointer of pointerFrame.value.pointers) {
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
		ctx.scale(-1, 1);
		ctx.font = "bold 12px sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = ctx.strokeStyle;
		ctx.fillText(`#${pointer.handId}`, 0, 0);
		ctx.restore();
	}
}

function handleTrackingFrame({
	tracking,
	aspectRatio,
	hasNewFrame,
}: TrackingSessionFrame) {
	showGestureFrame(engine.update(tracking, aspectRatio), hasNewFrame);
}

function showGestureFrame(frame: GestureEngineFrame, hasNewFrame = false) {
	if (hasNewFrame) processedFrames.value += 1;
	showTracking(frame.tracking);
	handPoses.value = frame.poses;
	pointerFrame.value = frame.pointers;
	controlFrame.value = frame.control;
	pointerSimulation.value = simulator.execute(frame.commands);
	emit("gesture-frame", frame);
	const visible = frame.tracking.hands
		.filter((hand) => hand.status === "tracked")
		.map((hand) => hand.observation);
	handCount.value = visible.length;
	drawHands(visible);
}

function stop() {
	sessionGeneration += 1;
	emit("tracking-stop");
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
	pointerSimulation.value = simulator.reset();
	handPoses.value = [];
	pointerFrame.value = emptyPointers;
	trackingAmbiguous.value = false;
	trackingTransition.value = "None";
}

async function toggleCamera() {
	if (disposed || isLoading.value) return;

	if (isRunning.value) {
		stop();
		return;
	}

	const video = videoRef.value;
	if (!video) return;

	isLoading.value = true;
	error.value = "";

	const generation = sessionGeneration;
	try {
		await session.start(video);
		if (disposed || generation !== sessionGeneration) return;
		isRunning.value = true;
	} catch (err) {
		if (disposed || generation !== sessionGeneration) return;
		stop();
		error.value = err instanceof Error ? err.message : "Camera unavailable";
	} finally {
		if (generation === sessionGeneration) isLoading.value = false;
	}
}

onBeforeUnmount(() => {
	disposed = true;
	stop();
});
</script>

<template>
	<main class="min-h-screen bg-slate-950 p-4 text-white sm:p-5">
		<div class="mx-auto max-w-7xl space-y-3">
			<header class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<h1 class="text-2xl font-bold">Playground</h1>
				<p class="text-sm text-slate-400">
					<slot name="description">
						Hand tracking and pointer simulation. This web view does not control
						the system pointer.
					</slot>
				</p>
			</header>

			<section
				aria-label="Camera and hand controls"
				class="space-y-2 rounded-lg bg-slate-900 p-3"
			>
				<div
					class="grid items-end gap-3 lg:grid-cols-[auto_minmax(12rem,1fr)_minmax(20rem,1.4fr)]"
				>
					<div class="space-y-1">
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
							Hands detected: {{ handCount }} ·
							<span data-processed-frames
								>Images processed: {{ processedFrames }}</span
							>
						</p>
					</div>

					<div data-hand-pointers class="min-w-0 space-y-1 text-sm">
						<p class="font-medium">Controlling hand</p>
						<p
							data-hand-selection
							:data-status="pointerFrame.selectionStatus"
							role="status"
							:class="pointerFrame.selectionStatus === 'tracked' ? 'text-sky-300' : 'text-amber-300'"
						>
							{{ selectionStatus }}
						</p>
					</div>
					<slot name="controls" :is-running="isRunning" />
				</div>
				<p
					data-pointer-readiness
					role="status"
					class="text-sm"
					:class="controlFrame.paused ? 'text-amber-300' : 'text-slate-300'"
				>
					{{ pointerReadiness }}
				</p>
				<p v-if="error" role="alert" class="text-red-400">{{ error }}</p>
			</section>

			<div class="grid items-start gap-3 lg:grid-cols-2">
				<section
					aria-label="Camera preview"
					class="min-w-0 space-y-2 rounded-lg bg-slate-900 p-3"
				>
					<h2 class="font-medium">Camera preview</h2>
					<div
						class="relative aspect-video overflow-hidden rounded-lg bg-black"
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
					<p class="text-xs text-slate-400">
						Point with your index, fold the other three fingers and keep your
						thumb separate. The solid circle marks the controlling hand.
					</p>
				</section>
				<PointerCommandDiagnostics :frame="pointerSimulation" />
			</div>

			<details
				data-advanced-diagnostics
				class="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm"
			>
				<summary class="cursor-pointer font-medium">
					Tracking and gesture details
				</summary>
				<div class="mt-3 grid items-start gap-3 lg:grid-cols-3">
					<GestureControlDiagnostics
						:state="controlFrame"
						:running="isRunning"
						:selection-status="pointerFrame.selectionStatus"
					/>
					<div
						data-hand-tracking
						class="space-y-2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm"
					>
						<h2 class="font-medium">Hand identities and pointers</h2>
						<ul v-if="trackedHands.length" class="space-y-1">
							<li
								v-for="hand in trackedHands"
								:key="hand.id"
								:style="{ color: handColor(hand.id) }"
							>
								Hand #{{ hand.id }} · {{ hand.observation.handedness }} ·
								{{ hand.status }}
							</li>
						</ul>
						<p v-else class="text-slate-400">No identified hands.</p>
						<p v-if="trackingAmbiguous" class="text-amber-300">
							Ambiguous positions — separate your hands to restart tracking.
						</p>
						<p class="text-slate-400">
							Last tracking event: {{ trackingTransition }}
						</p>
						<ul v-if="pointerFrame.pointers.length" class="space-y-1">
							<li
								v-for="pointer in pointerFrame.pointers"
								:key="pointer.handId"
								:data-pointer-hand="pointer.handId"
								class="rounded border border-slate-700 p-2"
							>
								Hand #{{ pointer.handId }} ·
								{{ pointer.isPrimary ? "main" : "secondary" }} ·
								{{ pointer.active ? "active" : "resting" }}
								<p class="mt-1 font-mono text-xs text-slate-400">
									Source x: {{ pointer.position.x.toFixed(3) }} · y:
									{{ pointer.position.y.toFixed(3) }}
								</p>
							</li>
						</ul>
					</div>
					<HandPoseDiagnostics :hands="handPoses" />
				</div>
			</details>
		</div>
	</main>
</template>
