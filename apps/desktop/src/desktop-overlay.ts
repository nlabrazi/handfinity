import {
	BrowserWindow,
	type IpcMainEvent,
	type IpcMainInvokeEvent,
	ipcMain,
	type Session,
	screen,
} from "electron";
import { APP_URL, isAppUrl } from "./application-policy.js";
import type { OverlayHudState } from "./pointer-contract.js";

export const OVERLAY_FEEDBACK_CHANNEL = "handfinity:overlay:feedback";
export const OVERLAY_HUD_CHANNEL = "handfinity:overlay:hud-state";

export interface DesktopOverlayOptions {
	session: Session;
	preloadPath: string;
	onKeyPress(key: string): void;
}

export interface DesktopOverlay {
	readonly window: BrowserWindow;
	readonly keyboardWindow: BrowserWindow;
	readonly hudWindow: BrowserWindow;
	show(): void;
	hide(): void;
	toggle(): boolean;
	isVisible(): boolean;
	showHud(): void;
	hideHud(): void;
	toggleHud(): boolean;
	isHudVisible(): boolean;
	sendActionFeedback(action: string): void;
	sendHudState(state: OverlayHudState): void;
	moveBy(deltaX: number, deltaY: number): void;
	resetPosition(): void;
	destroy(): void;
}

export function createDesktopOverlay(
	options: DesktopOverlayOptions,
): DesktopOverlay {
	let keyboardWindow: BrowserWindow | null = null;
	let hudWindow: BrowserWindow | null = null;
	let keyboardVisible = false;
	let hudVisible = false;
	let hudDismissed = false;

	function getOrCreateKeyboardWindow(): BrowserWindow {
		if (keyboardWindow && !keyboardWindow.isDestroyed()) return keyboardWindow;

		const primary = screen.getPrimaryDisplay();
		const bounds = primary.workArea ??
			primary.bounds ?? { x: 0, y: 0, width: 1280, height: 720 };
		const width = Math.min(860, Math.max(360, bounds.width - 40));
		const height = 280;
		const x = Math.round(bounds.x + (bounds.width - width) / 2);
		const y = Math.round(bounds.y + bounds.height - height - 20);

		const win = new BrowserWindow({
			title: "Handfinity Overlay",
			show: false,
			width,
			height,
			x,
			y,
			frame: false,
			transparent: true,
			alwaysOnTop: true,
			focusable: false,
			skipTaskbar: true,
			resizable: false,
			hasShadow: false,
			backgroundColor: "#00000000",
			autoHideMenuBar: true,
			type: "toolbar",
			webPreferences: {
				session: options.session,
				preload: options.preloadPath,
				backgroundThrottling: false,
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
			},
		});

		win.setMenu(null);
		win.setAlwaysOnTop(true, "screen-saver", 1);
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		win.webContents.on("will-navigate", (event) => event.preventDefault());
		win.webContents.on("will-attach-webview", (event) =>
			event.preventDefault(),
		);

		void win.loadURL(`${APP_URL}?view=overlay#overlay`);

		win.on("closed", () => {
			if (keyboardWindow === win) {
				keyboardWindow = null;
				keyboardVisible = false;
			}
		});

		keyboardWindow = win;
		return win;
	}

	function getOrCreateHudWindow(): BrowserWindow {
		if (hudWindow && !hudWindow.isDestroyed()) return hudWindow;

		const primary = screen.getPrimaryDisplay();
		const bounds = primary.workArea ??
			primary.bounds ?? { x: 0, y: 0, width: 1280, height: 720 };
		const width = Math.min(500, Math.max(360, bounds.width - 40));
		const height = 90;
		const x = Math.round(bounds.x + (bounds.width - width) / 2);
		const y = Math.round(bounds.y + 16);

		const win = new BrowserWindow({
			title: "Handfinity HUD",
			show: false,
			width,
			height,
			x,
			y,
			frame: false,
			transparent: true,
			alwaysOnTop: true,
			focusable: false,
			skipTaskbar: true,
			resizable: false,
			hasShadow: false,
			backgroundColor: "#00000000",
			autoHideMenuBar: true,
			type: "toolbar",
			webPreferences: {
				session: options.session,
				preload: options.preloadPath,
				backgroundThrottling: false,
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
			},
		});

		win.setMenu(null);
		win.setAlwaysOnTop(true, "screen-saver", 1);
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		win.webContents.on("will-navigate", (event) => event.preventDefault());
		win.webContents.on("will-attach-webview", (event) =>
			event.preventDefault(),
		);

		void win.loadURL(`${APP_URL}?view=hud#hud`);

		win.on("closed", () => {
			if (hudWindow === win) {
				hudWindow = null;
				hudVisible = false;
			}
		});

		hudWindow = win;
		return win;
	}

	function isTrusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
		const frame = event.senderFrame;
		if (!frame) return false;
		return isAppUrl(frame.url);
	}

	function moveWindowBy(
		win: BrowserWindow | null,
		deltaX: number,
		deltaY: number,
	) {
		if (win && !win.isDestroyed()) {
			const [curX, curY] = win.getPosition();
			win.setPosition(Math.round(curX + deltaX), Math.round(curY + deltaY));
		}
	}

	function resetWindowPosition(target?: BrowserWindow | null) {
		const primary = screen.getPrimaryDisplay();
		const bounds = primary.workArea ??
			primary.bounds ?? { x: 0, y: 0, width: 1280, height: 720 };

		if (target === hudWindow && hudWindow && !hudWindow.isDestroyed()) {
			const width = Math.min(500, Math.max(360, bounds.width - 40));
			const height = 90;
			const x = Math.round(bounds.x + (bounds.width - width) / 2);
			const y = Math.round(bounds.y + 16);
			hudWindow.setBounds({ x, y, width, height });
		} else {
			const win = keyboardWindow;
			if (win && !win.isDestroyed()) {
				const width = Math.min(860, Math.max(360, bounds.width - 40));
				const height = 280;
				const x = Math.round(bounds.x + (bounds.width - width) / 2);
				const y = Math.round(bounds.y + bounds.height - height - 20);
				win.setBounds({ x, y, width, height });
			}
		}
	}

	const onToggle = () => toggle();
	const onClose = (event: IpcMainEvent) => {
		if (!isTrusted(event)) return;
		if (event.sender === hudWindow?.webContents) {
			hideHud();
			hudDismissed = true;
		} else {
			hide();
		}
	};
	const onPressKey = (event: IpcMainEvent, key: unknown) => {
		if (
			isTrusted(event) &&
			typeof key === "string" &&
			key.length > 0 &&
			key.length <= 32
		) {
			options.onKeyPress(key);
		}
	};
	const onMoveBy = (event: IpcMainEvent, payload: unknown) => {
		if (
			isTrusted(event) &&
			payload &&
			typeof payload === "object" &&
			"deltaX" in payload &&
			"deltaY" in payload
		) {
			const { deltaX, deltaY } = payload as { deltaX: number; deltaY: number };
			if (Number.isFinite(deltaX) && Number.isFinite(deltaY)) {
				const target =
					event.sender === hudWindow?.webContents
						? hudWindow
						: getOrCreateKeyboardWindow();
				moveWindowBy(target, deltaX, deltaY);
			}
		}
	};
	const onResetPosition = (event: IpcMainEvent) => {
		if (!isTrusted(event)) return;
		const target =
			event.sender === hudWindow?.webContents
				? hudWindow
				: getOrCreateKeyboardWindow();
		resetWindowPosition(target);
	};
	const onUpdateHud = (event: IpcMainEvent, state: unknown) => {
		if (isTrusted(event) && state && typeof state === "object") {
			const hud = state as OverlayHudState;
			sendHudState(hud);
			if (
				!hudDismissed &&
				(hud.phase === "moving" ||
					hud.phase === "waiting" ||
					hud.phase === "paused")
			) {
				if (!hudVisible) {
					showHud();
				}
			} else if (hud.phase === "disabled" && hudVisible) {
				hideHud();
			}
		}
	};

	ipcMain.handle("handfinity:overlay:toggle", onToggle);
	ipcMain.on("handfinity:overlay:close", onClose);
	ipcMain.on("handfinity:overlay:press-key", onPressKey);
	ipcMain.on("handfinity:overlay:move-by", onMoveBy);
	ipcMain.on("handfinity:overlay:reset-position", onResetPosition);
	ipcMain.on("handfinity:overlay:update-hud", onUpdateHud);

	function show() {
		const win = getOrCreateKeyboardWindow();
		keyboardVisible = true;
		win.setAlwaysOnTop(true, "screen-saver", 1);
		win.moveTop();
		win.showInactive();
	}

	function hide() {
		if (keyboardWindow && !keyboardWindow.isDestroyed()) {
			keyboardWindow.hide();
		}
		keyboardVisible = false;
	}

	function toggle(): boolean {
		if (keyboardVisible) {
			hide();
			return false;
		}
		show();
		return true;
	}

	function isVisible(): boolean {
		return (
			keyboardVisible &&
			keyboardWindow !== null &&
			!keyboardWindow.isDestroyed() &&
			keyboardWindow.isVisible()
		);
	}

	function showHud() {
		const win = getOrCreateHudWindow();
		hudVisible = true;
		hudDismissed = false;
		win.setAlwaysOnTop(true, "screen-saver", 1);
		win.moveTop();
		win.showInactive();
	}

	function hideHud() {
		if (hudWindow && !hudWindow.isDestroyed()) {
			hudWindow.hide();
		}
		hudVisible = false;
	}

	function toggleHud(): boolean {
		if (hudVisible) {
			hideHud();
			hudDismissed = true;
			return false;
		}
		showHud();
		return true;
	}

	function isHudVisible(): boolean {
		return (
			hudVisible &&
			hudWindow !== null &&
			!hudWindow.isDestroyed() &&
			hudWindow.isVisible()
		);
	}

	function sendActionFeedback(action: string) {
		if (
			hudWindow &&
			!hudWindow.isDestroyed() &&
			!hudWindow.webContents.isDestroyed()
		) {
			hudWindow.webContents.send(OVERLAY_FEEDBACK_CHANNEL, action);
		}
		if (
			keyboardWindow &&
			!keyboardWindow.isDestroyed() &&
			!keyboardWindow.webContents.isDestroyed()
		) {
			keyboardWindow.webContents.send(OVERLAY_FEEDBACK_CHANNEL, action);
		}
	}

	function sendHudState(state: OverlayHudState) {
		if (
			hudWindow &&
			!hudWindow.isDestroyed() &&
			!hudWindow.webContents.isDestroyed()
		) {
			hudWindow.webContents.send(OVERLAY_HUD_CHANNEL, state);
		}
		if (
			keyboardWindow &&
			!keyboardWindow.isDestroyed() &&
			!keyboardWindow.webContents.isDestroyed()
		) {
			keyboardWindow.webContents.send(OVERLAY_HUD_CHANNEL, state);
		}
	}

	function destroy() {
		ipcMain.removeHandler("handfinity:overlay:toggle");
		ipcMain.removeListener("handfinity:overlay:close", onClose);
		ipcMain.removeListener("handfinity:overlay:press-key", onPressKey);
		ipcMain.removeListener("handfinity:overlay:move-by", onMoveBy);
		ipcMain.removeListener(
			"handfinity:overlay:reset-position",
			onResetPosition,
		);
		ipcMain.removeListener("handfinity:overlay:update-hud", onUpdateHud);

		if (keyboardWindow && !keyboardWindow.isDestroyed()) {
			keyboardWindow.destroy();
			keyboardWindow = null;
		}
		if (hudWindow && !hudWindow.isDestroyed()) {
			hudWindow.destroy();
			hudWindow = null;
		}
		keyboardVisible = false;
		hudVisible = false;
	}

	return {
		get window() {
			return getOrCreateKeyboardWindow();
		},
		get keyboardWindow() {
			return getOrCreateKeyboardWindow();
		},
		get hudWindow() {
			return getOrCreateHudWindow();
		},
		show,
		hide,
		toggle,
		isVisible,
		showHud,
		hideHud,
		toggleHud,
		isHudVisible,
		sendActionFeedback,
		sendHudState,
		moveBy(deltaX: number, deltaY: number) {
			moveWindowBy(keyboardWindow, deltaX, deltaY);
		},
		resetPosition() {
			resetWindowPosition(keyboardWindow);
		},
		destroy,
	};
}
