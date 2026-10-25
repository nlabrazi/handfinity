import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
	const window = {
		setMenu: vi.fn(),
		loadURL: vi.fn().mockResolvedValue(undefined),
		on: vi.fn<(event: string, listener: () => void) => void>(),
		webContents: {
			setWindowOpenHandler: vi.fn(),
			on: vi.fn<
				(
					event: string,
					listener: (event: { preventDefault(): void }) => void,
				) => void
			>(),
		},
	};
	return {
		window,
		BrowserWindow: vi.fn(
			class {
				constructor(_options: unknown) {
					Object.assign(this, window);
				}
			},
		),
		app: {
			setName: vi.fn(),
			whenReady: vi.fn().mockResolvedValue(undefined),
			on: vi.fn<(event: string, listener: () => void) => void>(),
			quit: vi.fn(),
		},
		appSession: {
			protocol: { handle: vi.fn() },
			setPermissionCheckHandler: vi.fn(),
			setPermissionRequestHandler: vi.fn(),
		},
	};
});

vi.mock("electron", () => ({
	app: electron.app,
	BrowserWindow: electron.BrowserWindow,
	session: { fromPartition: vi.fn(() => electron.appSession) },
	protocol: { registerSchemesAsPrivileged: vi.fn() },
	net: { fetch: vi.fn() },
	dialog: { showErrorBox: vi.fn() },
}));

beforeEach(async () => {
	vi.clearAllMocks();
	vi.resetModules();
	await import("./main");
	await vi.waitFor(() =>
		expect(electron.window.loadURL).toHaveBeenCalledWith("handfinity://app/"),
	);
});

describe("Desktop background tracking lifecycle", () => {
	it("disables throttling at window creation while preserving renderer protections", () => {
		expect(electron.BrowserWindow).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				webPreferences: expect.objectContaining({
					session: electron.appSession,
					backgroundThrottling: false,
					nodeIntegration: false,
					contextIsolation: true,
					sandbox: true,
				}),
			}),
		);
	});

	it("keeps navigation, extra windows and webviews blocked", () => {
		const openWindow =
			electron.window.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
		expect(openWindow()).toEqual({ action: "deny" });
		for (const eventName of ["will-navigate", "will-attach-webview"]) {
			const listener = electron.window.webContents.on.mock.calls.find(
				([name]) => name === eventName,
			)?.[1];
			const event = { preventDefault: vi.fn() };
			expect(listener).toBeDefined();
			listener?.(event);
			expect(event.preventDefault).toHaveBeenCalledOnce();
		}
	});

	it("quits when the last window is closed", () => {
		const closeLastWindow = electron.app.on.mock.calls.find(
			([name]) => name === "window-all-closed",
		)?.[1];
		expect(electron.app.quit).not.toHaveBeenCalled();
		expect(closeLastWindow).toBeDefined();
		closeLastWindow?.();
		expect(electron.app.quit).toHaveBeenCalledOnce();
	});
});
