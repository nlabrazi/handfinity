export async function startCamera(
	video: HTMLVideoElement,
): Promise<MediaStream> {
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

	try {
		video.srcObject = stream;
		await video.play();
		return stream;
	} catch (error) {
		stopCamera(stream);
		video.srcObject = null;
		throw error;
	}
}

export function stopCamera(stream: MediaStream): void {
	for (const track of stream.getTracks()) {
		track.stop();
	}
}
