import { afterEach, describe, expect, it, vi } from "vitest";
import { startCamera, stopCamera } from "./camera";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function setup() {
	const track = { stop: vi.fn() };
	const stream = { getTracks: () => [track] } as unknown as MediaStream;
	const getUserMedia = vi.fn().mockResolvedValue(stream);
	vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
	const play = vi.fn().mockResolvedValue(undefined);
	const video = { srcObject: null, play } as unknown as HTMLVideoElement;
	return {
		track,
		stream,
		getUserMedia,
		video,
		play,
		abort: new AbortController(),
	};
}

afterEach(() => vi.unstubAllGlobals());

describe("Camera acquisition", () => {
	it("attaches and plays the stream, then transfers ownership to the caller", async () => {
		const { video, stream, play, track, abort } = setup();
		expect(await startCamera(video, abort.signal)).toBe(stream);
		expect(video.srcObject).toBe(stream);
		expect(play).toHaveBeenCalledOnce();
		abort.abort();
		expect(track.stop).not.toHaveBeenCalled();
		stopCamera(stream);
		expect(track.stop).toHaveBeenCalledOnce();
	});

	it("rejects an already cancelled acquisition without requesting the camera", async () => {
		const { video, getUserMedia, abort } = setup();
		abort.abort();
		await expect(startCamera(video, abort.signal)).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(getUserMedia).not.toHaveBeenCalled();
	});

	it("releases a late permission result without attaching or playing it", async () => {
		const { video, getUserMedia, stream, track, play, abort } = setup();
		const permission = deferred<MediaStream>();
		getUserMedia.mockReturnValueOnce(permission.promise);
		const starting = startCamera(video, abort.signal);
		abort.abort();
		permission.resolve(stream);
		await expect(starting).rejects.toMatchObject({ name: "AbortError" });
		expect(track.stop).toHaveBeenCalledOnce();
		expect(video.srcObject).toBeNull();
		expect(play).not.toHaveBeenCalled();
	});

	it("releases the camera immediately if playback is still pending on cancellation", async () => {
		const { video, play, stream, track, abort } = setup();
		const playback = deferred<void>();
		play.mockReturnValueOnce(playback.promise);
		const starting = startCamera(video, abort.signal);
		await Promise.resolve();
		expect(video.srcObject).toBe(stream);
		abort.abort();
		expect(track.stop).toHaveBeenCalledOnce();
		expect(video.srcObject).toBeNull();
		playback.resolve();
		await expect(starting).rejects.toMatchObject({ name: "AbortError" });
		expect(track.stop).toHaveBeenCalledOnce();
	});

	it("does not detach a replacement stream when an old playback fails", async () => {
		const { video, play, track } = setup();
		const playback = deferred<void>();
		play.mockReturnValueOnce(playback.promise);
		const starting = startCamera(video);
		await Promise.resolve();
		const replacement = {} as MediaStream;
		video.srcObject = replacement;
		playback.reject(new Error("Playback interrupted"));
		await expect(starting).rejects.toThrow("Playback interrupted");
		expect(track.stop).toHaveBeenCalledOnce();
		expect(video.srcObject).toBe(replacement);
	});

	it("releases the stream when playback fails", async () => {
		const { video, play, track } = setup();
		play.mockRejectedValueOnce(new Error("Playback denied"));
		await expect(startCamera(video)).rejects.toThrow("Playback denied");
		expect(video.srcObject).toBeNull();
		expect(track.stop).toHaveBeenCalledOnce();
	});

	it("reports permission rejection without attempting playback", async () => {
		const { video, getUserMedia, play } = setup();
		getUserMedia.mockRejectedValueOnce(new Error("Permission denied"));
		await expect(startCamera(video)).rejects.toThrow("Permission denied");
		expect(play).not.toHaveBeenCalled();
	});

	it("reports an unavailable camera API", async () => {
		vi.stubGlobal("navigator", {});
		await expect(startCamera({} as HTMLVideoElement)).rejects.toThrow(
			"Camera API unavailable",
		);
	});
});
