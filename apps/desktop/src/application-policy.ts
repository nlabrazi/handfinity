import { isAbsolute, relative, resolve, sep } from "node:path";

export const APP_SCHEME = "handfinity";
export const APP_URL = "handfinity://app/";

export function isAppUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			url.protocol === `${APP_SCHEME}:` &&
			url.hostname === "app" &&
			url.port === "" &&
			url.username === "" &&
			url.password === ""
		);
	} catch {
		return false;
	}
}

/** Sert uniquement les fichiers compilés, dans le répertoire du renderer. */
export function resolveRendererFile(
	value: string,
	rendererRoot: string,
): string | null {
	if (!isAppUrl(value)) return null;
	// URL normalise les segments « .. » : les examiner avant cette normalisation.
	const match = value.match(/^[a-z][a-z\d+.-]*:\/\/[^/?#]*(\/[^?#]*)?/i);
	if (!match) return null;
	let pathname: string;
	try {
		pathname = decodeURIComponent(match[1] ?? "/");
	} catch {
		return null;
	}
	if (
		pathname.includes("\\") ||
		pathname.includes(":") ||
		pathname.includes("\0") ||
		pathname.split("/").some((part) => part.endsWith(".") || part.endsWith(" "))
	)
		return null;

	const root = resolve(rendererRoot);
	const file = resolve(
		root,
		pathname === "/" ? "index.html" : pathname.slice(1),
	);
	const fromRoot = relative(root, file);
	if (
		!fromRoot ||
		fromRoot === ".." ||
		fromRoot.startsWith(`..${sep}`) ||
		isAbsolute(fromRoot)
	)
		return null;
	return file;
}

export function allowCameraRequest(
	permission: string,
	mediaTypes: readonly string[],
	trusted: boolean,
): boolean {
	return (
		trusted &&
		permission === "media" &&
		mediaTypes.length === 1 &&
		mediaTypes[0] === "video"
	);
}

export function allowCameraCheck(
	permission: string,
	mediaType: string,
	trusted: boolean,
): boolean {
	return trusted && permission === "media" && mediaType === "video";
}
