import {
	computed,
	getCurrentInstance,
	onDeactivated,
	onScopeDispose,
	ref,
	type Ref,
} from "vue";
import {
	startPinchSession,
	createPointSmoother,
	type PinchEvent,
	type PinchSession,
	type Point,
} from "@handfinity/vision";
import { getGestureFeedback } from "../lib/gesture-feedback";
import { useDrawingCanvas, type DrawingCanvases } from "./useDrawingCanvas";

type PaintElements = DrawingCanvases & {
	videoRef: Readonly<Ref<HTMLVideoElement | null>>;
};

export function usePaint(elements: PaintElements) {
	const { videoRef } = elements;
	const isRunning = ref(false);
	const isLoading = ref(false);
	const isPinching = ref(false);
	const hasTrackedHand = ref(false);
	const pointer = ref<Point | null>(null);
	const error = ref("");
	const cameraAspect = ref("16 / 9");
	const drawing = useDrawingCanvas(
		elements,
		() => isPinching.value || isLoading.value,
	);
	const pointSmoother = createPointSmoother();
	let session: PinchSession | null = null;
	let disposed = false;
	let sessionGeneration = 0;

	const gestureFeedback = computed(() =>
		getGestureFeedback({
			isLoading: isLoading.value,
			hasError: !!error.value,
			isRunning: isRunning.value,
			hasPointer: !!pointer.value,
			hasTrackedHand: hasTrackedHand.value,
			isPinching: isPinching.value,
			isDrawing: !!drawing.activeStroke.value,
		}),
	);

	function handleGesture(event: PinchEvent) {
		isPinching.value = event.type !== "pinch:end";
		if (event.type === "pinch:end") {
			drawing.finishStroke();
			if (event.reason === "tracking-lost") {
				pointer.value = null;
				pointSmoother.reset();
			}
			return;
		}
		if (!drawing.isReady()) return;
		pointer.value = pointSmoother.update(event.position, event.timestamp);
		// Appliquer le miroir une seule fois avant de mémoriser les points lissés.
		const point = { x: 1 - pointer.value.x, y: pointer.value.y };
		if (event.type === "pinch:start") drawing.startStroke(point);
		else drawing.moveStroke(point);
	}

	function handlePointer(point: Point | null, timestamp: number) {
		if (point) hasTrackedHand.value = true;
		if (!point) {
			pointer.value = null;
			pointSmoother.reset();
		} else if (!drawing.activeStroke.value) {
			pointer.value = pointSmoother.update(point, timestamp);
		}
	}

	function stop() {
		sessionGeneration += 1;
		session?.stop();
		session = null;
		drawing.finishStroke();
		pointSmoother.reset();
		isRunning.value = false;
		isPinching.value = false;
		hasTrackedHand.value = false;
		pointer.value = null;
	}

	async function toggleCamera() {
		if (disposed || isLoading.value) return;
		if (isRunning.value) {
			stop();
			return;
		}
		const video = videoRef.value;
		if (!video || !drawing.canvasRef.value || !drawing.previewCanvasRef.value)
			return;
		isLoading.value = true;
		error.value = "";
		const generation = sessionGeneration;
		try {
			const controller = await startPinchSession(video, {
				onGesture: handleGesture,
				onPointer: handlePointer,
				onError: (err) => {
					stop();
					error.value = err instanceof Error ? err.message : "Tracking failed";
				},
			});
			if (disposed || generation !== sessionGeneration) {
				controller.stop();
				return;
			}
			session = controller;
			cameraAspect.value = `${video.videoWidth} / ${video.videoHeight}`;
			drawing.resize(video.videoWidth, video.videoHeight);
			isRunning.value = true;
		} catch (err) {
			stop();
			error.value = err instanceof Error ? err.message : "Camera unavailable";
		} finally {
			isLoading.value = false;
		}
	}

	// Le hub conserve le dessin via KeepAlive, mais jamais la caméra en arrière-plan.
	if (getCurrentInstance()) onDeactivated(stop);
	onScopeDispose(() => {
		disposed = true;
		stop();
	});

	return {
		isRunning,
		isLoading,
		pointer,
		error,
		cameraAspect,
		brushColor: drawing.brushColor,
		brushWidth: drawing.brushWidth,
		activeStroke: drawing.activeStroke,
		canUndo: drawing.canUndo,
		canRedo: drawing.canRedo,
		gestureFeedback,
		toggleCamera,
		undo: drawing.undo,
		redo: drawing.redo,
		clearCanvas: drawing.clearCanvas,
		exportPng: drawing.exportPng,
	};
}
