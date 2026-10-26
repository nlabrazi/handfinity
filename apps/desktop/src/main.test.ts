import { isAbsolute } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PointerControlState } from "./pointer-contract";

type PointerOptions = {
	getBounds(): { x: number; y: number; width: number; height: number };
	registerStop(stop: () => void): boolean;
	unregisterStop(): void;
	onState(state: PointerControlState): void;
};

const electron = vi.hoisted(() => {
	const window = {
		setMenu: vi.fn(),
		show: vi.fn(),
		loadURL: vi.fn().mockResolvedValue(undefined),
		isDestroyed: vi.fn(() => false),
		on: vi.fn<
			(event: string, listener: (...args: unknown[]) => void) => void
		>(),
		webContents: {
			mainFrame: { origin: "handfinity://app", url: "handfinity://app/" },
			getURL: vi.fn(() => "handfinity://app/"),
			getOSProcessId: vi.fn(() => 321),
			isDestroyed: vi.fn(() => false),
			send: vi.fn(),
			setWindowOpenHandler: vi.fn(),
			on: vi.fn<
				(event: string, listener: (...args: unknown[]) => void) => void
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
			commandLine: { appendSwitch: vi.fn() },
			whenReady: vi.fn().mockResolvedValue(undefined),
			on: vi.fn<
				(event: string, listener: (...args: unknown[]) => void) => void
			>(),
			quit: vi.fn(),
		},
		appSession: {
			protocol: { handle: vi.fn() },
			setPermissionCheckHandler: vi.fn(),
			setPermissionRequestHandler: vi.fn(),
		},
		ipcMain: {
			handle: vi.fn(),
			on: vi.fn(),
			removeHandler: vi.fn(),
			removeListener: vi.fn(),
		},
		screen: {
			getPrimaryDisplay: vi.fn(() => ({
				bounds: { x: 0, y: 0, width: 1280, height: 720 },
			})),
			dipToScreenRect: vi.fn(() => ({
				x: 0,
				y: 0,
				width: 1920,
				height: 1080,
			})),
		},
		globalShortcut: {
			register: vi.fn(() => true),
			unregister: vi.fn(),
		},
		dialog: { showErrorBox: vi.fn() },
	};
});

const configureTracking = vi.hoisted(() =>
	vi.fn().mockResolvedValue(undefined),
);

const pointer = vi.hoisted(() => {
	const state = { phase: "disabled", sessionId: null, error: null };
	const controller = {
		getState: vi.fn(() => state),
		enable: vi.fn(async () => state),
		disable: vi.fn(() => state),
		submit: vi.fn(),
	};
	return {
		controller,
		create: vi.fn<(options: PointerOptions) => typeof controller>(
			() => controller,
		),
		driver: { start: vi.fn(), move: vi.fn(), stop: vi.fn() },
	};
});

vi.mock("electron", () => ({
	app: electron.app,
	BrowserWindow: electron.BrowserWindow,
	session: { fromPartition: vi.fn(() => electron.appSession) },
	protocol: { registerSchemesAsPrivileged: vi.fn() },
	net: { fetch: vi.fn() },
	dialog: electron.dialog,
	ipcMain: electron.ipcMain,
	screen: electron.screen,
	globalShortcut: electron.globalShortcut,
}));
vi.mock("./pointer-controller", () => ({
	createPointerController: pointer.create,
}));
vi.mock("./windows-pointer", () => ({
	createWindowsPointer: () => pointer.driver,
}));
vi.mock("./windows-tracking-performance", () => ({
	configureWindowsTracking: configureTracking,
}));

beforeEach(async () => {
	vi.clearAllMocks();
	vi.resetModules();
	electron.window.isDestroyed.mockReturnValue(false);
	electron.window.webContents.isDestroyed.mockReturnValue(false);
	electron.window.webContents.getOSProcessId.mockReturnValue(321);
	configureTracking.mockResolvedValue(undefined);
	await import("./main");
	await vi.waitFor(() => expect(electron.window.show).toHaveBeenCalledOnce());
});

function emit(
	listeners: readonly (readonly [string, (...args: unknown[]) => void])[],
	event: string,
	...args: unknown[]
) {
	for (const [name, listener] of listeners) {
		if (name === event) listener(...args);
	}
}

function options() {
	const value = pointer.create.mock.calls[0]?.[0];
	if (!value) throw new Error("Pointer controller was not created");
	return value;
}

describe("Desktop background tracking lifecycle", () => {
	it("prepares only its renderer before showing the window", () => {
		expect(electron.window.loadURL).toHaveBeenCalledWith("handfinity://app/");
		expect(electron.BrowserWindow).toHaveBeenCalledWith(
			expect.objectContaining({ show: false }),
		);
		expect(configureTracking).toHaveBeenCalledExactlyOnceWith(
			321,
			expect.any(AbortSignal),
		);
		expect(configureTracking.mock.invocationCallOrder[0]).toBeLessThan(
			electron.window.show.mock.invocationCallOrder[0] ?? 0,
		);
	});

	it("prepares a new renderer after reload without repeating work for the same process", async () => {
		emit(electron.window.webContents.on.mock.calls, "dom-ready");
		expect(configureTracking).toHaveBeenCalledTimes(1);
		electron.window.webContents.getOSProcessId.mockReturnValue(654);
		emit(electron.window.webContents.on.mock.calls, "dom-ready");
		await vi.waitFor(() => expect(configureTracking).toHaveBeenCalledTimes(2));
		expect(configureTracking.mock.lastCall?.[0]).toBe(654);
		expect(electron.window.show).toHaveBeenCalledOnce();
	});

	it("aborts preparation when closing and ignores its cancellation error", async () => {
		let rejectPreparation!: (error: Error) => void;
		configureTracking.mockImplementationOnce(
			() =>
				new Promise((_, reject) => {
					rejectPreparation = reject;
				}),
		);
		electron.window.webContents.getOSProcessId.mockReturnValue(654);
		emit(electron.window.webContents.on.mock.calls, "dom-ready");
		const signal = configureTracking.mock.lastCall?.[1] as AbortSignal;
		emit(electron.window.on.mock.calls, "closed");
		expect(signal.aborted).toBe(true);
		rejectPreparation(new Error("Cancelled"));
		await Promise.resolve();
		await Promise.resolve();
		expect(electron.dialog.showErrorBox).not.toHaveBeenCalled();
	});

	it("shares pending preparation and ignores an obsolete renderer failure", async () => {
		let rejectOldRenderer!: (error: Error) => void;
		let resolveNewRenderer!: () => void;
		configureTracking
			.mockImplementationOnce(
				() =>
					new Promise((_, reject) => {
						rejectOldRenderer = reject;
					}),
			)
			.mockImplementationOnce(
				() =>
					new Promise<void>((resolve) => {
						resolveNewRenderer = resolve;
					}),
			);
		electron.window.webContents.getOSProcessId.mockReturnValue(654);
		emit(electron.window.webContents.on.mock.calls, "dom-ready");
		emit(electron.window.webContents.on.mock.calls, "dom-ready");
		expect(configureTracking).toHaveBeenCalledTimes(2);
		electron.window.webContents.getOSProcessId.mockReturnValue(987);
		emit(electron.window.webContents.on.mock.calls, "dom-ready");
		rejectOldRenderer(new Error("Old renderer exited"));
		await Promise.resolve();
		expect(configureTracking).toHaveBeenCalledTimes(3);
		resolveNewRenderer();
		await Promise.resolve();
		await Promise.resolve();
		expect(configureTracking.mock.lastCall?.[0]).toBe(987);
		expect(electron.dialog.showErrorBox).not.toHaveBeenCalled();
		expect(electron.app.quit).not.toHaveBeenCalled();
	});

	it("reports a performance setup failure instead of silently claiming readiness", async () => {
		configureTracking.mockRejectedValueOnce(new Error("Windows setup failed"));
		electron.window.webContents.getOSProcessId.mockReturnValue(654);
		emit(electron.window.webContents.on.mock.calls, "dom-ready");
		await vi.waitFor(() =>
			expect(electron.dialog.showErrorBox).toHaveBeenCalledWith(
				"Handfinity could not start",
				"Windows setup failed",
			),
		);
		expect(electron.app.quit).toHaveBeenCalledOnce();
	});

	it("keeps renderer priority before Electron starts its processes", () => {
		expect(
			electron.app.commandLine.appendSwitch,
		).toHaveBeenCalledExactlyOnceWith("disable-renderer-backgrounding");
		expect(
			electron.app.commandLine.appendSwitch.mock.invocationCallOrder[0],
		).toBeLessThan(electron.app.whenReady.mock.invocationCallOrder[0] ?? 0);
	});

	it("disables throttling at window creation while preserving renderer protections", () => {
		expect(electron.BrowserWindow).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({
				webPreferences: expect.objectContaining({
					session: electron.appSession,
					preload: expect.stringMatching(/[\\/]preload\.cjs$/),
					backgroundThrottling: false,
					nodeIntegration: false,
					contextIsolation: true,
					sandbox: true,
				}),
			}),
		);
		const configuration = electron.BrowserWindow.mock.calls[0]?.[0] as {
			webPreferences: { preload: string };
		};
		expect(isAbsolute(configuration.webPreferences.preload)).toBe(true);
	});

	it("keeps navigation, extra windows and webviews blocked", () => {
		const openWindow =
			electron.window.webContents.setWindowOpenHandler.mock.calls[0]?.[0];
		expect(openWindow()).toEqual({ action: "deny" });
		for (const eventName of ["will-navigate", "will-attach-webview"]) {
			const event = { preventDefault: vi.fn() };
			emit(electron.window.webContents.on.mock.calls, eventName, event);
			expect(event.preventDefault).toHaveBeenCalledOnce();
		}
	});

	it("quits when the last window is closed", () => {
		expect(electron.app.quit).not.toHaveBeenCalled();
		emit(electron.app.on.mock.calls, "window-all-closed");
		expect(electron.app.quit).toHaveBeenCalledOnce();
	});
});

describe("Desktop system pointer integration", () => {
	it("uses physical primary-display bounds and registers the manual stop shortcut", () => {
		const configuration = options();
		expect(configuration.getBounds()).toEqual({
			x: 0,
			y: 0,
			width: 1920,
			height: 1080,
		});
		expect(electron.screen.dipToScreenRect).toHaveBeenCalledExactlyOnceWith(
			null,
			{ x: 0, y: 0, width: 1280, height: 720 },
		);
		const stop = vi.fn();
		expect(configuration.registerStop(stop)).toBe(true);
		expect(electron.globalShortcut.register).toHaveBeenCalledExactlyOnceWith(
			"Control+Alt+Escape",
			stop,
		);
		configuration.unregisterStop();
		expect(electron.globalShortcut.unregister).toHaveBeenCalledExactlyOnceWith(
			"Control+Alt+Escape",
		);
	});

	it("disables control only for main-frame document navigation", () => {
		for (const details of [
			{ isMainFrame: false, isSameDocument: false },
			{ isMainFrame: true, isSameDocument: true },
		]) {
			emit(
				electron.window.webContents.on.mock.calls,
				"did-start-navigation",
				details,
			);
		}
		expect(pointer.controller.disable).not.toHaveBeenCalled();
		emit(electron.window.webContents.on.mock.calls, "did-start-navigation", {
			isMainFrame: true,
			isSameDocument: false,
		});
		expect(pointer.controller.disable).toHaveBeenCalledOnce();
	});

	it.each(["render-process-gone", "destroyed"])(
		"disables control when the renderer emits %s",
		(event) => {
			emit(electron.window.webContents.on.mock.calls, event);
			expect(pointer.controller.disable).toHaveBeenCalledOnce();
		},
	);

	it("preserves control when focus is lost or the window is minimized", () => {
		for (const event of ["blur", "minimize"]) {
			emit(electron.window.on.mock.calls, event);
			emit(electron.window.webContents.on.mock.calls, event);
		}
		expect(pointer.controller.disable).not.toHaveBeenCalled();
	});

	it("disables control when the window closes and stops notifying its renderer", () => {
		emit(electron.window.on.mock.calls, "closed");
		expect(pointer.controller.disable).toHaveBeenCalledOnce();
		options().onState({ phase: "disabled", sessionId: null, error: null });
		expect(electron.window.webContents.send).not.toHaveBeenCalled();
	});

	it("forwards pointer state only while the renderer remains alive", () => {
		const state: PointerControlState = {
			phase: "waiting",
			sessionId: 1,
			error: null,
		};
		options().onState(state);
		expect(electron.window.webContents.send).toHaveBeenCalledExactlyOnceWith(
			"handfinity:pointer:state",
			state,
		);
		electron.window.webContents.isDestroyed.mockReturnValue(true);
		options().onState({ phase: "disabled", sessionId: null, error: null });
		expect(electron.window.webContents.send).toHaveBeenCalledOnce();
	});

	it.each(["destroyed window", "closed event"])(
		"does not read destroyed webContents during an active-control teardown: %s",
		(teardown) => {
			options().onState({ phase: "moving", sessionId: 1, error: null });
			expect(electron.window.webContents.send).toHaveBeenCalledOnce();
			const window = electron.BrowserWindow.mock.instances[0];
			const readContents = vi.fn(() => {
				throw new Error("Object has been destroyed");
			});
			Object.defineProperty(window, "webContents", {
				configurable: true,
				get: readContents,
			});
			const disabled: PointerControlState = {
				phase: "disabled",
				sessionId: null,
				error: null,
			};
			if (teardown === "destroyed window") {
				electron.window.isDestroyed.mockReturnValue(true);
				expect(() => options().onState(disabled)).not.toThrow();
			} else {
				pointer.controller.disable.mockImplementationOnce(() => {
					options().onState(disabled);
					return disabled;
				});
				expect(() =>
					emit(electron.window.on.mock.calls, "closed"),
				).not.toThrow();
				expect(pointer.controller.disable).toHaveBeenCalledOnce();
			}
			expect(readContents).not.toHaveBeenCalled();
			expect(electron.window.webContents.send).toHaveBeenCalledOnce();
		},
	);

	it("disables control and disposes IPC listeners before the application quits", () => {
		const updateListener = electron.ipcMain.on.mock.calls.find(
			([channel]) => channel === "handfinity:pointer:update",
		)?.[1];
		expect(updateListener).toBeTypeOf("function");
		emit(electron.app.on.mock.calls, "before-quit");
		expect(pointer.controller.disable).toHaveBeenCalledOnce();
		expect(electron.ipcMain.removeHandler.mock.calls).toEqual([
			["handfinity:pointer:get-state"],
			["handfinity:pointer:enable"],
			["handfinity:pointer:disable"],
		]);
		expect(electron.ipcMain.removeListener).toHaveBeenCalledExactlyOnceWith(
			"handfinity:pointer:update",
			updateListener,
		);
	});
});
