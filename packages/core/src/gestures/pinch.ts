import type { HandPoint } from "../hand-observation";
import {
	PINCH_END_HOLD_MS as END_HOLD_MS,
	PINCH_END_THRESHOLD as END_THRESHOLD,
	PINCH_START_HOLD_MS as START_HOLD_MS,
	PINCH_START_THRESHOLD as START_THRESHOLD,
} from "./pinch-config";

export type Point = {
	x: number;
	y: number;
};

export type HandPose = {
	wrist: HandPoint;
	thumbTip: HandPoint;
	indexTip: HandPoint;
	middleBase: HandPoint;
};

type PinchSample = {
	position: Point;
	ratio: number;
	timestamp: number;
};

export type PinchEvent = PinchSample &
	(
		| { type: "pinch:start" | "pinch:move" }
		| { type: "pinch:end"; reason: "released" | "tracking-lost" }
	);

function distance(a: HandPoint, b: HandPoint, aspectRatio: number): number {
	return Math.hypot(
		(a.x - b.x) * aspectRatio,
		a.y - b.y,
		(a.z - b.z) * aspectRatio,
	);
}

/** Même mesure pour les événements et la classification, dans le repère XYZ estimé. */
export function measurePinch(hand: HandPose, aspectRatio: number) {
	const palmSize = distance(hand.wrist, hand.middleBase, aspectRatio);
	const gap = distance(hand.thumbTip, hand.indexTip, aspectRatio);
	if (!Number.isFinite(palmSize) || !Number.isFinite(gap) || palmSize < 0.00001)
		return null;
	return { palmSize, ratio: gap / palmSize };
}

export function createPinchDetector() {
	let active = false;
	let transitionSince: number | null = null;
	let lastRatio = 0;
	let lastPosition: Point = { x: 0, y: 0 };

	function reset() {
		active = false;
		transitionSince = null;
		lastRatio = 0;
		lastPosition = { x: 0, y: 0 };
	}

	function suspend() {
		// Une observation manquante ne confirme ni fermeture ni ouverture.
		transitionSince = null;
	}

	function update(
		hand: HandPose | null,
		aspectRatio = 1,
		timestamp = performance.now(),
	): PinchEvent | null {
		if (!hand) {
			const wasActive = active;
			const position = lastPosition;
			const ratio = lastRatio;

			reset();

			return wasActive
				? {
						type: "pinch:end",
						reason: "tracking-lost",
						position,
						ratio,
						timestamp,
					}
				: null;
		}

		const measurement = measurePinch(hand, aspectRatio);
		if (!measurement) return update(null, aspectRatio, timestamp);
		const { ratio } = measurement;
		lastRatio = ratio;

		if (active) {
			if (ratio >= END_THRESHOLD) {
				transitionSince ??= timestamp;
				if (timestamp - transitionSince >= END_HOLD_MS) {
					active = false;
					transitionSince = null;
					return {
						type: "pinch:end",
						reason: "released",
						position: lastPosition,
						ratio,
						timestamp,
					};
				}
				// Geler la pointe pendant la confirmation, sans couper le trait
				// sur une mesure bruitée ni dessiner le mouvement d'ouverture.
				return null;
			}

			transitionSince = null;
			lastPosition = { x: hand.indexTip.x, y: hand.indexTip.y };
			return {
				type: "pinch:move",
				position: lastPosition,
				ratio,
				timestamp,
			};
		}

		if (ratio <= START_THRESHOLD) {
			transitionSince ??= timestamp;
			if (timestamp - transitionSince >= START_HOLD_MS) {
				active = true;
				transitionSince = null;
				// Le pinceau suit l'index ; le pouce ne sert qu'à déclencher le geste.
				lastPosition = { x: hand.indexTip.x, y: hand.indexTip.y };
				return {
					type: "pinch:start",
					position: lastPosition,
					ratio,
					timestamp,
				};
			}
		} else {
			transitionSince = null;
		}

		return null;
	}

	return { update, reset, suspend };
}
