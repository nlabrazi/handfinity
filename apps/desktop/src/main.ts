import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
	app,
	BrowserWindow,
	dialog,
	globalShortcut,
	net,
	protocol,
	screen,
	session,
} from "electron";
import {
	APP_SCHEME,
	APP_URL,
	allowCameraCheck,
	allowCameraRequest,
	isAppUrl,
	resolveRendererFile,
} from "./application-policy.js";
import {
	createDesktopOverlay,
	type DesktopOverlay,
} from "./desktop-overlay.js";
import { createDesktopTray, type DesktopTray } from "./desktop-tray.js";
import { createPointerController } from "./pointer-controller.js";
import { POINTER_STATE_CHANNEL, registerPointerIpc } from "./pointer-ipc.js";
import { createWindowsPointer } from "./windows-pointer.js";
import { configureWindowsTracking } from "./windows-tracking-performance.js";

protocol.registerSchemesAsPrivileged([
	{
		scheme: APP_SCHEME,
		privileges: { standard: true, secure: true, supportFetchAPI: true },
	},
]);

app.setName("Handfinity");
// La vision reste une tâche interactive même lorsque sa fenêtre est réduite.
app.commandLine.appendSwitch("disable-renderer-backgrounding");
let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let tray: DesktopTray | null = null;
let overlay: DesktopOverlay | null = null;

async function start() {
	const stopShortcut = "Control+Alt+Escape";
	const windowsDriver = createWindowsPointer();
	const pointer = createPointerController({
		supported: process.platform === "win32",
		driver: windowsDriver,
		getBounds: () =>
			screen.dipToScreenRect(null, screen.getPrimaryDisplay().bounds),
		registerStop: (stop) => globalShortcut.register(stopShortcut, stop),
		unregisterStop: () => globalShortcut.unregister(stopShortcut),
		onState: (state) => {
			if (
				mainWindow &&
				!mainWindow.isDestroyed() &&
				!mainWindow.webContents.isDestroyed()
			)
				mainWindow.webContents.send(POINTER_STATE_CHANNEL, state);
			tray?.update();
		},
	});
	const disposePointerIpc = registerPointerIpc(() => mainWindow, pointer);
	const appSession = session.fromPartition("handfinity");

	overlay = createDesktopOverlay({
		session: appSession,
		preloadPath: join(import.meta.dirname, "preload.cjs"),
		onKeyPress: (key) => {
			const state = pointer.getState();
			if (state.sessionId !== null) {
				pointer.submit({
					sessionId: state.sessionId,
					capturedAt: performance.timeOrigin + performance.now(),
					paused: false,
					command: null,
					keys: [key],
				});
			} else if (windowsDriver.sendKey) {
				void windowsDriver.sendKey(key, performance.now() + 500);
			}
		},
	});

	tray = createDesktopTray({
		getWindow: () => mainWindow,
		getPointerState: () => pointer.getState(),
		onTogglePointer: async () => {
			const current = pointer.getState();
			if (current.phase === "disabled") {
				await pointer.enable();
			} else {
				pointer.disable();
			}
		},
		onToggleOverlay: () => {
			overlay?.toggle();
		},
		onQuit: () => {
			isQuitting = true;
			app.quit();
		},
	});

	app.on("before-quit", () => {
		isQuitting = true;
		pointer.disable();
		disposePointerIpc();
		tray?.destroy();
		tray = null;
		overlay?.destroy();
		overlay = null;
	});
	const rendererRoot = join(import.meta.dirname, "renderer");
	appSession.protocol.handle(APP_SCHEME, async (request) => {
		const file = resolveRendererFile(request.url, rendererRoot);
		if (!file) return new Response("Not found", { status: 404 });
		try {
			return await net.fetch(pathToFileURL(file).href);
		} catch {
			return new Response("Not found", { status: 404 });
		}
	});
	appSession.setPermissionCheckHandler(
		(contents, permission, origin, details) =>
			allowCameraCheck(
				permission,
				details.mediaType ?? "",
				contents !== null &&
					contents === mainWindow?.webContents &&
					details.isMainFrame &&
					isAppUrl(origin) &&
					isAppUrl(details.requestingUrl ?? "") &&
					isAppUrl(contents.getURL()),
			),
	);
	appSession.setPermissionRequestHandler(
		(contents, permission, callback, details) => {
			callback(
				allowCameraRequest(
					permission,
					"mediaTypes" in details ? (details.mediaTypes ?? []) : [],
					contents === mainWindow?.webContents &&
						details.isMainFrame &&
						isAppUrl(details.requestingUrl) &&
						isAppUrl(contents.getURL()),
				),
			);
		},
	);

	async function createWindow() {
		const window = new BrowserWindow({
			title: "Handfinity Desktop",
			show: false,
			width: 1280,
			height: 900,
			minWidth: 360,
			minHeight: 600,
			backgroundColor: "#020617",
			autoHideMenuBar: true,
			webPreferences: {
				session: appSession,
				preload: join(import.meta.dirname, "preload.cjs"),
				// La vidéo et les timers de suivi doivent continuer fenêtre réduite.
				backgroundThrottling: false,
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
			},
		});
		mainWindow = window;
		const preparation = new AbortController();
		let shown = false;
		let configuredPid: number | null = null;
		const pendingPreparations = new Map<number, Promise<void>>();
		async function prepareTracking(): Promise<void> {
			if (preparation.signal.aborted || window.isDestroyed()) return;
			const pid = window.webContents.getOSProcessId();
			if (pid === configuredPid) return;
			let pending = pendingPreparations.get(pid);
			if (!pending) {
				pending = configureWindowsTracking(pid, preparation.signal);
				pendingPreparations.set(pid, pending);
			}
			try {
				await pending;
			} catch (error) {
				if (preparation.signal.aborted || window.isDestroyed()) return;
				if (pid !== window.webContents.getOSProcessId())
					return prepareTracking();
				throw error;
			} finally {
				pendingPreparations.delete(pid);
			}
			if (preparation.signal.aborted || window.isDestroyed()) return;
			if (pid !== window.webContents.getOSProcessId()) return prepareTracking();
			configuredPid = pid;
		}
		window.webContents.on("dom-ready", () => {
			if (shown)
				void prepareTracking().catch((error) => {
					if (!preparation.signal.aborted) reportFailure(error);
				});
		});
		window.setMenu(null);
		window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		window.webContents.on("will-navigate", (event) => event.preventDefault());
		window.webContents.on("will-attach-webview", (event) =>
			event.preventDefault(),
		);
		window.webContents.on("did-start-navigation", (details) => {
			if (details.isMainFrame && !details.isSameDocument) pointer.disable();
		});
		window.webContents.on("render-process-gone", () => pointer.disable());
		window.webContents.on("destroyed", () => pointer.disable());
		window.on("show", () => tray?.update());
		window.on("hide", () => tray?.update());
		window.on("minimize", () => tray?.update());
		window.on("restore", () => tray?.update());
		window.on("close", (event) => {
			if (!isQuitting) {
				event.preventDefault();
				window.hide();
				tray?.update();
			}
		});
		window.on("closed", () => {
			preparation.abort();
			if (mainWindow === window) mainWindow = null;
			pointer.disable();
			tray?.update();
		});
		try {
			await window.loadURL(APP_URL);
			await prepareTracking();
			if (!preparation.signal.aborted && !window.isDestroyed()) {
				shown = true;
				window.show();
			}
		} catch (error) {
			if (!preparation.signal.aborted) throw error;
		}
	}

	await createWindow();
	app.on("activate", () => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.show();
			mainWindow.focus();
		} else {
			void createWindow().catch(reportFailure);
		}
	});
}

function reportFailure(error: unknown) {
	dialog.showErrorBox(
		"Handfinity could not start",
		error instanceof Error ? error.message : String(error),
	);
	app.quit();
}

app.on("window-all-closed", () => app.quit());
void app.whenReady().then(start).catch(reportFailure);
