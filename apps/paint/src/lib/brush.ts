export type BrushSettings = {
	color: string;
	width: number;
};

export const DEFAULT_BRUSH: Readonly<BrushSettings> = {
	color: "#38bdf8",
	width: 6,
};

export const MIN_BRUSH_WIDTH = 1;
export const MAX_BRUSH_WIDTH = 40;
