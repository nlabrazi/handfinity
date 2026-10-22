import { afterEach, describe, expect, it, vi } from "vitest";
import type { HandPoint } from "@handfinity/core";
import { startCamera, stopCamera } from "./camera";
import { createHandTracker, type HandTracker } from "./hand-tracker";
import { startPinchSession, type PinchCallbacks } from "./pinch-session";

vi.mock("./camera", () => ({ startCamera: vi.fn(), stopCamera: vi.fn() }));
vi.mock("./hand-tracker", () => ({ createHandTracker: vi.fn() }));

function hand(offset = 0): HandPoint[] {
	const points = Array.from({ length: 21 }, () => ({
		x: 0.5 + offset,
		y: 0.4,
		z: 0,
	}));
	points[0] = { x: 0.5 + offset, y: 0.85, z: 0 };
	points[9] = { x: 0.5 + offset, y: 0.6, z: 0 };
	points[8] = { x: 0.54 + offset, y: 0.4, z: 0 };
	return points;
}

async function setup() {
	let now = 0;
	let nextFrame: FrameRequestCallback | undefined;
	let frameId = 0;
	vi.spyOn(performance, "now").mockImplementation(() => now);
	vi.stubGlobal(
		"requestAnimationFrame",
		vi.fn((callback: FrameRequestCallback) => {
			nextFrame = callback;
			return ++frameId;
		}),
	);
	vi.stubGlobal("cancelAnimationFrame", vi.fn());
	const stream = {} as MediaStream;
	const video = {
		readyState: 2,
		currentTime: 0,
		videoWidth: 1280,
		videoHeight: 720,
		srcObject: stream,
	} as HTMLVideoElement;
	const tracker = { detect: vi.fn<HandTracker["detect"]>(), close: vi.fn() };
	vi.mocked(startCamera).mockResolvedValue(stream);
	vi.mocked(createHandTracker).mockResolvedValue(tracker);
	const callbacks = {
		onGesture: vi.fn<PinchCallbacks["onGesture"]>(),
		onPointer: vi.fn(),
		onError: vi.fn(),
	};
	const session = await startPinchSession(video, callbacks);

	function frame(
		timestamp: number,
		hands: HandPoint[][] = [hand()],
		fresh = true,
	) {
		now = timestamp;
		if (fresh) video.currentTime = timestamp / 1000 + 1;
		tracker.detect.mockReturnValue(
			hands.map((landmarks) => ({
				landmarks,
				handedness: "unknown",
				handednessConfidence: null,
				timestamp,
			})),
		);
		const callback = nextFrame;
		nextFrame = undefined;
		callback?.(timestamp);
	}

	function start() {
		frame(0);
		frame(40);
		expect(callbacks.onGesture).toHaveBeenLastCalledWith(
			expect.objectContaining({ type: "pinch:start" }),
		);
		callbacks.onGesture.mockClear();
	}

	return { frame, start, callbacks, session, video, stream, tracker };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe("Pinch session", () => {
	it("continues a stroke after a brief loss near the previous position", async () => {
		const { start, frame, callbacks } = await setup();
		start();
		frame(70, []);
		expect(callbacks.onGesture).not.toHaveBeenCalled();
		expect(callbacks.onPointer).toHaveBeenLastCalledWith(null, 70);
		frame(100, [hand(0.01)]);
		expect(callbacks.onGesture).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ type: "pinch:move" }),
		);
	});

	it("ends the old stroke before accepting a distant reappearance", async () => {
		const { start, frame, callbacks } = await setup();
		start();
		frame(70, []);
		frame(100, [hand(0.3)]);
		expect(callbacks.onGesture).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ type: "pinch:end", reason: "tracking-lost" }),
		);
		frame(140, [hand(0.3)]);
		expect(callbacks.onGesture).toHaveBeenLastCalledWith(
			expect.objectContaining({ type: "pinch:start" }),
		);
	});

	it("ends the old stroke on an identity change without an intervening empty frame", async () => {
		const { start, frame, callbacks } = await setup();
		start();
		frame(80, [hand(0.3)]);
		expect(callbacks.onGesture).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ type: "pinch:end", reason: "tracking-lost" }),
		);
		frame(120, [hand(0.3)]);
		expect(callbacks.onGesture).toHaveBeenLastCalledWith(
			expect.objectContaining({ type: "pinch:start" }),
		);
		const restarted = callbacks.onGesture.mock.lastCall?.[0];
		expect(restarted?.position.x).toBeCloseTo(0.84);
		expect(restarted?.position.y).toBe(0.4);
		expect(
			callbacks.onGesture.mock.calls.some(
				([event]) => event.type === "pinch:move",
			),
		).toBe(false);
	});

	it("does not confirm a pinch using observations from two different identities", async () => {
		const { frame, callbacks } = await setup();
		frame(0);
		frame(40, [hand(0.3)]);
		expect(callbacks.onGesture).not.toHaveBeenCalled();
		frame(80, [hand(0.3)]);
		expect(callbacks.onGesture).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ type: "pinch:start" }),
		);
	});

	it("suspends a stroke on invalid landmarks and ends it when tracking expires", async () => {
		const { start, frame, callbacks } = await setup();
		start();
		frame(80, [hand(Number.NaN)]);
		expect(callbacks.onGesture).not.toHaveBeenCalled();
		expect(callbacks.onPointer).toHaveBeenLastCalledWith(null, 80);
		frame(161, [hand(Number.NaN)]);
		expect(callbacks.onGesture).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ type: "pinch:end", reason: "tracking-lost" }),
		);
	});

	it("ends immediately when two hands make the tracking ambiguous", async () => {
		const { start, frame, callbacks } = await setup();
		start();
		frame(70, [hand(), hand(0.3)]);
		expect(callbacks.onGesture).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ type: "pinch:end", reason: "tracking-lost" }),
		);
		frame(100, [hand(0.3)]);
		expect(callbacks.onGesture).toHaveBeenCalledTimes(1);
	});

	it("expires tracking by elapsed time even when the video freezes", async () => {
		const { start, frame, callbacks, tracker } = await setup();
		start();
		frame(100, [], false);
		expect(callbacks.onGesture).not.toHaveBeenCalled();
		frame(161, [], false);
		expect(callbacks.onGesture).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ type: "pinch:end", reason: "tracking-lost" }),
		);
		frame(200, [], false);
		expect(callbacks.onGesture).toHaveBeenCalledTimes(1);
		expect(tracker.detect).toHaveBeenCalledTimes(2);
	});

	it("does not bridge a long gap without an intervening missing-hand frame", async () => {
		const { start, frame, callbacks } = await setup();
		start();
		frame(200, [hand(0.3)]);
		expect(callbacks.onGesture).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ type: "pinch:end", reason: "tracking-lost" }),
		);
	});

	it("does not count an occlusion as confirmation of a new pinch", async () => {
		const { frame, callbacks } = await setup();
		frame(0);
		frame(20, []);
		frame(60);
		expect(callbacks.onGesture).not.toHaveBeenCalled();
		frame(100);
		expect(callbacks.onGesture).toHaveBeenLastCalledWith(
			expect.objectContaining({ type: "pinch:start" }),
		);
	});

	it("keeps the cursor timestamp aligned with each gesture sample", async () => {
		const { start, frame, callbacks } = await setup();
		start();
		frame(80, [hand(0.01)]);
		const gesture = callbacks.onGesture.mock.calls[0]?.[0];
		expect(gesture?.timestamp).toBe(80);
		expect(callbacks.onPointer).toHaveBeenLastCalledWith(gesture?.position, 80);
	});

	it("releases resources once and stops producing events", async () => {
		const { start, frame, callbacks, session, tracker, stream, video } =
			await setup();
		start();
		session.stop();
		session.stop();
		frame(80);
		expect(tracker.close).toHaveBeenCalledOnce();
		expect(stopCamera).toHaveBeenCalledExactlyOnceWith(stream);
		expect(video.srcObject).toBeNull();
		expect(callbacks.onGesture).not.toHaveBeenCalled();
	});

	it("stops the camera and reports detection failures", async () => {
		const { frame, callbacks, tracker, stream } = await setup();
		const error = new Error("Tracking failed");
		tracker.detect.mockImplementationOnce(() => {
			throw error;
		});
		frame(0);
		expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(error);
		expect(stopCamera).toHaveBeenCalledExactlyOnceWith(stream);
		expect(tracker.close).toHaveBeenCalledOnce();
	});
});
