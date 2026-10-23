import {
	PINCH_START_THRESHOLD as START_THRESHOLD,
	PINCH_END_THRESHOLD as END_THRESHOLD,
	PINCH_START_HOLD_MS as START_HOLD_MS,
	PINCH_END_HOLD_MS as END_HOLD_MS,
} from "./pinch-config";

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

function distance(a: Point, b: Point, aspectRatio: number): number {
	return Math.hypot((a.x - b.x) * aspectRatio, a.y - b.y);
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

		const palmSize = distance(hand.wrist, hand.middleBase, aspectRatio);
		if (palmSize < 0.00001) return update(null, aspectRatio, timestamp);

		const ratio =
			distance(hand.thumbTip, hand.indexTip, aspectRatio) / palmSize;
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
			lastPosition = { ...hand.indexTip };
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
				lastPosition = { ...hand.indexTip };
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
