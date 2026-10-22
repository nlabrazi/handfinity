import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, onDeactivated, shallowRef, type EffectScope } from "vue";
import { createPinchSession, type TrackingSession } from "@handfinity/vision";
import { usePaint } from "./usePaint";

vi.mock("@handfinity/vision", async (importOriginal) => ({
	...(await importOriginal<typeof import("@handfinity/vision")>()),
	createPinchSession: vi.fn(),
}));

vi.mock("vue", async (importOriginal) => ({
	...(await importOriginal<typeof import("vue")>()),
	getCurrentInstance: () => ({}),
	onDeactivated: vi.fn(),
}));

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
	const session = {
		start: vi.fn<TrackingSession["start"]>().mockResolvedValue(undefined),
		stop: vi.fn(),
	};
	vi.mocked(createPinchSession).mockReturnValueOnce(session);
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
	const deactivate = vi.mocked(onDeactivated).mock.lastCall?.[0];
	if (!deactivate) throw new Error("Missing deactivation callback");
	return { paint, scope, session, deactivate, ...elements };
}

function pendingStart() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(createPinchSession).mockReset();
});

afterEach(() => {
	for (const scope of scopes.splice(0)) scope.stop();
});

describe("Paint session lifecycle", () => {
	it("starts only one session when requested twice during initialization", async () => {
		const { paint, session, canvasRef, previewCanvasRef } = setup();
		const pending = pendingStart();
		session.start.mockReturnValueOnce(pending.promise);
		const starting = paint.toggleCamera();
		await paint.toggleCamera();
		expect(session.start).toHaveBeenCalledOnce();
		expect(paint.isLoading.value).toBe(true);
		pending.resolve();
		await starting;
		expect(paint.isLoading.value).toBe(false);
		expect(paint.isRunning.value).toBe(true);
		expect(canvasRef.value.width).toBe(1280);
		expect(previewCanvasRef.value.height).toBe(720);
	});

	it("stops a pending initialization immediately on disposal and ignores its late completion", async () => {
		const { paint, scope, session } = setup();
		const pending = pendingStart();
		session.start.mockReturnValueOnce(pending.promise);
		const starting = paint.toggleCamera();
		scope.stop();
		expect(session.stop).toHaveBeenCalledOnce();
		expect(paint.isLoading.value).toBe(false);
		pending.resolve();
		await starting;
		expect(paint.isRunning.value).toBe(false);
		expect(paint.error.value).toBe("");
		await paint.toggleCamera();
		expect(session.start).toHaveBeenCalledOnce();
	});

	it("commits the active stroke when stopping and preserves it across a restart", async () => {
		const { paint, scope, session } = setup();
		const stop = session.stop;
		await paint.toggleCamera();
		const callbacks = vi.mocked(createPinchSession).mock.calls[0]?.[0];
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
		const { paint, session } = setup();
		const stop = session.stop;
		await paint.toggleCamera();
		const callbacks = vi.mocked(createPinchSession).mock.calls[0]?.[0];
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
		const { paint, session } = setup();
		session.start.mockRejectedValueOnce(new Error("Camera unavailable"));
		await paint.toggleCamera();
		expect(paint.isLoading.value).toBe(false);
		expect(paint.isRunning.value).toBe(false);
		expect(paint.error.value).toBe("Camera unavailable");
		await paint.toggleCamera();
		expect(paint.isRunning.value).toBe(true);
		expect(paint.error.value).toBe("");
	});

	it("ignores an old failure after deactivation while a new initialization is pending", async () => {
		const { paint, session, deactivate } = setup();
		const oldPending = pendingStart();
		const newPending = pendingStart();
		session.start
			.mockReturnValueOnce(oldPending.promise)
			.mockReturnValueOnce(newPending.promise);
		const oldStart = paint.toggleCamera();
		deactivate();
		expect(session.stop).toHaveBeenCalledOnce();
		expect(paint.isLoading.value).toBe(false);
		const newStart = paint.toggleCamera();
		oldPending.reject(new Error("Old camera failed"));
		await oldStart;
		expect(paint.error.value).toBe("");
		expect(paint.isLoading.value).toBe(true);
		expect(session.stop).toHaveBeenCalledOnce();
		newPending.resolve();
		await newStart;
		expect(paint.isRunning.value).toBe(true);
		expect(paint.isLoading.value).toBe(false);
		expect(createPinchSession).toHaveBeenCalledOnce();
	});

	it("ignores a late successful initialization after deactivation and restart", async () => {
		const { paint, session, deactivate } = setup();
		const oldPending = pendingStart();
		session.start.mockReturnValueOnce(oldPending.promise);
		const oldStart = paint.toggleCamera();
		deactivate();
		await paint.toggleCamera();
		oldPending.resolve();
		await oldStart;
		expect(paint.isRunning.value).toBe(true);
		expect(paint.error.value).toBe("");
		expect(session.stop).toHaveBeenCalledOnce();
	});
});
