import type { Point } from "../gestures/pinch";

// En millisecondes pour garder le même filtrage quelle que soit la cadence vidéo.
const SMOOTHING_TIME_MS = 30;

export function createPointSmoother() {
	let previous: Point | null = null;
	let previousTime = 0;

	function reset() {
		previous = null;
	}

	function update(point: Point, timestamp: number): Point {
		if (!previous) {
			previous = { ...point };
			previousTime = timestamp;
			return previous;
		}

		const elapsed = Math.max(0, timestamp - previousTime);
		const alpha = 1 - Math.exp(-elapsed / SMOOTHING_TIME_MS);
		previous = {
			x: previous.x + (point.x - previous.x) * alpha,
			y: previous.y + (point.y - previous.y) * alpha,
		};
		previousTime = Math.max(previousTime, timestamp);
		return previous;
	}

	return { update, reset };
}
