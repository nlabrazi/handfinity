import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	APP_SCHEME,
	APP_URL,
	allowCameraCheck,
	allowCameraRequest,
	isAppUrl,
	resolveRendererFile,
} from "./application-policy";

describe("Desktop application origin", () => {
	it("recognizes only the application scheme and host", () => {
		expect(APP_SCHEME).toBe("handfinity");
		expect(isAppUrl(APP_URL)).toBe(true);
		expect(isAppUrl("handfinity://app")).toBe(true);
		expect(isAppUrl("handfinity://app/index.html?version=1#preview")).toBe(
			true,
		);
	});

	it.each([
		"https://app/",
		"http://localhost:3003/",
		"file:///app/index.html",
		"handfinity://app.example/",
		"handfinity://other/",
		"handfinity://app:3003/",
		"handfinity://user@app/",
		"handfinity://user:password@app/",
		"handfinity:app",
		"invalid URL",
	])("rejects an untrusted URL: %s", (url) => {
		expect(isAppUrl(url)).toBe(false);
	});
});

describe("Desktop renderer files", () => {
	const root = resolve("renderer build");

	it("resolves the entry point and generated assets within the renderer", () => {
		expect(resolveRendererFile(APP_URL, root)).toBe(join(root, "index.html"));
		expect(resolveRendererFile("handfinity://app", root)).toBe(
			join(root, "index.html"),
		);
		expect(
			resolveRendererFile(
				"handfinity://app/assets/index-abc.js?v=1#module",
				root,
			),
		).toBe(join(root, "assets", "index-abc.js"));
		expect(
			resolveRendererFile("handfinity://app/assets/hand%20pose.png", root),
		).toBe(join(root, "assets", "hand pose.png"));
	});

	it.each([
		"https://app/index.html",
		"handfinity://other/index.html",
		"handfinity://app:3003/index.html",
		"handfinity://user@app/index.html",
		"handfinity://app/../secret.txt",
		"handfinity://app/assets/../../secret.txt",
		"handfinity://app/%2e%2e/secret.txt",
		"handfinity://app/assets/%2E%2E/%2e%2e/secret.txt",
		"handfinity://app/assets/%2e%2e%2fsecret.txt",
		"handfinity://app/..%5csecret.txt",
		"handfinity://app/assets\\secret.txt",
		"handfinity://app/C:/secret.txt",
		"handfinity://app/assets/index.js%3Asecret",
		"handfinity://app/assets/%00secret.txt",
		"handfinity://app/assets/%ZZ.js",
		"handfinity://app/..%20/secret.txt",
		"handfinity://app/assets./secret.txt",
		"handfinity://app//",
	])("rejects paths outside the bundle or ambiguous on Windows: %s", (url) => {
		expect(resolveRendererFile(url, root)).toBeNull();
	});
});

describe("Desktop camera permissions", () => {
	it("allows only a trusted video camera request and check", () => {
		expect(allowCameraRequest("media", ["video"], true)).toBe(true);
		expect(allowCameraCheck("media", "video", true)).toBe(true);
	});

	it.each([
		{ permission: "media", mediaTypes: ["video"], trusted: false },
		{ permission: "media", mediaTypes: ["audio"], trusted: true },
		{ permission: "media", mediaTypes: ["video", "audio"], trusted: true },
		{ permission: "media", mediaTypes: [], trusted: true },
		{ permission: "media", mediaTypes: ["unknown"], trusted: true },
		{ permission: "display-capture", mediaTypes: ["video"], trusted: true },
		{ permission: "notifications", mediaTypes: ["video"], trusted: true },
	])("rejects camera request $permission/$mediaTypes/$trusted", (request) => {
		expect(
			allowCameraRequest(
				request.permission,
				request.mediaTypes,
				request.trusted,
			),
		).toBe(false);
	});

	it.each([
		{ permission: "media", mediaType: "video", trusted: false },
		{ permission: "media", mediaType: "audio", trusted: true },
		{ permission: "media", mediaType: "unknown", trusted: true },
		{ permission: "media", mediaType: "", trusted: true },
		{ permission: "display-capture", mediaType: "video", trusted: true },
		{ permission: "notifications", mediaType: "video", trusted: true },
	])("rejects permission check $permission/$mediaType/$trusted", (request) => {
		expect(
			allowCameraCheck(request.permission, request.mediaType, request.trusted),
		).toBe(false);
	});
});
