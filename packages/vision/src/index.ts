export { startCamera, stopCamera } from "./camera";

export { createHandTracker, HAND_CONNECTIONS } from "./hand-tracker";

export type { HandTracker } from "./hand-tracker";

export { createTrackingSession } from "./tracking-session";
export type {
	TrackingSession,
	TrackingCallbacks,
	TrackingSessionFrame,
} from "./tracking-session";

export { createPinchSession, startPinchSession } from "./pinch-session";

export type {
	PinchCallbacks,
	PinchSession,
} from "./pinch-session";

export type {
	Handedness,
	HandObservation,
	HandPoint,
	PinchEvent,
	Point,
} from "@handfinity/core";
export { createPointSmoother } from "@handfinity/core";
