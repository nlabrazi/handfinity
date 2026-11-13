import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDest = join(root, "public/mediapipe/wasm");
const modelDir = join(root, "public/mediapipe/models");
const modelDest = join(modelDir, "hand_landmarker.task");
const modelUrl =
	"https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

console.log("[setup:assets] Preparing offline MediaPipe assets...");

if (existsSync(wasmSrc)) {
	mkdirSync(wasmDest, { recursive: true });
	cpSync(wasmSrc, wasmDest, { recursive: true });
	console.log(`[setup:assets] Copied WASM binaries to ${wasmDest}`);
} else {
	console.warn(
		`[setup:assets] Warning: ${wasmSrc} not found. Run npm install first.`,
	);
}

if (!existsSync(modelDest)) {
	mkdirSync(modelDir, { recursive: true });
	console.log(`[setup:assets] Downloading model from ${modelUrl}...`);
	const res = await fetch(modelUrl);
	if (!res.ok) {
		throw new Error(`Failed to download model: ${res.statusText}`);
	}
	const buffer = Buffer.from(await res.arrayBuffer());
	writeFileSync(modelDest, buffer);
	console.log(
		`[setup:assets] Saved model to ${modelDest} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`,
	);
} else {
	console.log(`[setup:assets] Model already present at ${modelDest}`);
}

console.log("[setup:assets] Offline MediaPipe assets ready.");
