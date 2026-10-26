import type { PointerMoveCommand } from "@handfinity/interactions/pointer-commands";

export type PointerControlState = {
	readonly phase:
		| "unsupported"
		| "disabled"
		| "starting"
		| "waiting"
		| "moving"
		| "error";
	readonly sessionId: number | null;
	readonly error: string | null;
};

export type PointerUpdate = {
	readonly sessionId: number;
	/** Origine performance.timeOrigin + horodatage de la frame du moteur. */
	readonly capturedAt: number;
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
