import electron = require("electron");

import type {
	OverlayHudState,
	PointerControlState,
	SystemOverlayBridge,
	SystemPointerBridge,
} from "./pointer-contract.js" with { "resolution-mode": "import" };

const bridge: SystemPointerBridge = {
	getState: () => electron.ipcRenderer.invoke("handfinity:pointer:get-state"),
	enable: () => electron.ipcRenderer.invoke("handfinity:pointer:enable"),
	disable: () => electron.ipcRenderer.invoke("handfinity:pointer:disable"),
	submit: (update) =>
		electron.ipcRenderer.send("handfinity:pointer:update", update),
	subscribe(listener) {
		if (typeof listener !== "function") {
			throw new TypeError("A pointer state listener is required");
		}
		const receive = (
			_event: electron.IpcRendererEvent,
			state: PointerControlState,
		) => listener(state);
		electron.ipcRenderer.on("handfinity:pointer:state", receive);
		return () => {
			electron.ipcRenderer.removeListener("handfinity:pointer:state", receive);
		};
	},
};

const overlayBridge: SystemOverlayBridge = {
	toggle: () => electron.ipcRenderer.invoke("handfinity:overlay:toggle"),
	pressKey: (key: string) =>
		electron.ipcRenderer.send("handfinity:overlay:press-key", key),
	close: () => electron.ipcRenderer.send("handfinity:overlay:close"),
	moveBy: (deltaX: number, deltaY: number) =>
		electron.ipcRenderer.send("handfinity:overlay:move-by", { deltaX, deltaY }),
	resetPosition: () =>
		electron.ipcRenderer.send("handfinity:overlay:reset-position"),
	updateHud: (state: OverlayHudState) =>
		electron.ipcRenderer.send("handfinity:overlay:update-hud", state),
	subscribeHud(listener) {
		if (typeof listener !== "function") {
			throw new TypeError("A HUD state listener is required");
		}
		const receive = (
			_event: electron.IpcRendererEvent,
			state: OverlayHudState,
		) => listener(state);
		electron.ipcRenderer.on("handfinity:overlay:hud-state", receive);
		return () => {
			electron.ipcRenderer.removeListener(
				"handfinity:overlay:hud-state",
				receive,
			);
		};
	},
	subscribeFeedback(listener) {
		if (typeof listener !== "function") {
			throw new TypeError("A feedback listener is required");
		}
		const receive = (_event: electron.IpcRendererEvent, action: string) =>
			listener(action);
		electron.ipcRenderer.on("handfinity:overlay:feedback", receive);
		return () => {
			electron.ipcRenderer.removeListener(
				"handfinity:overlay:feedback",
				receive,
			);
		};
	},
};

electron.contextBridge.exposeInMainWorld("handfinityPointer", bridge);
electron.contextBridge.exposeInMainWorld("handfinityOverlay", overlayBridge);
