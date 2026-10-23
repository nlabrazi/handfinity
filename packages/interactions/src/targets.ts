import type { Point } from "@handfinity/core";

/** Rectangle et point projeté dans un même repère (coordonnées client côté DOM). */
export type InteractionRect = {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
};

export type InteractionTarget = {
	readonly id: string;
	readonly rect: InteractionRect;
	readonly disabled?: boolean;
	/** Priorité la plus élevée en cas de chevauchement ; à égalité, première cible. */
	readonly priority?: number;
};

function validRect(rect: InteractionRect) {
	return (
		[rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
		rect.width > 0 &&
		rect.height > 0
	);
}

/** Projette l'image normalisée dans une surface ; les points hors image sont ignorés. */
export function projectHandPoint(
	point: Readonly<Point>,
	surface: InteractionRect,
	options: { mirrorX?: boolean } = {},
): Point | null {
	if (
		!Number.isFinite(point.x) ||
		!Number.isFinite(point.y) ||
		point.x < 0 ||
		point.x > 1 ||
		point.y < 0 ||
		point.y > 1 ||
		!validRect(surface)
	)
		return null;
	return {
		x: surface.left + (options.mirrorX ? 1 - point.x : point.x) * surface.width,
		y: surface.top + point.y * surface.height,
	};
}

/** Bords gauche/haut inclus, droite/bas exclus, sans modifier l'ordre des cibles. */
export function hitTestTargets(
	point: Readonly<Point> | null,
	targets: readonly InteractionTarget[],
): InteractionTarget | null {
	if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y))
		return null;
	let result: InteractionTarget | null = null;
	for (const target of targets) {
		const { rect } = target;
		if (
			target.disabled ||
			!validRect(rect) ||
			!Number.isFinite(target.priority ?? 0)
		)
			continue;
		if (
			point.x < rect.left ||
			point.x >= rect.left + rect.width ||
			point.y < rect.top ||
			point.y >= rect.top + rect.height
		)
			continue;
		if (!result || (target.priority ?? 0) > (result.priority ?? 0))
			result = target;
	}
	return result;
}
