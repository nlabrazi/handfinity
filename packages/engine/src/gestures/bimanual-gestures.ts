import { computePalmCenter } from "../pointer/hand-pointers";
import type { HandTrackingFrame } from "../tracking/hand-identity-tracker";
import type { Point } from "./pinch";

/** Distance maximale normalisée pour considérer que les paumes se touchent ou sont très proches. */
export const PALMS_CLOSE_THRESHOLD = 0.22;
/** Distance minimale normalisée pour considérer que les paumes sont écartées après s'être rapprochées. */
export const PALMS_APART_THRESHOLD = 0.38;
/** Temps maximal alloué (en ms) entre le rapprochement des paumes et leur écartement. */
export const MAX_BIMANUAL_WINDOW_MS = 1200;
/** Temps de confirmation minimale des paumes ensemble pour éviter un croisement accidentel (en ms). */
export const MIN_TOGETHER_CONFIRM_MS = 80;
/** Période de refroidissement après déclenchement pour éviter les doubles basculements (en ms). */
export const BIMANUAL_COOLDOWN_MS = 1500;

export type BimanualGesturePhase = "idle" | "palms-together" | "cooldown";

export type BimanualGestureState = {
	readonly phase: BimanualGesturePhase;
	readonly distance: number | null;
	/** Progression du geste de 0 à 1 (0.5 = paumes jointes confirmées, 1 = écartement déclenché). */
	readonly progress: number;
	readonly keyboardToggle: boolean;
};

function computeDistance(p1: Point, p2: Point): number {
	return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Détecteur de geste bimanuel : rapprocher les deux paumes puis les écarter
 * pour ouvrir ou fermer le clavier virtuel en pop-up.
 */
export function createBimanualGestureTracker() {
	let phase: BimanualGesturePhase = "idle";
	let firstCloseTimestamp: number | null = null;
	let togetherSince: number | null = null;
	let cooldownUntil = 0;

	function update(tracking: HandTrackingFrame): BimanualGestureState {
		const timestamp = tracking.timestamp;

		if (phase === "cooldown") {
			if (timestamp >= cooldownUntil) {
				phase = "idle";
			} else {
				const remaining = cooldownUntil - timestamp;
				const progress = Math.max(0, 1 - remaining / BIMANUAL_COOLDOWN_MS);
				return {
					phase: "cooldown",
					distance: null,
					progress: Number(progress.toFixed(3)),
					keyboardToggle: false,
				};
			}
		}

		const trackedHands = tracking.ambiguous
			? []
			: tracking.hands.filter((h) => h.status === "tracked");

		if (trackedHands.length < 2) {
			if (
				phase === "palms-together" &&
				togetherSince !== null &&
				timestamp - togetherSince > MAX_BIMANUAL_WINDOW_MS
			) {
				phase = "idle";
				togetherSince = null;
				firstCloseTimestamp = null;
			}
			return {
				phase,
				distance: null,
				progress: phase === "palms-together" ? 0.5 : 0,
				keyboardToggle: false,
			};
		}

		const hand1 = trackedHands[0];
		const hand2 = trackedHands[1];
		if (!hand1 || !hand2) {
			return {
				phase,
				distance: null,
				progress: 0,
				keyboardToggle: false,
			};
		}

		const palm1 = computePalmCenter(hand1.observation);
		const palm2 = computePalmCenter(hand2.observation);

		if (!palm1 || !palm2) {
			return {
				phase,
				distance: null,
				progress: 0,
				keyboardToggle: false,
			};
		}

		const distance = Number(computeDistance(palm1, palm2).toFixed(4));

		if (phase === "idle") {
			if (distance <= PALMS_CLOSE_THRESHOLD) {
				firstCloseTimestamp ??= timestamp;
				if (timestamp - firstCloseTimestamp >= MIN_TOGETHER_CONFIRM_MS) {
					phase = "palms-together";
					togetherSince = timestamp;
					firstCloseTimestamp = null;
					return {
						phase: "palms-together",
						distance,
						progress: 0.5,
						keyboardToggle: false,
					};
				}
				const confirmProgress =
					(timestamp - firstCloseTimestamp) / MIN_TOGETHER_CONFIRM_MS;
				return {
					phase: "idle",
					distance,
					progress: Number((confirmProgress * 0.4).toFixed(3)),
					keyboardToggle: false,
				};
			}
			firstCloseTimestamp = null;
			return {
				phase: "idle",
				distance,
				progress: 0,
				keyboardToggle: false,
			};
		}

		if (phase === "palms-together") {
			if (
				togetherSince !== null &&
				timestamp - togetherSince > MAX_BIMANUAL_WINDOW_MS
			) {
				phase = "idle";
				togetherSince = null;
				firstCloseTimestamp = null;
				return {
					phase: "idle",
					distance,
					progress: 0,
					keyboardToggle: false,
				};
			}

			if (distance >= PALMS_APART_THRESHOLD) {
				phase = "cooldown";
				cooldownUntil = timestamp + BIMANUAL_COOLDOWN_MS;
				togetherSince = null;
				firstCloseTimestamp = null;
				return {
					phase: "cooldown",
					distance,
					progress: 1,
					keyboardToggle: true,
				};
			}

			const span = PALMS_APART_THRESHOLD - PALMS_CLOSE_THRESHOLD;
			const ratio = Math.max(
				0,
				Math.min(1, (distance - PALMS_CLOSE_THRESHOLD) / span),
			);
			const progress = Number((0.5 + ratio * 0.5).toFixed(3));

			return {
				phase: "palms-together",
				distance,
				progress,
				keyboardToggle: false,
			};
		}

		return {
			phase: "idle",
			distance,
			progress: 0,
			keyboardToggle: false,
		};
	}

	function reset() {
		phase = "idle";
		firstCloseTimestamp = null;
		togetherSince = null;
		cooldownUntil = 0;
	}

	return { update, reset };
}
