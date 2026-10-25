export type PointerMoveCommand = {
	readonly type: "pointer:move";
	readonly handId: number;
	/** Horodatage monotone de l'observation à l'origine du déplacement. */
	readonly timestamp: number;
	/** Destination normalisée [0, 1], origine en haut à gauche, miroir déjà appliqué. */
	readonly position: Readonly<{ x: number; y: number }>;
};
