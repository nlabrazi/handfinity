import {
	BrowserWindow,
	type IpcMainEvent,
	type IpcMainInvokeEvent,
	ipcMain,
	type Session,
	screen,
} from "electron";
import { APP_URL, isAppUrl } from "./application-policy.js";

export const OVERLAY_FEEDBACK_CHANNEL = "handfinity:overlay:feedback";

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
		const height = 370;
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
		win.setAlwaysOnTop(true, "screen-saver");
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

	ipcMain.handle("handfinity:overlay:toggle", onToggle);
	ipcMain.on("handfinity:overlay:close", onClose);
	ipcMain.on("handfinity:overlay:press-key", onPressKey);

	function show() {
		const win = getOrCreateWindow();
		visible = true;
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

	function destroy() {
		ipcMain.removeHandler("handfinity:overlay:toggle");
		ipcMain.removeListener("handfinity:overlay:close", onClose);
		ipcMain.removeListener("handfinity:overlay:press-key", onPressKey);
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
		destroy,
	};
}
