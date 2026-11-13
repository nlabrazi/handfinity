import { createPinchDetector, measurePinch } from "../gestures/pinch";
import {
	PINCH_END_THRESHOLD,
	PINCH_START_THRESHOLD,
} from "../gestures/pinch-config";
import type { HandObservation, HandPoint } from "../hand-observation";
import type {
	HandTrackingFrame,
	TrackedHand,
} from "../tracking/hand-identity-tracker";

export type HandPoseKind = "unknown" | "pointing" | "open-palm" | "pinch";
export type HandFinger = "thumb" | "index" | "middle" | "ring" | "pinky";
export type FingerExtension = "extended" | "folded" | "uncertain";

export type HandPoseMeasurements = {
	readonly fingers: Readonly<Record<HandFinger, FingerExtension>>;
	/** Distance pouce/index divisée par la paume, dans le repère XYZ estimé. */
	readonly pinchRatio: number;
};

export type TrackedHandPose = {
	readonly handId: number;
	readonly status: TrackedHand["status"];
	readonly pose: HandPoseKind;
	readonly candidate: HandPoseKind;
	readonly pending: boolean;
	/** Début de la posture confirmée, ou null pour unknown. */
	readonly since: number | null;
	readonly measurements: HandPoseMeasurements | null;
};

const POSE_HOLD_MS = 80;
const EPSILON = 0.00001;
type Vector = { x: number; y: number; z: number };

function vector(a: HandPoint, b: HandPoint, aspectRatio: number): Vector {
	// z utilise une échelle proche de x ; corriger aussi son ratio d'image.
	return {
		x: (a.x - b.x) * aspectRatio,
		y: a.y - b.y,
		z: (a.z - b.z) * aspectRatio,
	};
}

function length(v: Vector) {
	return Math.hypot(v.x, v.y, v.z);
}

function angle(
	a: HandPoint,
	b: HandPoint,
	c: HandPoint,
	aspectRatio: number,
): number | null {
	const ab = vector(a, b, aspectRatio);
	const cb = vector(c, b, aspectRatio);
	const denominator = length(ab) * length(cb);
	if (denominator < EPSILON * EPSILON) return null;
	const cosine = (ab.x * cb.x + ab.y * cb.y + ab.z * cb.z) / denominator;
	return (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI;
}

function fingerState(
	points: readonly HandPoint[],
	base: number,
	aspectRatio: number,
): FingerExtension {
	const [a, b, c, d] = points.slice(base, base + 4);
	if (!a || !b || !c || !d) return "uncertain";
	const proximal = angle(a, b, c, aspectRatio);
	const distal = angle(b, c, d, aspectRatio);
	if (proximal === null || distal === null) return "uncertain";
	const path =
		length(vector(a, b, aspectRatio)) +
		length(vector(b, c, aspectRatio)) +
		length(vector(c, d, aspectRatio));
	const straightness = length(vector(a, d, aspectRatio)) / path;
	if (proximal >= 150 && distal >= 150 && straightness >= 0.85)
		return "extended";
	if (proximal <= 125 || distal <= 125 || straightness <= 0.65) return "folded";
	return "uncertain";
}

function measure(
	observation: HandObservation,
	aspectRatio: number,
): HandPoseMeasurements | null {
	const points = observation.landmarks;
	if (
		points.length !== 21 ||
		points.some((point) => ![point.x, point.y, point.z].every(Number.isFinite))
	)
		return null;
	const wrist = points[0];
	const thumb = points[4];
	const index = points[8];
	const indexBase = points[5];
	const middleBase = points[9];
	if (!wrist || !thumb || !index || !indexBase || !middleBase) return null;
	const pinch = measurePinch(
		{ wrist, thumbTip: thumb, indexTip: index, middleBase },
		aspectRatio,
	);
	if (!pinch) return null;
	let thumbState = fingerState(points, 1, aspectRatio);
	// Un pouce rectiligne posé contre la paume ne suffit pas à une paume ouverte.
	if (
		thumbState === "extended" &&
		length(vector(thumb, indexBase, aspectRatio)) / pinch.palmSize < 0.45
	)
		thumbState = "uncertain";
	return {
		fingers: {
			thumb: thumbState,
			index: fingerState(points, 5, aspectRatio),
			middle: fingerState(points, 9, aspectRatio),
			ring: fingerState(points, 13, aspectRatio),
			pinky: fingerState(points, 17, aspectRatio),
		},
		pinchRatio: pinch.ratio,
	};
}

function classifyFingers(
	fingers: HandPoseMeasurements["fingers"],
): HandPoseKind {
	if (Object.values(fingers).every((state) => state === "extended"))
		return "open-palm";
	if (
		fingers.index === "extended" &&
		[fingers.middle, fingers.ring, fingers.pinky].every(
			(state) => state === "folded",
		)
	)
		return "pointing";
	return "unknown";
}

function createPoseDetector() {
	const pinch = createPinchDetector();
	let pose: HandPoseKind = "unknown";
	let candidate: HandPoseKind = "unknown";
	let since: number | null = null;
	let candidateSince: number | null = null;
	let measurements: HandPoseMeasurements | null = null;
	let pinching = false;

	function confirm(next: HandPoseKind, timestamp: number) {
		if (pose !== next) since = next === "unknown" ? null : timestamp;
		pose = next;
	}

	function reset() {
		pinch.reset();
		pose = "unknown";
		candidate = "unknown";
		since = null;
		candidateSince = null;
		measurements = null;
		pinching = false;
	}

	function update(observation: HandObservation, aspectRatio: number) {
		measurements = measure(observation, aspectRatio);
		if (!measurements) {
			reset();
			return;
		}
		const points = observation.landmarks;
		const wrist = points[0];
		const thumbTip = points[4];
		const indexTip = points[8];
		const middleBase = points[9];
		if (!wrist || !thumbTip || !indexTip || !middleBase) {
			reset();
			return;
		}
		const timestamp = observation.timestamp;
		const event = pinch.update(
			{ wrist, thumbTip, indexTip, middleBase },
			aspectRatio,
			timestamp,
		);
		if (event) pinching = event.type !== "pinch:end";
		const touching = pinching
			? measurements.pinchRatio < PINCH_END_THRESHOLD
			: measurements.pinchRatio <= PINCH_START_THRESHOLD;
		const nextCandidate = touching
			? "pinch"
			: classifyFingers(measurements.fingers);
		if (candidate !== nextCandidate) {
			candidate = nextCandidate;
			candidateSince = timestamp;
		}
		candidateSince ??= timestamp;
		if (pinching) {
			confirm("pinch", timestamp);
		} else {
			if (pose === "pinch") confirm("unknown", timestamp);
			if (
				candidate !== "pinch" &&
				candidate !== pose &&
				timestamp - candidateSince >= POSE_HOLD_MS
			)
				confirm(candidate, timestamp);
		}
	}

	function snapshot() {
		return {
			pose,
			candidate,
			pending: pose !== candidate,
			since,
			measurements,
		};
	}
	return { update, reset, snapshot };
}

/** Postures par identité ; seules les nouvelles observations confirment une pose. */
export function createHandPoseTracker() {
	const detectors = new Map<
		number,
		{
			detector: ReturnType<typeof createPoseDetector>;
			timestamp: number | null;
		}
	>();
	let lastTimestamp: number | null = null;

	function update(
		frame: HandTrackingFrame,
		aspectRatio = 1,
	): readonly TrackedHandPose[] {
		if (
			!Number.isFinite(frame.timestamp) ||
			(lastTimestamp !== null && frame.timestamp < lastTimestamp)
		)
			throw new RangeError("Pose timestamps must be finite and monotonic");
		if (!Number.isFinite(aspectRatio) || aspectRatio <= 0)
			throw new RangeError(
				"The image aspect ratio must be positive and finite",
			);
		lastTimestamp = frame.timestamp;
		const ids = new Set(frame.hands.map((hand) => hand.id));
		for (const id of detectors.keys()) if (!ids.has(id)) detectors.delete(id);
		if (frame.ambiguous) {
			detectors.clear();
			return [];
		}
		return frame.hands.map((hand) => {
			let entry = detectors.get(hand.id);
			if (!entry) {
				entry = { detector: createPoseDetector(), timestamp: null };
				detectors.set(hand.id, entry);
			}
			if (hand.status === "missing") {
				entry.detector.reset();
				entry.timestamp = null;
			} else if (
				hand.observation.timestamp === frame.timestamp &&
				entry.timestamp !== frame.timestamp
			) {
				entry.detector.update(hand.observation, aspectRatio);
				entry.timestamp = frame.timestamp;
			}
			return {
				handId: hand.id,
				status: hand.status,
				...entry.detector.snapshot(),
			};
		});
	}

	function reset() {
		detectors.clear();
		lastTimestamp = null;
	}
	return { update, reset };
}
