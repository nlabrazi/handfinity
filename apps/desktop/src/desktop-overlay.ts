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
	show(): void;
	hide(): void;
	toggle(): boolean;
	isVisible(): boolean;
	sendActionFeedback(action: string): void;
	sendHudState(state: OverlayHudState): void;
	moveBy(deltaX: number, deltaY: number): void;
	resetPosition(): void;
	destroy(): void;
}

export function createDesktopOverlay(
	options: DesktopOverlayOptions,
): DesktopOverlay {
	let overlayWindow: BrowserWindow | null = null;
	let visible = false;

	function getOrCreateWindow(): BrowserWindow {
		if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow;

		const primary = screen.getPrimaryDisplay();
		const bounds = primary.workArea ??
			primary.bounds ?? { x: 0, y: 0, width: 1280, height: 720 };
		const width = Math.min(880, Math.max(360, bounds.width - 40));
		const height = 440;
		const x = Math.round(bounds.x + (bounds.width - width) / 2);
		const y = Math.round(bounds.y + bounds.height - height - 16);

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
			if (overlayWindow === win) {
				overlayWindow = null;
				visible = false;
			}
		});

		overlayWindow = win;
		return win;
	}

	function isTrusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
		const frame = event.senderFrame;
		return (
			frame !== null &&
			frame.origin === "handfinity://app" &&
			isAppUrl(frame.url)
		);
	}

	function moveBy(deltaX: number, deltaY: number) {
		if (overlayWindow && !overlayWindow.isDestroyed()) {
			const [curX, curY] = overlayWindow.getPosition();
			overlayWindow.setPosition(
				Math.round(curX + deltaX),
				Math.round(curY + deltaY),
			);
		}
	}

	function resetPosition() {
		if (overlayWindow && !overlayWindow.isDestroyed()) {
			const primary = screen.getPrimaryDisplay();
			const bounds = primary.workArea ??
				primary.bounds ?? { x: 0, y: 0, width: 1280, height: 720 };
			const width = Math.min(880, Math.max(360, bounds.width - 40));
			const height = 440;
			const x = Math.round(bounds.x + (bounds.width - width) / 2);
			const y = Math.round(bounds.y + bounds.height - height - 16);
			overlayWindow.setBounds({ x, y, width, height });
		}
	}

	const onToggle = () => toggle();
	const onClose = (event: IpcMainEvent) => {
		if (isTrusted(event)) hide();
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
				moveBy(deltaX, deltaY);
			}
		}
	};
	const onResetPosition = (event: IpcMainEvent) => {
		if (isTrusted(event)) resetPosition();
	};
	const onUpdateHud = (event: IpcMainEvent, state: unknown) => {
		if (isTrusted(event) && state && typeof state === "object") {
			sendHudState(state as OverlayHudState);
		}
	};

	ipcMain.handle("handfinity:overlay:toggle", onToggle);
	ipcMain.on("handfinity:overlay:close", onClose);
	ipcMain.on("handfinity:overlay:press-key", onPressKey);
	ipcMain.on("handfinity:overlay:move-by", onMoveBy);
	ipcMain.on("handfinity:overlay:reset-position", onResetPosition);
	ipcMain.on("handfinity:overlay:update-hud", onUpdateHud);

	function show() {
		const win = getOrCreateWindow();
		visible = true;
		win.setAlwaysOnTop(true, "screen-saver", 1);
		win.moveTop();
		win.showInactive();
	}

	function hide() {
		if (overlayWindow && !overlayWindow.isDestroyed()) {
			overlayWindow.hide();
		}
		visible = false;
	}

	function toggle(): boolean {
		if (visible) {
			hide();
			return false;
		}
		show();
		return true;
	}

	function isVisible(): boolean {
		return (
			visible &&
			overlayWindow !== null &&
			!overlayWindow.isDestroyed() &&
			overlayWindow.isVisible()
		);
	}

	function sendActionFeedback(action: string) {
		if (
			overlayWindow &&
			!overlayWindow.isDestroyed() &&
			!overlayWindow.webContents.isDestroyed()
		) {
			overlayWindow.webContents.send(OVERLAY_FEEDBACK_CHANNEL, action);
		}
	}

	function sendHudState(state: OverlayHudState) {
		if (
			overlayWindow &&
			!overlayWindow.isDestroyed() &&
			!overlayWindow.webContents.isDestroyed()
		) {
			overlayWindow.webContents.send(OVERLAY_HUD_CHANNEL, state);
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
		if (overlayWindow && !overlayWindow.isDestroyed()) {
			overlayWindow.destroy();
			overlayWindow = null;
		}
		visible = false;
	}

	return {
		get window() {
			return getOrCreateWindow();
		},
		show,
		hide,
		toggle,
		isVisible,
		sendActionFeedback,
		sendHudState,
		moveBy,
		resetPosition,
		destroy,
	};
}
