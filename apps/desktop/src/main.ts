import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, net, protocol, session } from "electron";
import {
	APP_SCHEME,
	APP_URL,
	allowCameraCheck,
	allowCameraRequest,
	isAppUrl,
	resolveRendererFile,
} from "./application-policy.js";

protocol.registerSchemesAsPrivileged([
	{
		scheme: APP_SCHEME,
		privileges: { standard: true, secure: true, supportFetchAPI: true },
	},
]);

app.setName("Handfinity");
let mainWindow: BrowserWindow | null = null;

async function start() {
	const appSession = session.fromPartition("handfinity");
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
			width: 1280,
			height: 900,
			minWidth: 360,
			minHeight: 600,
			backgroundColor: "#020617",
			autoHideMenuBar: true,
			webPreferences: {
				session: appSession,
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
			},
		});
		mainWindow = window;
		window.setMenu(null);
		window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		window.webContents.on("will-navigate", (event) => event.preventDefault());
		window.webContents.on("will-attach-webview", (event) =>
			event.preventDefault(),
		);
		window.on("closed", () => {
			if (mainWindow === window) mainWindow = null;
		});
		await window.loadURL(APP_URL);
	}

	await createWindow();
	app.on("activate", () => {
		if (!mainWindow) void createWindow().catch(reportFailure);
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
