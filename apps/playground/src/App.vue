<script setup lang="ts">
import { onBeforeUnmount, ref, shallowRef } from "vue";
import {
	createTrackingSession,
	HAND_CONNECTIONS,
	type TrackingSessionFrame,
} from "@handfinity/vision";
import type {
	HandObservation,
	HandTrackingFrame,
	TrackedHand,
	TrackedHandPose,
} from "@handfinity/core";
import {
	createGestureEngine,
	type HandPointerFrame,
} from "@handfinity/interactions";
import HandPoseDiagnostics from "./components/HandPoseDiagnostics.vue";
import PointerCommandDiagnostics from "./components/PointerCommandDiagnostics.vue";
import { createPointerSimulation } from "./pointer-simulation";

const videoRef = ref<HTMLVideoElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

const isRunning = ref(false);
const isLoading = ref(false);
const handCount = ref(0);
const error = ref("");

const trackedHands = shallowRef<readonly TrackedHand[]>([]);
const trackingAmbiguous = ref(false);
const trackingTransition = ref("None");
const handPoses = shallowRef<readonly TrackedHandPose[]>([]);
const emptyPointers: HandPointerFrame = {
	timestamp: 0,
	pointers: [],
	primaryHandId: null,
	preferredHandId: null,
};
const pointerFrame = shallowRef(emptyPointers);

const engine = createGestureEngine();
const simulator = createPointerSimulation();
const pointerSimulation = shallowRef(simulator.reset());

const session = createTrackingSession({
	onFrame: handleTrackingFrame,
	onError(err) {
		stop();
		error.value = err instanceof Error ? err.message : "Tracking failed";
	},
});
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

function handleTrackingFrame({ tracking, aspectRatio }: TrackingSessionFrame) {
	const frame = engine.update(tracking, aspectRatio);
	showTracking(frame.tracking);
	handPoses.value = frame.poses;
	pointerFrame.value = frame.pointers;
	pointerSimulation.value = simulator.execute(frame.commands);
	const visible = frame.tracking.hands
		.filter((hand) => hand.status === "tracked")
		.map((hand) => hand.observation);
	handCount.value = visible.length;
	drawHands(visible);
}

function choosePrimaryHand(event: Event) {
	const value = (event.target as HTMLSelectElement).value;
	engine.setPrimaryHand(value === "auto" ? null : Number(value));
}

function stop() {
	sessionGeneration += 1;
	session.stop();

	const canvas = canvasRef.value;
	if (canvas) {
		canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
	}

	isRunning.value = false;
	isLoading.value = false;
	handCount.value = 0;
	trackedHands.value = [];
	engine.reset();
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
	<main class="min-h-screen bg-slate-950 p-4 text-white sm:p-8">
		<div class="mx-auto max-w-6xl space-y-6">
			<header>
				<h1 class="text-3xl font-bold">Playground</h1>
				<p class="mt-2 text-slate-400">
					Hand tracking, poses and pointer command simulation.
				</p>
				<p class="mt-2 text-sm text-slate-400">
					Hand pointers appear in the camera preview; shared move commands drive
					the simulation. System mouse and keyboard control is not implemented
					yet.
				</p>
			</header>

			<div
				class="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]"
			>
				<section
					aria-label="Camera and pointer diagnostics"
					class="min-w-0 space-y-4"
				>
					<div
						class="relative aspect-video overflow-hidden rounded-xl bg-black"
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

					<div class="flex flex-wrap items-center gap-4">
						<button
							type="button"
							:disabled="isLoading"
							@click="toggleCamera"
							class="rounded-lg bg-blue-600 px-5 py-3 font-medium hover:bg-blue-500 disabled:opacity-50"
						>
							{{
								isLoading
									? "Initializing..."
									: isRunning
										? "Stop camera"
										: "Start camera"
							}}
						</button>
						<span class="text-sm text-slate-400"
							>Hands detected: {{ handCount }}</span
						>
					</div>
					<p v-if="error" role="alert" class="text-red-400">{{ error }}</p>

					<section
						aria-labelledby="pointer-title"
						data-hand-pointers
						class="space-y-3 rounded-lg bg-slate-900 p-4 text-sm"
					>
						<h2 id="pointer-title" class="font-medium">Hand pointers</h2>
						<p class="text-slate-400">
							Extend your index, fold the other three fingers, and keep your
							thumb separate from the index. The solid cursor marks the main
							hand; a dashed cursor marks the secondary hand.
						</p>
						<label for="main-hand" class="block font-medium">Main hand</label>
						<select
							id="main-hand"
							:value="pointerFrame.preferredHandId ?? 'auto'"
							:disabled="!isRunning || !trackedHands.length"
							@change="choosePrimaryHand"
							class="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-white disabled:opacity-50"
						>
							<option value="auto">
								Automatic{{
									pointerFrame.primaryHandId !== null
										? ` (main: #${pointerFrame.primaryHandId})`
										: ""
								}}
							</option>
							<option
								v-for="hand in trackedHands"
								:key="hand.id"
								:value="hand.id"
							>
								Hand #{{ hand.id }} · {{ hand.observation.handedness }} ·
								{{ hand.status }}
							</option>
						</select>
						<p v-if="!pointerFrame.pointers.length" class="text-slate-400">
							No visible hand pointers.
						</p>
						<ul v-else class="space-y-2">
							<li
								v-for="pointer in pointerFrame.pointers"
								:key="pointer.handId"
								:data-pointer-hand="pointer.handId"
								class="rounded-lg border border-slate-700 p-3"
							>
								<p>
									Hand #{{ pointer.handId }} ·
									{{ pointer.isPrimary ? "main" : "secondary" }} ·
									<span
										:class="pointer.active ? 'text-sky-300' : 'text-slate-400'"
										>{{
											pointer.active ? "active" : "resting"
										}}</span
									>
								</p>
								<p class="mt-1 font-mono text-xs text-slate-400">
									Source x: {{ pointer.position.x.toFixed(3) }} · y:
									{{ pointer.position.y.toFixed(3) }}
								</p>
							</li>
						</ul>
						<p class="text-slate-400">
							Coordinates refer to the source image before mirroring. A resting
							or briefly missing main hand keeps its role while its identity
							exists.
						</p>
					</section>
				</section>

				<section
					aria-label="Command, tracking and pose diagnostics"
					class="min-w-0 space-y-4"
				>
					<PointerCommandDiagnostics :frame="pointerSimulation" />
					<div
						data-hand-tracking
						class="space-y-2 rounded-lg bg-slate-900 p-3 text-sm"
					>
						<h2 class="font-medium">Hand identities</h2>
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
					</div>
					<HandPoseDiagnostics :hands="handPoses" />
				</section>
			</div>
		</div>
	</main>
</template>
