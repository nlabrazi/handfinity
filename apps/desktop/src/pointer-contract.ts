import type { PointerMoveCommand } from "@handfinity/interactions/pointer-commands";

export type PointerControlState = {
	readonly phase:
		| "unsupported"
		| "disabled"
		| "starting"
		| "waiting"
		| "moving"
		| "paused"
		| "error";
	readonly sessionId: number | null;
	readonly error: string | null;
};

export type PointerUpdate = {
	readonly sessionId: number;
	/** Origine performance.timeOrigin + horodatage de l'image, ou du choix explicite sans commande. */
	readonly capturedAt: number;
	/** Pause volontaire calculée par le moteur partagé. */
	readonly paused: boolean;
	readonly command: PointerMoveCommand | null;
};

/** Capacités limitées du preload ; aucun accès générique à Electron. */
export type SystemPointerBridge = {
	getState(): Promise<PointerControlState>;
	enable(): Promise<PointerControlState>;
	disable(): Promise<PointerControlState>;
	submit(update: PointerUpdate): void;
	subscribe(listener: (state: PointerControlState) => void): () => void;
};
