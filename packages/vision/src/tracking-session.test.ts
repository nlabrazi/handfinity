import type { HandObservation } from "@handfinity/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startCamera, stopCamera } from "./camera";
import { createHandTracker, type HandTracker } from "./hand-tracker";
import {
	createTrackingSession,
	type TrackingCallbacks,
	type TrackingSessionOptions,
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

function setupSession(
	scheduling?: TrackingSessionOptions["scheduling"],
	hasVideoQuality = true,
) {
	let now = 0;
	let frameId = 0;
	let videoFrameCount = 0;
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
	vi.stubGlobal("window", {
		setTimeout: vi.fn((callback: FrameRequestCallback, _delay: number) => {
			queued.set(++frameId, callback);
			return frameId;
		}),
		clearTimeout: vi.fn((id: number) => queued.delete(id)),
	});
	const first = resources();
	vi.mocked(startCamera).mockImplementation(async (video) => {
		video.srcObject = first.stream;
		return first.stream;
	});
	vi.mocked(createHandTracker).mockResolvedValue(first.tracker);
	const video = {
		readyState: 2,
		paused: false,
		currentTime: 0,
		getVideoPlaybackQuality: hasVideoQuality
			? () => ({ totalVideoFrames: videoFrameCount })
			: undefined,
		videoWidth: 1280,
		videoHeight: 720,
		srcObject: null,
	} as unknown as HTMLVideoElement;
	const callbacks = {
		onFrame: vi.fn<TrackingCallbacks["onFrame"]>(),
		onStop: vi.fn(),
		onError: vi.fn(),
	};
	const session = scheduling
		? createTrackingSession(callbacks, { scheduling })
		: createTrackingSession(callbacks);

	function frame(timestamp: number, fresh = true) {
		now = timestamp;
		if (fresh) {
			video.currentTime += 1;
			videoFrameCount += 1;
		}
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
		setVideoFrameCount: (value: number) => {
			videoFrameCount = value;
		},
		advanceTime: (elapsed: number) => {
			now += elapsed;
		},
		replaceResources,
		...first,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.resetAllMocks();
});

it("uses animation frames by default when no scheduling option is provided", async () => {
	const { session, video } = setupSession();
	await session.start(video);
	expect(requestAnimationFrame).toHaveBeenCalledOnce();
	expect(window.setTimeout).not.toHaveBeenCalled();
	session.stop();
});

describe.each(["animation-frame", "timer"] as const)(
	"Shared tracking session (%s)",
	(scheduling) => {
		const setup = (hasVideoQuality = true) =>
			setupSession(scheduling, hasVideoQuality);

		it("uses only the selected scheduler and cancels its pending work", async () => {
			const { session, video, queued } = setup();
			await session.start(video);
			if (scheduling === "timer") {
				expect(window.setTimeout).toHaveBeenCalledExactlyOnceWith(
					expect.any(Function),
					1000 / 30,
				);
				expect(requestAnimationFrame).not.toHaveBeenCalled();
			} else {
				expect(requestAnimationFrame).toHaveBeenCalledOnce();
				expect(window.setTimeout).not.toHaveBeenCalled();
			}
			expect(queued.size).toBe(1);
			session.stop();
			const cancel =
				scheduling === "timer" ? window.clearTimeout : cancelAnimationFrame;
			expect(cancel).toHaveBeenCalledExactlyOnceWith(1);
			expect(queued.size).toBe(0);
		});

		it.each([10, 50])(
			"accounts for %s ms of processing without overlapping or accumulating catch-up work",
			async (processingTime) => {
				const {
					session,
					video,
					frame,
					tracker,
					callbacks,
					queued,
					advanceTime,
				} = setup();
				await session.start(video);
				tracker.detect.mockImplementationOnce(() => {
					expect(queued.size).toBe(0);
					advanceTime(6);
					return [];
				});
				callbacks.onFrame.mockImplementationOnce(() => {
					expect(queued.size).toBe(0);
					advanceTime(processingTime - 6);
				});
				frame(100);
				expect(tracker.detect).toHaveBeenCalledExactlyOnceWith(video, 100);
				expect(queued.size).toBe(1);
				if (scheduling === "timer") {
					expect(vi.mocked(window.setTimeout).mock.lastCall?.[1]).toBeCloseTo(
						Math.max(0, 1000 / 30 - processingTime),
					);
					expect(requestAnimationFrame).not.toHaveBeenCalled();
				} else {
					expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
					expect(window.setTimeout).not.toHaveBeenCalled();
				}
				// Le prochain budget repart de son propre tick, sans dette du précédent.
				frame(100 + processingTime);
				expect(tracker.detect).toHaveBeenCalledTimes(2);
				expect(queued.size).toBe(1);
				if (scheduling === "timer") {
					expect(vi.mocked(window.setTimeout).mock.lastCall?.[1]).toBeCloseTo(
						1000 / 30,
					);
				}
				session.stop();
				expect(queued.size).toBe(0);
			},
		);

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

		it("does not replay images when playback time advances but the video frame count is frozen", async () => {
			const { session, video, frame, tracker, callbacks } = setup();
			await session.start(video);
			tracker.detect.mockReturnValue([observation(0)]);
			frame(0);
			video.currentTime += 1;
			frame(121, false);
			expect(tracker.detect).toHaveBeenCalledExactlyOnceWith(video, 0);
			expect(callbacks.onFrame.mock.lastCall?.[0]).toMatchObject({
				hasNewFrame: false,
				observations: [],
				tracking: {
					hands: [],
					events: [{ type: "hand:lost", handId: 1, reason: "timeout" }],
				},
			});
		});

		it("processes a changed frame count even when playback time stays the same", async () => {
			const { session, video, frame, tracker, setVideoFrameCount } = setup();
			await session.start(video);
			frame(0);
			setVideoFrameCount(2);
			frame(40, false);
			expect(video.currentTime).toBe(1);
			expect(tracker.detect).toHaveBeenCalledTimes(2);
			expect(tracker.detect.mock.lastCall).toEqual([video, 40]);
		});

		it("processes a 20 Hz video only once per received frame when polled at 30 Hz", async () => {
			const { session, video, frame, tracker, setVideoFrameCount } = setup();
			await session.start(video);
			for (const timestamp of [0, 33, 66, 100, 133, 166, 200, 233, 266, 300]) {
				video.currentTime = timestamp / 1000;
				setVideoFrameCount(1 + Math.floor(timestamp / 50));
				frame(timestamp, false);
			}
			expect(tracker.detect.mock.calls.map((call) => call[1])).toEqual([
				0, 66, 100, 166, 200, 266, 300,
			]);
		});

		it("uses playback time as a compatibility fallback when video quality is unavailable", async () => {
			const { session, video, frame, tracker, callbacks } = setup(false);
			await session.start(video);
			frame(0);
			frame(16, false);
			expect(tracker.detect).toHaveBeenCalledExactlyOnceWith(video, 0);
			expect(callbacks.onFrame.mock.lastCall?.[0].hasNewFrame).toBe(false);
			frame(40);
			expect(tracker.detect.mock.lastCall).toEqual([video, 40]);
		});

		it("keeps the playback time fallback when an exposed frame counter has never been positive", async () => {
			const { session, video, frame, tracker, callbacks } = setup();
			await session.start(video);
			frame(0, false);
			video.currentTime = 0.04;
			frame(40, false);
			frame(60, false);
			expect(tracker.detect.mock.calls.map((call) => call[1])).toEqual([0, 40]);
			expect(callbacks.onFrame.mock.lastCall?.[0].hasNewFrame).toBe(false);
		});

		it("distinguishes equal playback time and frame count values when switching to the frame counter", async () => {
			const { session, video, frame, tracker, callbacks, setVideoFrameCount } =
				setup();
			await session.start(video);
			video.currentTime = 1;
			frame(0, false);
			setVideoFrameCount(1);
			frame(40, false);
			expect(tracker.detect.mock.calls.map((call) => call[1])).toEqual([0, 40]);
			video.currentTime = 2;
			frame(60, false);
			expect(tracker.detect).toHaveBeenCalledTimes(2);
			expect(callbacks.onFrame.mock.lastCall?.[0].hasNewFrame).toBe(false);
		});

		it("never falls back to the playback clock after a positive frame counter returns to zero", async () => {
			const { session, video, frame, tracker, callbacks, setVideoFrameCount } =
				setup();
			await session.start(video);
			tracker.detect.mockImplementation((_video, timestamp) => [
				observation(timestamp),
			]);
			frame(0);
			setVideoFrameCount(0);
			video.currentTime = 2;
			frame(40, false);
			video.currentTime = 3;
			frame(161, false);
			expect(tracker.detect.mock.calls.map((call) => call[1])).toEqual([0, 40]);
			expect(callbacks.onFrame.mock.lastCall?.[0]).toMatchObject({
				hasNewFrame: false,
				observations: [],
				tracking: {
					hands: [],
					events: [{ type: "hand:lost", handId: 1, reason: "timeout" }],
				},
			});
		});

		it("does not process a paused video even if received frames keep accumulating", async () => {
			const { session, video, frame, tracker, callbacks } = setup();
			await session.start(video);
			frame(0);
			Object.defineProperty(video, "paused", { value: true });
			frame(40);
			expect(tracker.detect).toHaveBeenCalledExactlyOnceWith(video, 0);
			expect(callbacks.onFrame.mock.lastCall?.[0].hasNewFrame).toBe(false);
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

		it("expires a missing hand and assigns a new identity when it returns in later images", async () => {
			const { session, video, frame, tracker, callbacks } = setup();
			await session.start(video);
			tracker.detect.mockReturnValue([observation(0)]);
			frame(0);
			tracker.detect.mockReturnValue([]);
			frame(40);
			expect(callbacks.onFrame.mock.lastCall?.[0].tracking.hands).toMatchObject(
				[{ id: 1, status: "missing" }],
			);
			frame(160);
			expect(callbacks.onFrame.mock.lastCall?.[0]).toMatchObject({
				hasNewFrame: true,
				tracking: {
					hands: [],
					events: [{ type: "hand:lost", handId: 1, reason: "timeout" }],
				},
			});
			tracker.detect.mockReturnValue([observation(200)]);
			frame(200);
			expect(callbacks.onFrame.mock.lastCall?.[0]).toMatchObject({
				hasNewFrame: true,
				tracking: {
					hands: [{ id: 2, status: "tracked" }],
					events: [{ type: "hand:found", handId: 2 }],
				},
			});
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
			expect(callbacks.onFrame.mock.lastCall?.[0].tracking.hands[0]?.id).toBe(
				2,
			);
			expect(queued.size).toBe(1);
		});

		it("keeps independently created project sessions isolated", async () => {
			const { session, video, stream, frame, replaceResources } = setup();
			await session.start(video);
			const other = replaceResources();
			const onFrame = vi.fn();
			const second = createTrackingSession({ onFrame }, { scheduling });
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
	},
);
