import type { Handedness, HandObservation } from "@handfinity/core";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export type HandTracker = {
	/** Observations de l'image ; l'ordre du tableau n'identifie pas les mains. */
	detect(video: HTMLVideoElement, timestamp: number): HandObservation[];
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
			const result = landmarker.detectForVideo(video, timestamp);
			return result.landmarks.map((landmarks, index) => {
				const category = result.handedness[index]?.[0];
				let handedness: Handedness = "unknown";
				if (category?.categoryName === "Left") handedness = "left";
				else if (category?.categoryName === "Right") handedness = "right";

				return {
					landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
					handedness,
					handednessConfidence:
						handedness === "unknown" ? null : (category?.score ?? null),
					timestamp,
				};
			});
		},
		close() {
			landmarker.close();
		},
	};
}
