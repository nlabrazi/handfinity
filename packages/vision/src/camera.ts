export async function startCamera(
	video: HTMLVideoElement,
	signal?: AbortSignal,
): Promise<MediaStream> {
	signal?.throwIfAborted();
	if (!navigator.mediaDevices?.getUserMedia) {
		throw new Error("Camera API unavailable. HTTPS or localhost required.");
	}

	const stream = await navigator.mediaDevices.getUserMedia({
		audio: false,
		video: {
			facingMode: "user",
			width: { ideal: 1280 },
			height: { ideal: 720 },
		},
	});

	let released = false;
	function release() {
		if (released) return;
		released = true;
		stopCamera(stream);
		if (video.srcObject === stream) video.srcObject = null;
	}

	signal?.addEventListener("abort", release, { once: true });
	try {
		// Une autorisation navigateur peut arriver après la fermeture du projet.
		signal?.throwIfAborted();
		video.srcObject = stream;
		await video.play();
		signal?.throwIfAborted();
		return stream;
	} catch (error) {
		release();
		throw error;
	} finally {
		signal?.removeEventListener("abort", release);
	}
}

export function stopCamera(stream: MediaStream): void {
	for (const track of stream.getTracks()) {
		track.stop();
	}
}
