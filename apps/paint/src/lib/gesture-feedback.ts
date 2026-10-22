type PaintState = {
	isLoading: boolean;
	hasError: boolean;
	isRunning: boolean;
	hasPointer: boolean;
	hasTrackedHand: boolean;
	isPinching: boolean;
	isDrawing: boolean;
};

export type GestureFeedback = {
	state:
		| "loading"
		| "error"
		| "stopped"
		| "searching"
		| "paused"
		| "drawing"
		| "ready";
	label: string;
	help: string;
	color: string;
};

export function getGestureFeedback(paint: PaintState): GestureFeedback {
	if (paint.isLoading) {
		return {
			state: "loading",
			label: "Starting camera",
			help: "Allow camera access and wait for hand tracking to start.",
			color: "text-slate-300",
		};
	}
	if (paint.hasError) {
		return {
			state: "error",
			label: "Session interrupted",
			help: "Check the error below, then try starting the camera again.",
			color: "text-red-400",
		};
	}
	if (!paint.isRunning) {
		return {
			state: "stopped",
			label: "Camera off",
			help: "Start the camera to draw with your hand.",
			color: "text-slate-300",
		};
	}
	if (!paint.hasPointer) {
		return {
			state: "searching",
			label: paint.hasTrackedHand ? "Tracking lost" : "Show one hand",
			help: "Keep one hand clearly visible in the camera frame.",
			color: "text-amber-300",
		};
	}
	if (paint.isPinching && !paint.isDrawing) {
		return {
			state: "paused",
			label: "Release to continue",
			help: "Open your fingers, then pinch again to start a new stroke.",
			color: "text-amber-300",
		};
	}
	if (paint.isPinching) {
		return {
			state: "drawing",
			label: "Drawing",
			help: "Release your fingers to finish the stroke and use Undo / Redo.",
			color: "text-green-400",
		};
	}
	return {
		state: "ready",
		label: "Ready",
		help: "Pinch your thumb and index finger to draw.",
		color: "text-sky-400",
	};
}
