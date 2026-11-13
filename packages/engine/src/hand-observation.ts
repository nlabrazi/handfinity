/**
 * Repère dans l'image source, avant tout miroir d'affichage.
 * x et y sont normalisés par la largeur et la hauteur de l'image.
 * z est une profondeur relative au poignet, à une échelle proche de x :
 * une valeur plus petite indique un point plus proche de la caméra.
 * Ce ne sont pas des coordonnées 3D en mètres.
 */
export type HandPoint = {
	readonly x: number;
	readonly y: number;
	readonly z: number;
};

export type Handedness = "left" | "right" | "unknown";

/** Observation d'une main sur une image ; elle ne porte pas d'identité stable. */
export type HandObservation = {
	/** Les 21 repères : poignet (0), pouce (1–4), index (5–8),
	 * majeur (9–12), annulaire (13–16), auriculaire (17–20).
	 */
	readonly landmarks: readonly HandPoint[];
	/** Classification du détecteur sur l'image source, sans inversion liée à l'UI. */
	readonly handedness: Handedness;
	/** Confiance gauche/droite entre 0 et 1, ou null si inconnue.
	 * Ce score ne mesure ni la qualité des repères ni celle du suivi.
	 */
	readonly handednessConfidence: number | null;
	/** Horodatage monotone en millisecondes fourni à la détection
	 * (performance.now() dans les applications), et non une date Unix.
	 */
	readonly timestamp: number;
};
