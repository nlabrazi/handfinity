import type { Point } from "../gestures/pinch";

export type OneEuroFilterOptions = {
	/** Fréquence de coupure minimale (Hz) à vitesse nulle — plus bas = plus stable à l'arrêt. */
	readonly minCutoff?: number;
	/** Coefficient de vitesse — plus haut = moins de latence en mouvement rapide. */
	readonly beta?: number;
	/** Fréquence de coupure pour la dérivée (Hz). */
	readonly dCutoff?: number;
};

const DEFAULT_MIN_CUTOFF = 1.2;
const DEFAULT_BETA = 0.04;
const DEFAULT_D_CUTOFF = 1.0;

function smoothingFactor(elapsedSeconds: number, cutoffHz: number): number {
	const r = 2 * Math.PI * cutoffHz * elapsedSeconds;
	return r / (r + 1);
}

function createLowPassFilter() {
	let initialized = false;
	let value = 0;

	function filter(input: number, alpha: number): number {
		if (!initialized) {
			initialized = true;
			value = input;
			return value;
		}
		value = alpha * input + (1 - alpha) * value;
		return value;
	}

	function reset() {
		initialized = false;
		value = 0;
	}

	return {
		filter,
		reset,
		get current() {
			return value;
		},
		get isInitialized() {
			return initialized;
		},
	};
}

function createAxisFilter(minCutoff: number, beta: number, dCutoff: number) {
	const xFilter = createLowPassFilter();
	const dxFilter = createLowPassFilter();

	function update(value: number, elapsedSeconds: number): number {
		if (!xFilter.isInitialized || elapsedSeconds <= 0) {
			dxFilter.filter(0, 1);
			return xFilter.filter(value, 1);
		}
		const dx = (value - xFilter.current) / elapsedSeconds;
		const edx = dxFilter.filter(dx, smoothingFactor(elapsedSeconds, dCutoff));
		const cutoff = minCutoff + beta * Math.abs(edx);
		return xFilter.filter(value, smoothingFactor(elapsedSeconds, cutoff));
	}

	function reset() {
		xFilter.reset();
		dxFilter.reset();
	}

	return { update, reset };
}

/**
 * Filtre 1€ (Casiez et al., CHI 2012) pour lisser les coordonnées 2D :
 * très fort lissage à basse vitesse (précision au clic) et faible latence à haute vitesse.
 */
export function createOneEuroFilter(options: OneEuroFilterOptions = {}) {
	const minCutoff = options.minCutoff ?? DEFAULT_MIN_CUTOFF;
	const beta = options.beta ?? DEFAULT_BETA;
	const dCutoff = options.dCutoff ?? DEFAULT_D_CUTOFF;

	if (
		!Number.isFinite(minCutoff) ||
		minCutoff <= 0 ||
		!Number.isFinite(beta) ||
		beta < 0 ||
		!Number.isFinite(dCutoff) ||
		dCutoff <= 0
	) {
		throw new RangeError(
			"One Euro Filter parameters must be valid positive numbers",
		);
	}

	const filterX = createAxisFilter(minCutoff, beta, dCutoff);
	const filterY = createAxisFilter(minCutoff, beta, dCutoff);
	let previousTime: number | null = null;
	let previousPoint: Point | null = null;

	function reset() {
		filterX.reset();
		filterY.reset();
		previousTime = null;
		previousPoint = null;
	}

	function update(point: Point, timestampMs: number): Point {
		if (previousTime === null || previousPoint === null) {
			previousTime = timestampMs;
			previousPoint = {
				x: filterX.update(point.x, 0),
				y: filterY.update(point.y, 0),
			};
			return previousPoint;
		}
		const elapsedSeconds = Math.max(0, timestampMs - previousTime) / 1000;
		if (elapsedSeconds === 0) {
			return previousPoint;
		}
		previousTime = Math.max(previousTime, timestampMs);
		previousPoint = {
			x: filterX.update(point.x, elapsedSeconds),
			y: filterY.update(point.y, elapsedSeconds),
		};
		return previousPoint;
	}

	return { update, reset };
}
