import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export type HandPoint = {
	x: number;
	y: number;
	z: number;
};

export type HandTracker = {
	detect(video: HTMLVideoElement, timestamp: number): HandPoint[][];
	close(): void;
};

export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;

export async function createHandTracker(): Promise<HandTracker> {
	const vision = await FilesetResolver.forVisionTasks(
		"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm",
	);

	const landmarker = await HandLandmarker.createFromOptions(vision, {
		baseOptions: {
			modelAssetPath:
				"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
			delegate: "CPU",
		},
		runningMode: "VIDEO",
		numHands: 2,
		minHandDetectionConfidence: 0.5,
		minTrackingConfidence: 0.5,
	});

	return {
		detect(video, timestamp) {
			return landmarker.detectForVideo(video, timestamp).landmarks;
		},
		close() {
			landmarker.close();
		},
	};
}
