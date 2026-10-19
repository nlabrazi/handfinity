export type Point = {
	x: number;
	y: number;
};

export type HandPose = {
	wrist: Point;
	thumbTip: Point;
	indexTip: Point;
	middleBase: Point;
};

export type PinchEvent = {
	type: "pinch:start" | "pinch:move" | "pinch:end";
	position: Point;
	ratio: number;
};

const START_THRESHOLD = 0.32;
const END_THRESHOLD = 0.46;
const SMOOTHING = 0.35;
const STABLE_FRAMES = 2;

function distance(a: Point, b: Point, aspectRatio: number): number {
	return Math.hypot((a.x - b.x) * aspectRatio, a.y - b.y);
}

export function createPinchDetector() {
	let active = false;
	let smoothedRatio: number | null = null;
	let stableFrames = 0;
	let lastPosition: Point = { x: 0, y: 0 };

	function reset() {
		active = false;
		smoothedRatio = null;
		stableFrames = 0;
		lastPosition = { x: 0, y: 0 };
	}

	function update(hand: HandPose | null, aspectRatio = 1): PinchEvent | null {
		if (!hand) {
			const wasActive = active;
			const position = lastPosition;
			const ratio = smoothedRatio ?? 0;

			reset();

			return wasActive ? { type: "pinch:end", position, ratio } : null;
		}

		const palmSize = distance(hand.wrist, hand.middleBase, aspectRatio);

		if (palmSize < 0.00001) {
			return update(null);
		}

		const rawRatio =
			distance(hand.thumbTip, hand.indexTip, aspectRatio) / palmSize;

		smoothedRatio =
			smoothedRatio === null
				? rawRatio
				: SMOOTHING * rawRatio + (1 - SMOOTHING) * smoothedRatio;

		lastPosition = {
			x: (hand.thumbTip.x + hand.indexTip.x) / 2,
			y: (hand.thumbTip.y + hand.indexTip.y) / 2,
		};

		if (active) {
			if (smoothedRatio >= END_THRESHOLD) {
				stableFrames++;

				if (stableFrames >= STABLE_FRAMES) {
					active = false;
					stableFrames = 0;

					return {
						type: "pinch:end",
						position: lastPosition,
						ratio: smoothedRatio,
					};
				}
			} else {
				stableFrames = 0;
			}

			return {
				type: "pinch:move",
				position: lastPosition,
				ratio: smoothedRatio,
			};
		}

		if (smoothedRatio <= START_THRESHOLD) {
			stableFrames++;

			if (stableFrames >= STABLE_FRAMES) {
				active = true;
				stableFrames = 0;

				return {
					type: "pinch:start",
					position: lastPosition,
					ratio: smoothedRatio,
				};
			}
		} else {
			stableFrames = 0;
		}

		return null;
	}

	return { update, reset };
}
