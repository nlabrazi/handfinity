import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, shallowRef, type EffectScope } from "vue";
import { startPinchSession, type PinchSession } from "@handfinity/vision";
import { usePaint } from "./usePaint";

vi.mock("@handfinity/vision", () => ({ startPinchSession: vi.fn() }));

const scopes: EffectScope[] = [];

function createCanvas() {
	const canvas = { width: 300, height: 150, getContext: () => context };
	const context = {
		canvas,
		clearRect: vi.fn(),
		beginPath: vi.fn(),
		arc: vi.fn(),
		fill: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		stroke: vi.fn(),
		quadraticCurveTo: vi.fn(),
	};
	return canvas as unknown as HTMLCanvasElement;
}

function setup() {
	const scope = effectScope();
	scopes.push(scope);
	const elements = {
		videoRef: shallowRef({
			videoWidth: 1280,
			videoHeight: 720,
		} as HTMLVideoElement),
		canvasRef: shallowRef(createCanvas()),
		previewCanvasRef: shallowRef(createCanvas()),
	};
	const paint = scope.run(() => usePaint(elements));
	if (!paint) throw new Error("Paint scope was not created");
	return { paint, scope, ...elements };
}

function pendingSession() {
	let resolve!: (session: PinchSession) => void;
	const promise = new Promise<PinchSession>((done) => {
		resolve = done;
	});
	vi.mocked(startPinchSession).mockReturnValueOnce(promise);
	return resolve;
}

beforeEach(() => {
	vi.mocked(startPinchSession).mockReset();
});

afterEach(() => {
	for (const scope of scopes.splice(0)) scope.stop();
});

describe("Paint session lifecycle", () => {
	it("starts only one session when requested twice during initialization", async () => {
		const resolve = pendingSession();
		const { paint, canvasRef, previewCanvasRef } = setup();
		const starting = paint.toggleCamera();
		await paint.toggleCamera();
		expect(startPinchSession).toHaveBeenCalledOnce();
		expect(paint.isLoading.value).toBe(true);
		resolve({ stop: vi.fn() });
		await starting;
		expect(paint.isLoading.value).toBe(false);
		expect(paint.isRunning.value).toBe(true);
		expect(canvasRef.value.width).toBe(1280);
		expect(previewCanvasRef.value.height).toBe(720);
	});

	it("closes a session that finishes initializing after disposal", async () => {
		const resolve = pendingSession();
		const { paint, scope } = setup();
		const starting = paint.toggleCamera();
		scope.stop();
		const stop = vi.fn();
		resolve({ stop });
		await starting;
		expect(stop).toHaveBeenCalledOnce();
		expect(paint.isRunning.value).toBe(false);
		expect(paint.isLoading.value).toBe(false);
		await paint.toggleCamera();
		expect(startPinchSession).toHaveBeenCalledOnce();
	});

	it("commits the active stroke when stopping and preserves it across a restart", async () => {
		const stop = vi.fn();
		vi.mocked(startPinchSession).mockResolvedValue({ stop });
		const { paint, scope } = setup();
		await paint.toggleCamera();
		const callbacks = vi.mocked(startPinchSession).mock.calls[0]?.[1];
		if (!callbacks) throw new Error("Missing session callbacks");
		callbacks.onPointer?.({ x: 0.5, y: 0.4 }, 0);
		callbacks.onGesture({
			type: "pinch:start",
			position: { x: 0.5, y: 0.4 },
			ratio: 0.2,
			timestamp: 40,
		});
		expect(paint.gestureFeedback.value.state).toBe("drawing");
		expect(paint.canUndo.value).toBe(false);
		await paint.toggleCamera();
		expect(stop).toHaveBeenCalledOnce();
		expect(paint.activeStroke.value).toBeNull();
		expect(paint.pointer.value).toBeNull();
		expect(paint.canUndo.value).toBe(true);
		await paint.toggleCamera();
		expect(paint.canUndo.value).toBe(true);
		expect(paint.gestureFeedback.value.label).toBe("Show one hand");
		scope.stop();
		expect(stop).toHaveBeenCalledTimes(2);
	});

	it("stops on a tracking error and allows a fresh session", async () => {
		const stop = vi.fn();
		vi.mocked(startPinchSession).mockResolvedValue({ stop });
		const { paint } = setup();
		await paint.toggleCamera();
		const callbacks = vi.mocked(startPinchSession).mock.calls[0]?.[1];
		if (!callbacks) throw new Error("Missing session callbacks");
		callbacks.onPointer?.({ x: 0.5, y: 0.4 }, 0);
		callbacks.onError?.(new Error("Tracking failed"));
		expect(stop).toHaveBeenCalledOnce();
		expect(paint.isRunning.value).toBe(false);
		expect(paint.pointer.value).toBeNull();
		expect(paint.gestureFeedback.value.state).toBe("error");
		await paint.toggleCamera();
		expect(paint.error.value).toBe("");
		expect(paint.isRunning.value).toBe(true);
		expect(paint.gestureFeedback.value.label).toBe("Show one hand");
	});

	it("recovers from camera initialization failure without keeping the loading state", async () => {
		vi.mocked(startPinchSession).mockRejectedValueOnce(
			new Error("Camera unavailable"),
		);
		const { paint } = setup();
		await paint.toggleCamera();
		expect(paint.isLoading.value).toBe(false);
		expect(paint.isRunning.value).toBe(false);
		expect(paint.error.value).toBe("Camera unavailable");
		vi.mocked(startPinchSession).mockResolvedValueOnce({ stop: vi.fn() });
		await paint.toggleCamera();
		expect(paint.isRunning.value).toBe(true);
		expect(paint.error.value).toBe("");
	});
});
