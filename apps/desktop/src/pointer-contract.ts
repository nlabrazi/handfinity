import type {
	PointerActionCommand,
	PointerMoveCommand,
} from "@handfinity/engine/commands";

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
	/** Origine performance.timeOrigin + horodatage du suivi. */
	readonly capturedAt: number;
	/** Pause volontaire calculée par le moteur partagé. */
	readonly paused: boolean;
	readonly command: PointerMoveCommand | null;
	readonly actions?: readonly PointerActionCommand[];
	readonly keys?: readonly string[];
};

/** Capacités limitées du preload ; aucun accès générique à Electron. */
export type SystemPointerBridge = {
	getState(): Promise<PointerControlState>;
	enable(): Promise<PointerControlState>;
	disable(): Promise<PointerControlState>;
	submit(update: PointerUpdate): void;
	subscribe(listener: (state: PointerControlState) => void): () => void;
};

export type OverlayHudState = {
	readonly phase: PointerControlState["phase"];
	readonly statusText: string;
	readonly grabProgress: number;
	readonly isLocked: boolean;
	readonly lastAction: string | null;
};

/** Pont IPC dédié à l'overlay transparent sans perte de focus. */
export type SystemOverlayBridge = {
	toggle(): Promise<boolean>;
	pressKey(key: string): void;
	close(): void;
	moveBy(deltaX: number, deltaY: number): void;
	resetPosition(): void;
	updateHud(state: OverlayHudState): void;
	subscribeHud(listener: (state: OverlayHudState) => void): () => void;
	subscribeFeedback(listener: (action: string) => void): () => void;
};
