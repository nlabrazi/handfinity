import electron = require("electron");

import type {
	PointerControlState,
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

electron.contextBridge.exposeInMainWorld("handfinityPointer", bridge);
