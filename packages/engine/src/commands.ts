export type MouseButton = "left" | "right";

export type PointerMoveCommand = {
	readonly type: "pointer:move";
	readonly handId: number;
	/** Horodatage monotone de l'observation à l'origine du déplacement. */
	readonly timestamp: number;
	/** Destination normalisée [0, 1], origine en haut à gauche, miroir déjà appliqué. */
	readonly position: Readonly<{ x: number; y: number }>;
};

export type PointerButtonDownCommand = {
	readonly type: "pointer:down";
	readonly button: MouseButton;
	readonly handId: number;
	readonly timestamp: number;
	readonly position: Readonly<{ x: number; y: number }>;
};

export type PointerButtonUpCommand = {
	readonly type: "pointer:up";
	readonly button: MouseButton;
	readonly handId: number;
	readonly timestamp: number;
	readonly position: Readonly<{ x: number; y: number }>;
};

export type PointerClickCommand = {
	readonly type: "pointer:click";
	readonly button: MouseButton;
	readonly handId: number;
	readonly timestamp: number;
	readonly position: Readonly<{ x: number; y: number }>;
};

export type PointerScrollCommand = {
	readonly type: "pointer:scroll";
	readonly handId: number;
	readonly timestamp: number;
	/** Défilement vertical normalisé (positif = vers le bas, négatif = vers le haut). */
	readonly deltaY: number;
};

export type PointerActionCommand =
	| PointerButtonDownCommand
	| PointerButtonUpCommand
	| PointerClickCommand
	| PointerScrollCommand;

export type InputCommand = PointerMoveCommand | PointerActionCommand;
