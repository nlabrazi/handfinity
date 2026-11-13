import type { Point } from "../gestures/pinch";

export type ActiveZoneBounds = {
	readonly minX: number;
	readonly maxX: number;
	readonly minY: number;
	readonly maxY: number;
};

export const DEFAULT_ACTIVE_ZONE: ActiveZoneBounds = {
	minX: 0.12,
	maxX: 0.88,
	minY: 0.15,
	maxY: 0.85,
};

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

/**
 * Projette un point de la zone active de la caméra vers l'écran complet [0, 1]
 * afin d'atteindre confortablement les bords et les coins sans sortir du cadre.
 */
export function createActiveZoneMapper(
	bounds: ActiveZoneBounds = DEFAULT_ACTIVE_ZONE,
) {
	const { minX, maxX, minY, maxY } = bounds;
	if (
		![minX, maxX, minY, maxY].every(Number.isFinite) ||
		minX < 0 ||
		maxX > 1 ||
		minY < 0 ||
		maxY > 1 ||
		minX >= maxX ||
		minY >= maxY
	) {
		throw new RangeError(
			"Active zone bounds must form a valid sub-rectangle in [0, 1]",
		);
	}

	const spanX = maxX - minX;
	const spanY = maxY - minY;

	function project(point: Point): Point {
		return {
			x: clamp01((point.x - minX) / spanX),
			y: clamp01((point.y - minY) / spanY),
		};
	}

	return { bounds: { minX, maxX, minY, maxY }, project };
}
