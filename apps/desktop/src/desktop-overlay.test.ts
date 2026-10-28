import type { IpcMainEvent, Session } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
	const handlers = new Map<string, (...args: unknown[]) => unknown>();
	const listeners = new Map<
		string,
		(event: IpcMainEvent, ...args: unknown[]) => void
	>();

	const mockWindow = {
		setMenu: vi.fn(),
		setAlwaysOnTop: vi.fn(),
		setVisibleOnAllWorkspaces: vi.fn(),
		moveTop: vi.fn(),
		show: vi.fn(),
		showInactive: vi.fn(),
		hide: vi.fn(),
		destroy: vi.fn(),
		getPosition: vi.fn(() => [100, 200]),
		setPosition: vi.fn(),
		setBounds: vi.fn(),
		isVisible: vi.fn(() => true),
		isDestroyed: vi.fn(() => false),
		loadURL: vi.fn().mockResolvedValue(undefined),
		on: vi.fn<
			(event: string, listener: (...args: unknown[]) => void) => void
		>(),
		webContents: {
			mainFrame: {
				origin: "handfinity://app",
				url: "handfinity://app/?view=overlay#overlay",
			},
			getURL: vi.fn(() => "handfinity://app/?view=overlay#overlay"),
			isDestroyed: vi.fn(() => false),
			send: vi.fn(),
			setWindowOpenHandler: vi.fn(),
			on: vi.fn(),
		},
	};

	return {
		mockWindow,
		handlers,
		listeners,
		BrowserWindow: vi.fn(
			class {
				constructor(_options: unknown) {
					Object.assign(this, mockWindow);
				}
			},
		),
		ipcMain: {
			handle: vi.fn(
				(channel: string, handler: (...args: unknown[]) => unknown) => {
					handlers.set(channel, handler);
				},
			),
			on: vi.fn(
				(
					channel: string,
					listener: (event: IpcMainEvent, ...args: unknown[]) => void,
				) => {
					listeners.set(channel, listener);
				},
			),
			removeHandler: vi.fn((channel: string) => {
				handlers.delete(channel);
			}),
			removeListener: vi.fn((channel: string) => {
				listeners.delete(channel);
			}),
		},
		screen: {
			getPrimaryDisplay: vi.fn(() => ({
				workArea: { x: 0, y: 0, width: 1920, height: 1040 },
			})),
		},
	};
});

vi.mock("electron", () => ({
	BrowserWindow: electron.BrowserWindow,
	ipcMain: electron.ipcMain,
	screen: electron.screen,
}));

import { createDesktopOverlay } from "./desktop-overlay";

describe("desktop-overlay", () => {
	let onKeyPress: ReturnType<typeof vi.fn>;
	let session: Session;

	beforeEach(() => {
		vi.clearAllMocks();
		electron.handlers.clear();
		electron.listeners.clear();
		electron.mockWindow.isDestroyed.mockReturnValue(false);
		electron.mockWindow.webContents.isDestroyed.mockReturnValue(false);
		electron.mockWindow.getPosition.mockReturnValue([100, 200]);
		onKeyPress = vi.fn();
		session = {} as unknown as Session;
	});

	it("creates a non-focusable transparent window configured for overlay typing", () => {
		const overlay = createDesktopOverlay({
			session,
			preloadPath: "/test/preload.cjs",
			onKeyPress,
		});

		expect(overlay.window).toBeDefined();
		expect(electron.BrowserWindow).toHaveBeenCalledWith(
			expect.objectContaining({
				title: "Handfinity Overlay",
				show: false,
				transparent: true,
				focusable: false,
				alwaysOnTop: true,
				skipTaskbar: true,
				frame: false,
				type: "toolbar",
			}),
		);
		expect(electron.mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(
			true,
			"screen-saver",
			1,
		);
		expect(electron.mockWindow.loadURL).toHaveBeenCalledWith(
			"handfinity://app/?view=overlay#overlay",
		);
	});

	it("positions overlay centered near the bottom of primary workArea", () => {
		const overlay = createDesktopOverlay({
			session,
			preloadPath: "/test/preload.cjs",
			onKeyPress,
		});

		expect(overlay.window).toBeDefined();

		const calls = electron.BrowserWindow.mock.calls;
		const options = calls[0]?.[0] as {
			x: number;
			y: number;
			width: number;
			height: number;
		};
		expect(options.width).toBe(880);
		expect(options.height).toBe(440);
		expect(options.x).toBe(Math.round((1920 - 880) / 2));
		expect(options.y).toBe(1040 - 440 - 16);
	});

	it("shows without stealing focus via showInactive() and reinforces topmost z-order", () => {
		const overlay = createDesktopOverlay({
			session,
			preloadPath: "/test/preload.cjs",
			onKeyPress,
		});

		overlay.show();
		expect(electron.mockWindow.setAlwaysOnTop).toHaveBeenCalledWith(
			true,
			"screen-saver",
			1,
		);
		expect(electron.mockWindow.moveTop).toHaveBeenCalledOnce();
		expect(electron.mockWindow.showInactive).toHaveBeenCalledOnce();
		expect(overlay.isVisible()).toBe(true);

		overlay.hide();
		expect(electron.mockWindow.hide).toHaveBeenCalledOnce();
		expect(overlay.isVisible()).toBe(false);
	});

	it("toggles overlay visibility cleanly", () => {
		const overlay = createDesktopOverlay({
			session,
			preloadPath: "/test/preload.cjs",
			onKeyPress,
		});

		const firstToggle = overlay.toggle();
		expect(firstToggle).toBe(true);
		expect(electron.mockWindow.showInactive).toHaveBeenCalledOnce();

		const secondToggle = overlay.toggle();
		expect(secondToggle).toBe(false);
		expect(electron.mockWindow.hide).toHaveBeenCalledOnce();
	});

	it("forwards trusted key presses to onKeyPress", () => {
		createDesktopOverlay({
			session,
			preloadPath: "/test/preload.cjs",
			onKeyPress,
		});

		const pressHandler = electron.listeners.get("handfinity:overlay:press-key");
		expect(pressHandler).toBeTypeOf("function");

		const trustedEvent = {
			sender: electron.mockWindow.webContents,
			senderFrame: electron.mockWindow.webContents.mainFrame,
		} as unknown as IpcMainEvent;

		pressHandler?.(trustedEvent, "Enter");
		expect(onKeyPress).toHaveBeenCalledWith("Enter");

		const untrustedEvent = {
			sender: electron.mockWindow.webContents,
			senderFrame: {
				origin: "https://evil.com",
				url: "https://evil.com",
			},
		} as unknown as IpcMainEvent;

		pressHandler?.(untrustedEvent, "Escape");
		expect(onKeyPress).not.toHaveBeenCalledWith("Escape");
	});

	it("moves the overlay window smoothly via moveBy IPC", () => {
		const overlay = createDesktopOverlay({
			session,
			preloadPath: "/test/preload.cjs",
			onKeyPress,
		});

		overlay.show();

		const moveHandler = electron.listeners.get("handfinity:overlay:move-by");
		expect(moveHandler).toBeTypeOf("function");

		const trustedEvent = {
			sender: electron.mockWindow.webContents,
			senderFrame: electron.mockWindow.webContents.mainFrame,
		} as unknown as IpcMainEvent;

		moveHandler?.(trustedEvent, { deltaX: 25, deltaY: -15 });
		expect(electron.mockWindow.setPosition).toHaveBeenCalledWith(125, 185);
	});

	it("resets overlay position to bottom center via resetPosition IPC", () => {
		const overlay = createDesktopOverlay({
			session,
			preloadPath: "/test/preload.cjs",
			onKeyPress,
		});

		overlay.show();

		const resetHandler = electron.listeners.get(
			"handfinity:overlay:reset-position",
		);
		expect(resetHandler).toBeTypeOf("function");

		const trustedEvent = {
			sender: electron.mockWindow.webContents,
			senderFrame: electron.mockWindow.webContents.mainFrame,
		} as unknown as IpcMainEvent;

		resetHandler?.(trustedEvent);
		expect(electron.mockWindow.setBounds).toHaveBeenCalledWith({
			x: Math.round((1920 - 880) / 2),
			y: 1040 - 440 - 16,
			width: 880,
			height: 440,
		});
	});

	it("broadcasts HUD state updates to overlay webContents", () => {
		const overlay = createDesktopOverlay({
			session,
			preloadPath: "/test/preload.cjs",
			onKeyPress,
		});

		overlay.show();

		const hudHandler = electron.listeners.get("handfinity:overlay:update-hud");
		expect(hudHandler).toBeTypeOf("function");

		const trustedEvent = {
			sender: electron.mockWindow.webContents,
			senderFrame: electron.mockWindow.webContents.mainFrame,
		} as unknown as IpcMainEvent;

		const hudState = {
			phase: "moving" as const,
			statusText: "☝️ Mode pointeur",
			grabProgress: 0.6,
			isLocked: false,
			lastAction: "click",
		};

		hudHandler?.(trustedEvent, hudState);
		expect(electron.mockWindow.webContents.send).toHaveBeenCalledWith(
			"handfinity:overlay:hud-state",
			hudState,
		);
	});

	it("destroys window and clears all IPC handlers on destroy()", () => {
		const overlay = createDesktopOverlay({
			session,
			preloadPath: "/test/preload.cjs",
			onKeyPress,
		});

		overlay.show();
		overlay.destroy();

		expect(electron.ipcMain.removeHandler).toHaveBeenCalledWith(
			"handfinity:overlay:toggle",
		);
		expect(electron.ipcMain.removeListener).toHaveBeenCalledWith(
			"handfinity:overlay:move-by",
			expect.any(Function),
		);
		expect(electron.ipcMain.removeListener).toHaveBeenCalledWith(
			"handfinity:overlay:reset-position",
			expect.any(Function),
		);
		expect(electron.ipcMain.removeListener).toHaveBeenCalledWith(
			"handfinity:overlay:update-hud",
			expect.any(Function),
		);
		expect(electron.mockWindow.destroy).toHaveBeenCalledOnce();
		expect(overlay.isVisible()).toBe(false);
	});
});
