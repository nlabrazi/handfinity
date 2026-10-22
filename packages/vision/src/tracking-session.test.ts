import type { HandObservation } from "@handfinity/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startCamera, stopCamera } from "./camera";
import { createHandTracker, type HandTracker } from "./hand-tracker";
import {
	createTrackingSession,
	type TrackingCallbacks,
} from "./tracking-session";

vi.mock("./camera", () => ({ startCamera: vi.fn(), stopCamera: vi.fn() }));
vi.mock("./hand-tracker", () => ({ createHandTracker: vi.fn() }));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function observation(timestamp: number, x = 0.3): HandObservation {
	const landmarks = Array.from({ length: 21 }, () => ({ x, y: 0.3, z: 0 }));
	landmarks[0] = { x, y: 0.7, z: 0 };
	landmarks[9] = { x, y: 0.5, z: 0 };
	return {
		landmarks,
		timestamp,
		handedness: "unknown",
		handednessConfidence: null,
	};
}

function resources() {
	return {
		stream: {} as MediaStream,
		tracker: {
			detect: vi.fn<HandTracker["detect"]>().mockReturnValue([]),
			close: vi.fn(),
		},
	};
}

function setup() {
	let now = 0;
	let frameId = 0;
	const queued = new Map<number, FrameRequestCallback>();
	vi.spyOn(performance, "now").mockImplementation(() => now);
	vi.stubGlobal(
		"requestAnimationFrame",
		vi.fn((callback: FrameRequestCallback) => {
			queued.set(++frameId, callback);
			return frameId;
		}),
	);
	vi.stubGlobal(
		"cancelAnimationFrame",
		vi.fn((id: number) => queued.delete(id)),
	);
	const first = resources();
	vi.mocked(startCamera).mockImplementation(async (video) => {
		video.srcObject = first.stream;
		return first.stream;
	});
	vi.mocked(createHandTracker).mockResolvedValue(first.tracker);
	const video = {
		readyState: 2,
		currentTime: 0,
		videoWidth: 1280,
		videoHeight: 720,
		srcObject: null,
	} as unknown as HTMLVideoElement;
	const callbacks = {
		onFrame: vi.fn<TrackingCallbacks["onFrame"]>(),
		onStop: vi.fn(),
		onError: vi.fn(),
	};
	const session = createTrackingSession(callbacks);

	function frame(timestamp: number, fresh = true) {
		now = timestamp;
		if (fresh) video.currentTime += 1;
		const pending = [...queued.values()];
		queued.clear();
		for (const callback of pending) callback(timestamp);
	}

	function replaceResources(next = resources()) {
		vi.mocked(startCamera).mockImplementationOnce(async (element) => {
			element.srcObject = next.stream;
			return next.stream;
		});
		vi.mocked(createHandTracker).mockResolvedValueOnce(next.tracker);
		return next;
	}

	return {
		session,
		callbacks,
		video,
		frame,
		queued,
		replaceResources,
		...first,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

describe("Shared tracking session", () => {
	it("starts only on request and processes each video image once", async () => {
		const { session, video, frame, callbacks, tracker } = setup();
		expect(startCamera).not.toHaveBeenCalled();
		await session.start(video);
		tracker.detect.mockReturnValue([observation(0), observation(0, 0.8)]);
		frame(0);
		expect(callbacks.onFrame.mock.lastCall?.[0]).toMatchObject({
			hasNewFrame: true,
			aspectRatio: 1280 / 720,
			tracking: { timestamp: 0, hands: [{ id: 1 }, { id: 2 }] },
		});
		frame(16, false);
		expect(tracker.detect).toHaveBeenCalledExactlyOnceWith(video, 0);
		expect(callbacks.onFrame.mock.lastCall?.[0]).toMatchObject({
			hasNewFrame: false,
			observations: [],
		});
	});

	it("waits for a playable image before invoking the detector", async () => {
		const { session, video, frame, tracker, callbacks } = setup();
		Object.defineProperty(video, "readyState", { value: 1 });
		await session.start(video);
		frame(0);
		expect(tracker.detect).not.toHaveBeenCalled();
		expect(callbacks.onFrame.mock.lastCall?.[0].hasNewFrame).toBe(false);
	});

	it("expires identities when the video stops supplying images", async () => {
		const { session, video, frame, tracker, callbacks } = setup();
		await session.start(video);
		tracker.detect.mockReturnValue([observation(0)]);
		frame(0);
		frame(121, false);
		expect(callbacks.onFrame.mock.lastCall?.[0]).toMatchObject({
			hasNewFrame: false,
			tracking: {
				hands: [],
				events: [{ type: "hand:lost", handId: 1, reason: "timeout" }],
			},
		});
		expect(tracker.detect).toHaveBeenCalledOnce();
	});

	it("releases resources once and ignores an already queued callback after stop", async () => {
		const { session, video, callbacks, queued, stream, tracker } = setup();
		await session.start(video);
		const staleTick = [...queued.values()][0];
		session.stop();
		session.stop();
		staleTick?.(40);
		expect(stopCamera).toHaveBeenCalledExactlyOnceWith(stream);
		expect(tracker.close).toHaveBeenCalledOnce();
		expect(callbacks.onStop).toHaveBeenCalledOnce();
		expect(callbacks.onFrame).not.toHaveBeenCalled();
		expect(video.srcObject).toBeNull();
		expect(queued.size).toBe(0);
	});

	it("restarts with fresh resources and fresh identities while ignoring old callbacks", async () => {
		const {
			session,
			video,
			callbacks,
			frame,
			queued,
			tracker,
			replaceResources,
		} = setup();
		await session.start(video);
		tracker.detect.mockReturnValue([observation(0)]);
		frame(0);
		const staleTick = [...queued.values()][0];
		const replacement = replaceResources();
		await session.start(video);
		expect(tracker.close).toHaveBeenCalledOnce();
		callbacks.onFrame.mockClear();
		staleTick?.(40);
		expect(callbacks.onFrame).not.toHaveBeenCalled();
		replacement.tracker.detect.mockReturnValue([observation(80)]);
		frame(80);
		expect(callbacks.onFrame.mock.lastCall?.[0].tracking.hands[0]?.id).toBe(2);
		expect(queued.size).toBe(1);
	});

	it("keeps independently created project sessions isolated", async () => {
		const { session, video, stream, frame, replaceResources } = setup();
		await session.start(video);
		const other = replaceResources();
		const onFrame = vi.fn();
		const second = createTrackingSession({ onFrame });
		const secondVideo = { ...video, srcObject: null } as HTMLVideoElement;
		await second.start(secondVideo);
		session.stop();
		expect(stopCamera).toHaveBeenCalledExactlyOnceWith(stream);
		expect(other.tracker.close).not.toHaveBeenCalled();
		frame(40);
		expect(onFrame).toHaveBeenCalledOnce();
		expect(secondVideo.srcObject).toBe(other.stream);
		second.stop();
	});

	it("rejects a camera error without creating a detector", async () => {
		const { session, video, callbacks } = setup();
		vi.mocked(startCamera).mockRejectedValueOnce(
			new Error("Permission denied"),
		);
		await expect(session.start(video)).rejects.toThrow("Permission denied");
		expect(createHandTracker).not.toHaveBeenCalled();
		expect(callbacks.onStop).toHaveBeenCalledOnce();
		expect(callbacks.onError).not.toHaveBeenCalled();
	});

	it("releases the camera when detector initialization fails", async () => {
		const { session, video, stream, callbacks } = setup();
		vi.mocked(createHandTracker).mockRejectedValueOnce(
			new Error("Model unavailable"),
		);
		await expect(session.start(video)).rejects.toThrow("Model unavailable");
		expect(stopCamera).toHaveBeenCalledExactlyOnceWith(stream);
		expect(video.srcObject).toBeNull();
		expect(callbacks.onStop).toHaveBeenCalledOnce();
	});

	it("stops a camera that arrives after cancellation without initializing the detector", async () => {
		const { session, video, stream, callbacks, queued } = setup();
		const acquisition = deferred<MediaStream>();
		vi.mocked(startCamera).mockReturnValueOnce(acquisition.promise);
		const starting = session.start(video);
		session.stop();
		acquisition.resolve(stream);
		await expect(starting).rejects.toMatchObject({ name: "AbortError" });
		expect(stopCamera).toHaveBeenCalledExactlyOnceWith(stream);
		expect(createHandTracker).not.toHaveBeenCalled();
		expect(callbacks.onStop).toHaveBeenCalledOnce();
		expect(queued.size).toBe(0);
	});

	it("releases the camera immediately while the model is loading and closes the late detector", async () => {
		const { session, video, stream, tracker, callbacks, queued } = setup();
		const model = deferred<HandTracker>();
		vi.mocked(createHandTracker).mockReturnValueOnce(model.promise);
		const starting = session.start(video);
		await Promise.resolve();
		expect(createHandTracker).toHaveBeenCalledOnce();
		session.stop();
		expect(stopCamera).toHaveBeenCalledExactlyOnceWith(stream);
		expect(video.srcObject).toBeNull();
		model.resolve(tracker);
		await expect(starting).rejects.toMatchObject({ name: "AbortError" });
		expect(tracker.close).toHaveBeenCalledOnce();
		expect(callbacks.onStop).toHaveBeenCalledOnce();
		expect(queued.size).toBe(0);
	});

	it("does not let an old initialization failure stop a replacement session", async () => {
		const { session, video, replaceResources, callbacks, queued } = setup();
		const model = deferred<HandTracker>();
		vi.mocked(createHandTracker).mockReturnValueOnce(model.promise);
		const oldStart = session.start(video);
		await Promise.resolve();
		const replacement = replaceResources();
		await session.start(video);
		model.reject(new Error("Old model failed"));
		await expect(oldStart).rejects.toThrow("Old model failed");
		expect(replacement.tracker.close).not.toHaveBeenCalled();
		expect(video.srcObject).toBe(replacement.stream);
		expect(callbacks.onError).not.toHaveBeenCalled();
		expect(queued.size).toBe(1);
	});

	it("does not detach a replacement stream when an old acquisition completes", async () => {
		const { session, video, stream, replaceResources, queued } = setup();
		const acquisition = deferred<MediaStream>();
		vi.mocked(startCamera).mockReturnValueOnce(acquisition.promise);
		const oldStart = session.start(video);
		const replacement = replaceResources();
		await session.start(video);
		acquisition.resolve(stream);
		await expect(oldStart).rejects.toMatchObject({ name: "AbortError" });
		expect(video.srcObject).toBe(replacement.stream);
		expect(stopCamera).toHaveBeenCalledExactlyOnceWith(stream);
		expect(replacement.tracker.close).not.toHaveBeenCalled();
		expect(queued.size).toBe(1);
	});

	it.each(["detector", "consumer"])(
		"cleans up and reports a %s failure once",
		async (origin) => {
			const { session, video, frame, callbacks, tracker, stream, queued } =
				setup();
			const failure = new Error("Frame failed");
			await session.start(video);
			const fail = () => {
				throw failure;
			};
			if (origin === "detector") tracker.detect.mockImplementationOnce(fail);
			else callbacks.onFrame.mockImplementationOnce(fail);
			frame(0);
			expect(stopCamera).toHaveBeenCalledExactlyOnceWith(stream);
			expect(tracker.close).toHaveBeenCalledOnce();
			expect(callbacks.onStop).toHaveBeenCalledOnce();
			expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(failure);
			expect(queued.size).toBe(0);
		},
	);

	it("does not reschedule when the consumer stops the session inside a frame", async () => {
		const { session, video, frame, callbacks, queued } = setup();
		callbacks.onFrame.mockImplementationOnce(() => session.stop());
		await session.start(video);
		frame(0);
		expect(queued.size).toBe(0);
		expect(callbacks.onError).not.toHaveBeenCalled();
	});

	it("releases the camera even if detector cleanup throws", async () => {
		const { session, video, tracker, stream, callbacks } = setup();
		await session.start(video);
		tracker.close.mockImplementationOnce(() => {
			throw new Error("Close failed");
		});
		expect(() => session.stop()).toThrow("Close failed");
		expect(stopCamera).toHaveBeenCalledExactlyOnceWith(stream);
		expect(video.srcObject).toBeNull();
		expect(callbacks.onStop).toHaveBeenCalledOnce();
		session.stop();
		expect(tracker.close).toHaveBeenCalledOnce();
	});
});
