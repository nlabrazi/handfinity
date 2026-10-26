import {
	type BrowserWindow,
	type IpcMainEvent,
	type IpcMainInvokeEvent,
	ipcMain,
} from "electron";
import { isAppUrl } from "./application-policy.js";
import type { PointerControlState } from "./pointer-contract.js";

export const POINTER_STATE_CHANNEL = "handfinity:pointer:state";

type PointerController = {
	getState(): PointerControlState;
	enable(): Promise<PointerControlState>;
	disable(): PointerControlState;
	submit(update: unknown): void;
};

/** Seule la frame principale de la fenêtre locale peut contrôler le pointeur. */
export function registerPointerIpc(
	getWindow: () => BrowserWindow | null,
	controller: PointerController,
): () => void {
	function trusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
		const window = getWindow();
		if (!window || window.isDestroyed()) return false;
		const contents = window.webContents;
		const frame = event.senderFrame;
		return (
			!contents.isDestroyed() &&
			event.sender === contents &&
			frame !== null &&
			frame === contents.mainFrame &&
			frame.origin === "handfinity://app" &&
			isAppUrl(frame.url)
		);
	}

	function assertTrusted(event: IpcMainInvokeEvent) {
		if (!trusted(event)) throw new Error("Untrusted pointer IPC source");
	}

	ipcMain.handle("handfinity:pointer:get-state", (event) => {
		assertTrusted(event);
		return controller.getState();
	});
	ipcMain.handle("handfinity:pointer:enable", (event) => {
		assertTrusted(event);
		return controller.enable();
	});
	ipcMain.handle("handfinity:pointer:disable", (event) => {
		assertTrusted(event);
		return controller.disable();
	});
	const update = (event: IpcMainEvent, payload: unknown) => {
		if (trusted(event)) controller.submit(payload);
	};
	ipcMain.on("handfinity:pointer:update", update);

	return () => {
		ipcMain.removeHandler("handfinity:pointer:get-state");
		ipcMain.removeHandler("handfinity:pointer:enable");
		ipcMain.removeHandler("handfinity:pointer:disable");
		ipcMain.removeListener("handfinity:pointer:update", update);
	};
}
