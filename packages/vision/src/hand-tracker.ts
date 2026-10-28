import type { Handedness, HandObservation } from "@handfinity/engine";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export type HandTracker = {
	/** Observations de l'image ; l'ordre du tableau n'identifie pas les mains. */
	detect(video: HTMLVideoElement, timestamp: number): HandObservation[];
	close(): void;
};

export const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;

export const DEFAULT_REMOTE_WASM_PATH =
	"https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
export const DEFAULT_REMOTE_MODEL_PATH =
	"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export const DEFAULT_LOCAL_WASM_PATH = "/mediapipe/wasm";
export const DEFAULT_LOCAL_MODEL_PATH =
	"/mediapipe/models/hand_landmarker.task";

export type HandTrackerOptions = {
	/** Chemin ou URL vers le dossier des fichiers WASM de MediaPipe (par défaut "/mediapipe/wasm" avec repli sur CDN). */
	readonly wasmLoaderPath?: string;
	/** Chemin ou URL vers le fichier hand_landmarker.task (par défaut "/mediapipe/models/hand_landmarker.task" avec repli sur Google Cloud). */
	readonly modelAssetPath?: string;
	/** Tente d'abord le chargement local avant de basculer sur les CDN distants (par défaut true). */
	readonly preferLocal?: boolean;
};

function createWithDelegate(
	vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
	modelAssetPath: string,
	delegate: "GPU" | "CPU",
) {
	return HandLandmarker.createFromOptions(vision, {
		baseOptions: {
			modelAssetPath,
			delegate,
		},
		runningMode: "VIDEO",
		numHands: 2,
		minHandDetectionConfidence: 0.5,
		minTrackingConfidence: 0.5,
	});
}

async function instantiateLandmarker(
	wasmPath: string,
	modelPath: string,
): Promise<HandLandmarker> {
	const vision = await FilesetResolver.forVisionTasks(wasmPath);
	try {
		return await createWithDelegate(vision, modelPath, "GPU");
	} catch {
		return await createWithDelegate(vision, modelPath, "CPU");
	}
}

function createLandmarkerWrapper(landmarker: HandLandmarker): HandTracker {
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

/**
 * Crée un traqueur MediaPipe HandLandmarker.
 * Tente d'abord le chargement hors-ligne local puis bascule automatiquement
 * sur les serveurs distants CDN/Google en cas d'indisponibilité locale.
 */
export async function createHandTracker(
	options?: HandTrackerOptions,
): Promise<HandTracker> {
	const preferLocal = options?.preferLocal !== false;
	const localWasm = options?.wasmLoaderPath ?? DEFAULT_LOCAL_WASM_PATH;
	const localModel = options?.modelAssetPath ?? DEFAULT_LOCAL_MODEL_PATH;

	if (preferLocal) {
		try {
			const landmarker = await instantiateLandmarker(localWasm, localModel);
			return createLandmarkerWrapper(landmarker);
		} catch {
			// Les assets locaux sont indisponibles ; bascule automatique sur les CDN officiels
		}
	}

	const remoteWasm = options?.wasmLoaderPath ?? DEFAULT_REMOTE_WASM_PATH;
	const remoteModel = options?.modelAssetPath ?? DEFAULT_REMOTE_MODEL_PATH;
	const landmarker = await instantiateLandmarker(remoteWasm, remoteModel);
	return createLandmarkerWrapper(landmarker);
}
