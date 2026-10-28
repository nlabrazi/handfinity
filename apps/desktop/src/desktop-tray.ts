import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	type BrowserWindow,
	Menu,
	type MenuItemConstructorOptions,
	type NativeImage,
	nativeImage,
	Tray,
} from "electron";
import type { PointerControlState } from "./pointer-contract.js";

export const FALLBACK_ICON_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGNos/7/nxLMMGrAqAGjBgwXAwA4Lb8fX/weFAAAAABJRU5ErkJggg==";

export function resolveTrayIconPath(customPath?: string): string {
	if (customPath !== undefined) {
		return existsSync(customPath) ? customPath : "";
	}
	const candidates = [
		join(import.meta.dirname, "assets", "favicon.ico"),
		join(import.meta.dirname, "..", "assets", "favicon.ico"),
		join(import.meta.dirname, "..", "..", "..", "public", "favicon.ico"),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) return candidate;
	}
	return "";
}

export function createTrayIcon(customPath?: string): NativeImage {
	const iconPath = resolveTrayIconPath(customPath);
	if (iconPath) {
		try {
			const image = nativeImage.createFromPath(iconPath);
			if (!image.isEmpty()) return image;
		} catch {
			// Repli sur l'icône de secours embarquée
		}
	}
	return nativeImage.createFromDataURL(FALLBACK_ICON_DATA_URL);
}

export function formatPointerPhaseLabel(
	phase: PointerControlState["phase"],
): string {
	switch (phase) {
		case "moving":
			return "Actif (mouvement)";
		case "waiting":
			return "Actif (en attente d'une main)";
		case "paused":
			return "En pause";
		case "starting":
			return "Démarrage…";
		case "unsupported":
			return "Non supporté (Windows uniquement)";
		case "error":
			return "Erreur";
		default:
			return "Désactivé";
	}
}

export function formatTrayTooltip(state: PointerControlState): string {
	switch (state.phase) {
		case "moving":
		case "waiting":
			return "Handfinity — Contrôle actif";
		case "paused":
			return "Handfinity — En pause";
		case "starting":
			return "Handfinity — Démarrage…";
		case "error":
			return `Handfinity — Erreur (${state.error ?? "inconnue"})`;
		case "unsupported":
			return "Handfinity — Windows uniquement";
		default:
			return "Handfinity — Prêt";
	}
}

export interface DesktopTrayOptions {
	getWindow(): BrowserWindow | null;
	getPointerState(): PointerControlState;
	onTogglePointer(): unknown;
	onQuit(): void;
	iconPath?: string;
}

export interface DesktopTray {
	readonly tray: Tray;
	update(): void;
	destroy(): void;
}

export function buildTrayMenuTemplate(
	options: DesktopTrayOptions,
	update: () => void,
): MenuItemConstructorOptions[] {
	const state = options.getPointerState();
	const window = options.getWindow();
	const isVisible =
		window !== null &&
		!window.isDestroyed() &&
		window.isVisible() &&
		!window.isMinimized();

	return [
		{
			label: isVisible ? "Masquer Handfinity" : "Afficher Handfinity",
			click: () => {
				const win = options.getWindow();
				if (!win || win.isDestroyed()) return;
				if (win.isVisible() && !win.isMinimized()) {
					win.hide();
				} else {
					if (win.isMinimized()) win.restore();
					win.show();
					win.focus();
				}
				update();
			},
		},
		{ type: "separator" },
		{
			label: `État : ${formatPointerPhaseLabel(state.phase)}`,
			enabled: false,
		},
		{
			label:
				state.phase === "disabled"
					? "Activer le contrôle"
					: state.phase === "paused"
						? "Reprendre le contrôle"
						: "Désactiver le contrôle",
			click: () => {
				void options.onTogglePointer();
				update();
			},
		},
		{ type: "separator" },
		{
			label: "Quitter Handfinity",
			click: () => options.onQuit(),
		},
	];
}

export function createDesktopTray(options: DesktopTrayOptions): DesktopTray {
	const icon = createTrayIcon(options.iconPath);
	const tray = new Tray(icon);

	function update() {
		const state = options.getPointerState();
		tray.setToolTip(formatTrayTooltip(state));
		const template = buildTrayMenuTemplate(options, update);
		tray.setContextMenu(Menu.buildFromTemplate(template));
	}

	function toggleWindow() {
		const win = options.getWindow();
		if (!win || win.isDestroyed()) return;
		if (win.isVisible() && !win.isMinimized()) {
			win.hide();
		} else {
			if (win.isMinimized()) win.restore();
			win.show();
			win.focus();
		}
		update();
	}

	tray.on("click", toggleWindow);
	tray.on("double-click", () => {
		const win = options.getWindow();
		if (!win || win.isDestroyed()) return;
		if (win.isMinimized()) win.restore();
		win.show();
		win.focus();
		update();
	});

	update();

	return {
		tray,
		update,
		destroy: () => {
			tray.destroy();
		},
	};
}
