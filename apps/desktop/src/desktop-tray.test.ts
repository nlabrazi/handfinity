import type { BrowserWindow, MenuItemConstructorOptions } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PointerControlState } from "./pointer-contract";

const electron = vi.hoisted(() => {
	class MockTray {
		tooltip = "";
		menu: unknown = null;
		listeners = new Map<string, (...args: unknown[]) => void>();

		setToolTip = vi.fn((tip: string) => {
			this.tooltip = tip;
		});
		setContextMenu = vi.fn((menu: unknown) => {
			this.menu = menu;
		});
		on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
			this.listeners.set(event, handler);
		});
		destroy = vi.fn();
	}

	return {
		Tray: MockTray,
		Menu: {
			buildFromTemplate: vi.fn(
				(template: readonly MenuItemConstructorOptions[]) => ({ template }),
			),
		},
		nativeImage: {
			createFromPath: vi.fn((path: string) => ({
				isEmpty: () => path.includes("empty"),
			})),
			createFromDataURL: vi.fn((dataUrl: string) => ({
				isEmpty: () => false,
				dataUrl,
			})),
		},
	};
});

vi.mock("electron", () => ({
	Tray: electron.Tray,
	Menu: electron.Menu,
	nativeImage: electron.nativeImage,
}));

import {
	createDesktopTray,
	createTrayIcon,
	formatPointerPhaseLabel,
	formatTrayTooltip,
} from "./desktop-tray";

type MockWindow = {
	isVisible: ReturnType<typeof vi.fn>;
	isMinimized: ReturnType<typeof vi.fn>;
	isDestroyed: ReturnType<typeof vi.fn>;
	show: ReturnType<typeof vi.fn>;
	hide: ReturnType<typeof vi.fn>;
	restore: ReturnType<typeof vi.fn>;
	focus: ReturnType<typeof vi.fn>;
};

describe("desktop-tray", () => {
	let window: MockWindow;
	let pointerState: PointerControlState;
	let onTogglePointer: ReturnType<typeof vi.fn>;
	let onQuit: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		window = {
			isVisible: vi.fn(() => true),
			isMinimized: vi.fn(() => false),
			isDestroyed: vi.fn(() => false),
			show: vi.fn(),
			hide: vi.fn(),
			restore: vi.fn(),
			focus: vi.fn(),
		};
		pointerState = {
			phase: "waiting",
			sessionId: 1,
			error: null,
		};
		onTogglePointer = vi.fn();
		onQuit = vi.fn();
	});

	it("formats pointer phase labels appropriately", () => {
		expect(formatPointerPhaseLabel("moving")).toBe("Actif (mouvement)");
		expect(formatPointerPhaseLabel("waiting")).toBe(
			"Actif (en attente d'une main)",
		);
		expect(formatPointerPhaseLabel("paused")).toBe("En pause");
		expect(formatPointerPhaseLabel("starting")).toBe("Démarrage…");
		expect(formatPointerPhaseLabel("unsupported")).toBe(
			"Non supporté (Windows uniquement)",
		);
		expect(formatPointerPhaseLabel("error")).toBe("Erreur");
		expect(formatPointerPhaseLabel("disabled")).toBe("Désactivé");
	});

	it("formats tray tooltips based on control state", () => {
		expect(
			formatTrayTooltip({ phase: "moving", sessionId: 1, error: null }),
		).toBe("Handfinity — Contrôle actif");
		expect(
			formatTrayTooltip({ phase: "waiting", sessionId: 1, error: null }),
		).toBe("Handfinity — Contrôle actif");
		expect(
			formatTrayTooltip({ phase: "paused", sessionId: 1, error: null }),
		).toBe("Handfinity — En pause");
		expect(
			formatTrayTooltip({ phase: "starting", sessionId: 1, error: null }),
		).toBe("Handfinity — Démarrage…");
		expect(
			formatTrayTooltip({
				phase: "error",
				sessionId: null,
				error: "Camera denied",
			}),
		).toBe("Handfinity — Erreur (Camera denied)");
		expect(
			formatTrayTooltip({ phase: "unsupported", sessionId: null, error: null }),
		).toBe("Handfinity — Windows uniquement");
		expect(
			formatTrayTooltip({ phase: "disabled", sessionId: null, error: null }),
		).toBe("Handfinity — Prêt");
	});

	it("resolves the tray icon fallback when path is missing or invalid", () => {
		const icon = createTrayIcon("non-existent-path/empty.ico");
		expect(electron.nativeImage.createFromDataURL).toHaveBeenCalledOnce();
		expect(icon.isEmpty()).toBe(false);
	});

	it("creates a tray instance with tooltip and context menu", () => {
		const tray = createDesktopTray({
			getWindow: () => window as unknown as BrowserWindow,
			getPointerState: () => pointerState,
			onTogglePointer,
			onQuit,
		});

		expect(tray.tray).toBeDefined();
		expect(electron.Menu.buildFromTemplate).toHaveBeenCalled();
		expect(tray.tray.setToolTip).toHaveBeenCalledWith(
			"Handfinity — Contrôle actif",
		);
	});

	it("displays 'Masquer Handfinity' when window is visible and hides it on click", () => {
		createDesktopTray({
			getWindow: () => window as unknown as BrowserWindow,
			getPointerState: () => pointerState,
			onTogglePointer,
			onQuit,
		});

		const template = electron.Menu.buildFromTemplate.mock
			.calls[0]?.[0] as MenuItemConstructorOptions[];
		const toggleItem = template?.find((i) => i.label === "Masquer Handfinity");
		expect(toggleItem).toBeDefined();

		toggleItem?.click?.({} as never, {} as never, {} as never);
		expect(window.hide).toHaveBeenCalledOnce();
	});

	it("displays 'Afficher Handfinity' when window is hidden and restores it on click", () => {
		window.isVisible.mockReturnValue(false);
		createDesktopTray({
			getWindow: () => window as unknown as BrowserWindow,
			getPointerState: () => pointerState,
			onTogglePointer,
			onQuit,
		});

		const template = electron.Menu.buildFromTemplate.mock
			.calls[0]?.[0] as MenuItemConstructorOptions[];
		const toggleItem = template?.find((i) => i.label === "Afficher Handfinity");
		expect(toggleItem).toBeDefined();

		window.isMinimized.mockReturnValue(true);
		toggleItem?.click?.({} as never, {} as never, {} as never);
		expect(window.restore).toHaveBeenCalledOnce();
		expect(window.show).toHaveBeenCalledOnce();
		expect(window.focus).toHaveBeenCalledOnce();
	});

	it("toggles window visibility on tray click", () => {
		const tray = createDesktopTray({
			getWindow: () => window as unknown as BrowserWindow,
			getPointerState: () => pointerState,
			onTogglePointer,
			onQuit,
		});

		const mockTrayInstance = tray.tray as unknown as {
			listeners: Map<string, (...args: unknown[]) => void>;
		};
		const clickHandler = mockTrayInstance.listeners.get("click");
		expect(clickHandler).toBeTypeOf("function");

		// When visible -> hides
		clickHandler?.();
		expect(window.hide).toHaveBeenCalledOnce();

		// When hidden -> shows
		window.isVisible.mockReturnValue(false);
		clickHandler?.();
		expect(window.show).toHaveBeenCalledOnce();
		expect(window.focus).toHaveBeenCalledOnce();
	});

	it("restores and focuses window on tray double-click", () => {
		window.isVisible.mockReturnValue(false);
		window.isMinimized.mockReturnValue(true);

		const tray = createDesktopTray({
			getWindow: () => window as unknown as BrowserWindow,
			getPointerState: () => pointerState,
			onTogglePointer,
			onQuit,
		});

		const mockTrayInstance = tray.tray as unknown as {
			listeners: Map<string, (...args: unknown[]) => void>;
		};
		const dblClickHandler = mockTrayInstance.listeners.get("double-click");
		expect(dblClickHandler).toBeTypeOf("function");

		dblClickHandler?.();
		expect(window.restore).toHaveBeenCalledOnce();
		expect(window.show).toHaveBeenCalledOnce();
		expect(window.focus).toHaveBeenCalledOnce();
	});

	it("invokes onTogglePointer from the context menu", () => {
		createDesktopTray({
			getWindow: () => window as unknown as BrowserWindow,
			getPointerState: () => pointerState,
			onTogglePointer,
			onQuit,
		});

		const template = electron.Menu.buildFromTemplate.mock
			.calls[0]?.[0] as MenuItemConstructorOptions[];
		const pointerToggleItem = template?.find(
			(i) => i.label === "Désactiver le contrôle",
		);
		expect(pointerToggleItem).toBeDefined();

		pointerToggleItem?.click?.({} as never, {} as never, {} as never);
		expect(onTogglePointer).toHaveBeenCalledOnce();
	});

	it("invokes onToggleOverlay from the context menu", () => {
		const onToggleOverlay = vi.fn();
		createDesktopTray({
			getWindow: () => window as unknown as BrowserWindow,
			getPointerState: () => pointerState,
			onTogglePointer,
			onToggleOverlay,
			onQuit,
		});

		const template = electron.Menu.buildFromTemplate.mock
			.calls[0]?.[0] as MenuItemConstructorOptions[];
		const overlayItem = template?.find(
			(i) => i.label === "Clavier virtuel (Overlay)",
		);
		expect(overlayItem).toBeDefined();

		overlayItem?.click?.({} as never, {} as never, {} as never);
		expect(onToggleOverlay).toHaveBeenCalledOnce();
	});

	it("invokes onToggleHud from the context menu", () => {
		const onToggleHud = vi.fn();
		createDesktopTray({
			getWindow: () => window as unknown as BrowserWindow,
			getPointerState: () => pointerState,
			onTogglePointer,
			onToggleHud,
			onQuit,
		});

		const template = electron.Menu.buildFromTemplate.mock
			.calls[0]?.[0] as MenuItemConstructorOptions[];
		const hudItem = template?.find((i) => i.label === "HUD de statut (on-top)");
		expect(hudItem).toBeDefined();

		hudItem?.click?.({} as never, {} as never, {} as never);
		expect(onToggleHud).toHaveBeenCalledOnce();
	});

	it("invokes onQuit when quitting from context menu", () => {
		createDesktopTray({
			getWindow: () => window as unknown as BrowserWindow,
			getPointerState: () => pointerState,
			onTogglePointer,
			onQuit,
		});

		const template = electron.Menu.buildFromTemplate.mock
			.calls[0]?.[0] as MenuItemConstructorOptions[];
		const quitItem = template?.find((i) => i.label === "Quitter Handfinity");
		expect(quitItem).toBeDefined();

		quitItem?.click?.({} as never, {} as never, {} as never);
		expect(onQuit).toHaveBeenCalledOnce();
	});

	it("destroys tray on destroy()", () => {
		const tray = createDesktopTray({
			getWindow: () => window as unknown as BrowserWindow,
			getPointerState: () => pointerState,
			onTogglePointer,
			onQuit,
		});

		tray.destroy();
		expect(tray.tray.destroy).toHaveBeenCalledOnce();
	});
});
