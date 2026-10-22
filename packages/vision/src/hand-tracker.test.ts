import type {
	Category,
	HandLandmarker,
	HandLandmarkerResult,
	NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHandTracker } from "./hand-tracker";

const landmarker = vi.hoisted(() => ({
	detectForVideo: vi.fn<HandLandmarker["detectForVideo"]>(),
	close: vi.fn(),
}));

vi.mock("@mediapipe/tasks-vision", () => ({
	FilesetResolver: { forVisionTasks: vi.fn().mockResolvedValue({}) },
	HandLandmarker: {
		HAND_CONNECTIONS: [],
		createFromOptions: vi.fn(async () => landmarker),
	},
}));

function landmarks(offset = 0): NormalizedLandmark[] {
	return Array.from({ length: 21 }, (_, index) => ({
		x: index / 40 + offset,
		y: index / 50,
		z: -index / 100,
		visibility: 0.9,
	}));
}

function category(categoryName: string, score: number): Category {
	// Les noms d'affichage peuvent être traduits ; seul categoryName fait foi.
	return { categoryName, score, index: 0, displayName: "Nom traduit" };
}

function result(
	points: NormalizedLandmark[][] = [],
	handedness: Category[][] = [],
): HandLandmarkerResult {
	return {
		landmarks: points,
		handedness,
		worldLandmarks: [],
		handednesses: [],
	};
}

afterEach(() => {
	landmarker.detectForVideo.mockReset();
	vi.clearAllMocks();
});

describe("Hand observations", () => {
	it("preserves source coordinates and the supplied timestamp without mirroring", async () => {
		landmarker.detectForVideo.mockReturnValue(
			result([landmarks()], [[category("Left", 0.97)]]),
		);
		const tracker = await createHandTracker();
		const video = {} as HTMLVideoElement;
		const observations = tracker.detect(video, 1234.5);

		expect(landmarker.detectForVideo).toHaveBeenCalledExactlyOnceWith(
			video,
			1234.5,
		);
		expect(observations).toHaveLength(1);
		expect(observations[0]).toMatchObject({
			handedness: "left",
			handednessConfidence: 0.97,
			timestamp: 1234.5,
		});
		expect(observations[0]?.landmarks).toHaveLength(21);
		expect(observations[0]?.landmarks[8]).toEqual({
			x: 0.2,
			y: 0.16,
			z: -0.08,
		});
	});

	it("keeps landmarks and handedness paired when the detector changes hand order", async () => {
		const left = landmarks();
		const right = landmarks(0.4);
		landmarker.detectForVideo
			.mockReturnValueOnce(
				result(
					[left, right],
					[[category("Left", 0.92)], [category("Right", 0.84)]],
				),
			)
			.mockReturnValueOnce(
				result(
					[right, left],
					[[category("Right", 0.86)], [category("Left", 0.94)]],
				),
			);
		const tracker = await createHandTracker();
		const video = {} as HTMLVideoElement;

		const first = tracker.detect(video, 0);
		expect(first).toMatchObject([
			{
				handedness: "left",
				handednessConfidence: 0.92,
				timestamp: 0,
			},
			{
				handedness: "right",
				handednessConfidence: 0.84,
				timestamp: 0,
			},
		]);
		expect(first[0]?.landmarks[0]?.x).toBe(0);
		expect(first[1]?.landmarks[0]?.x).toBe(0.4);

		const second = tracker.detect(video, 40);
		expect(second).toMatchObject([
			{
				handedness: "right",
				handednessConfidence: 0.86,
				timestamp: 40,
			},
			{
				handedness: "left",
				handednessConfidence: 0.94,
				timestamp: 40,
			},
		]);
		expect(second[0]?.landmarks[0]?.x).toBe(0.4);
		expect(second[1]?.landmarks[0]?.x).toBe(0);
	});

	it.each([
		{ name: "missing", handedness: [] },
		{ name: "empty", handedness: [[]] },
		{ name: "unrecognized", handedness: [[category("Other", 0.9)]] },
	])(
		"keeps a hand with $name handedness as unknown",
		async ({ handedness }) => {
			landmarker.detectForVideo.mockReturnValue(
				result([landmarks()], handedness),
			);
			const tracker = await createHandTracker();

			const observations = tracker.detect({} as HTMLVideoElement, 40);
			expect(observations).toHaveLength(1);
			expect(observations[0]).toMatchObject({
				handedness: "unknown",
				handednessConfidence: null,
				timestamp: 40,
			});
			expect(observations[0]?.landmarks).toHaveLength(21);
		},
	);

	it("does not borrow another hand's classification when one is missing", async () => {
		landmarker.detectForVideo.mockReturnValue(
			result([landmarks(), landmarks(0.4)], [[], [category("Right", 0.9)]]),
		);
		const tracker = await createHandTracker();

		expect(tracker.detect({} as HTMLVideoElement, 40)).toMatchObject([
			{ handedness: "unknown", handednessConfidence: null },
			{ handedness: "right", handednessConfidence: 0.9 },
		]);
	});

	it("preserves a zero confidence instead of treating it as unavailable", async () => {
		landmarker.detectForVideo.mockReturnValue(
			result([landmarks()], [[category("Right", 0)]]),
		);
		const tracker = await createHandTracker();

		expect(tracker.detect({} as HTMLVideoElement, 0)[0]).toMatchObject({
			handedness: "right",
			handednessConfidence: 0,
			timestamp: 0,
		});
	});

	it("returns no observations when no hands are detected", async () => {
		landmarker.detectForVideo.mockReturnValue(result());
		const tracker = await createHandTracker();

		expect(tracker.detect({} as HTMLVideoElement, 40)).toEqual([]);
	});

	it("keeps observations independent from subsequent detector buffer changes", async () => {
		const points = landmarks();
		landmarker.detectForVideo.mockReturnValue(
			result([points], [[category("Left", 0.9)]]),
		);
		const tracker = await createHandTracker();
		const observations = tracker.detect({} as HTMLVideoElement, 40);
		const indexTip = points[8];
		if (!indexTip) throw new Error("Missing test landmark");
		indexTip.x = 0.9;
		points.length = 0;

		expect(observations[0]?.landmarks).toHaveLength(21);
		expect(observations[0]?.landmarks[8]?.x).toBe(0.2);
	});

	it("closes the underlying detector", async () => {
		const tracker = await createHandTracker();
		tracker.close();

		expect(landmarker.close).toHaveBeenCalledOnce();
	});
});
