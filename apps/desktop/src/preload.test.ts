import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	PointerControlState,
	SystemOverlayBridge,
	SystemPointerBridge,
} from "./pointer-contract";

const electron = vi.hoisted(() => ({
	expose: vi.fn(),
	invoke: vi.fn(),
	send: vi.fn(),
	on: vi.fn(),
	removeListener: vi.fn(),
}));

function loadBridges(): {
	pointer: SystemPointerBridge;
	overlay: SystemOverlayBridge;
} {
	const source = readFileSync(
		new URL("./preload.cts", import.meta.url),
		"utf8",
	);
	const compiled = ts.transpileModule(source, {
		fileName: "preload.cts",
		compilerOptions: {
			module: ts.ModuleKind.NodeNext,
			target: ts.ScriptTarget.ES2023,
			verbatimModuleSyntax: true,
		},
	}).outputText;
	const loadModule = vi.fn((specifier: string) => {
		if (specifier !== "electron") {
			throw new Error(`Sandbox preload cannot require ${specifier}`);
		}
		return {
			contextBridge: { exposeInMainWorld: electron.expose },
			ipcRenderer: {
				invoke: electron.invoke,
				send: electron.send,
				on: electron.on,
				removeListener: electron.removeListener,
			},
		};
	});
	runInNewContext(compiled, { exports: {}, require: loadModule });
	expect(loadModule).toHaveBeenCalledExactlyOnceWith("electron");
	expect(electron.expose).toHaveBeenCalledTimes(2);

	const pointerCall = electron.expose.mock.calls.find(
		([name]) => name === "handfinityPointer",
	);
	const overlayCall = electron.expose.mock.calls.find(
		([name]) => name === "handfinityOverlay",
	);

	if (!pointerCall || !overlayCall) {
		throw new Error("Preload bridges not properly exposed");
	}

	return {
		pointer: pointerCall[1] as SystemPointerBridge,
		overlay: overlayCall[1] as SystemOverlayBridge,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("System pointer preload bridge", () => {
	it("exposes fixed capabilities without a general Electron API", async () => {
		const { pointer: bridge } = loadBridges();
		expect(Object.keys(bridge)).toEqual([
			"getState",
			"enable",
			"disable",
			"submit",
			"subscribe",
		]);
		const state: PointerControlState = {
			phase: "disabled",
			sessionId: null,
			error: null,
		};
		electron.invoke.mockResolvedValue(state);
		expect(await bridge.getState()).toBe(state);
		expect(await bridge.enable()).toBe(state);
		expect(await bridge.disable()).toBe(state);
		expect(electron.invoke.mock.calls).toEqual([
			["handfinity:pointer:get-state"],
			["handfinity:pointer:enable"],
			["handfinity:pointer:disable"],
		]);
		const update = {
			sessionId: 1,
			paused: false,
			capturedAt: 1000,
			command: null,
		};
		expect(bridge.submit(update)).toBeUndefined();
		expect(electron.send).toHaveBeenCalledExactlyOnceWith(
			"handfinity:pointer:update",
			update,
		);
	});

	it("forwards state without the privileged event and unsubscribes the exact listener", async () => {
		const { pointer: bridge } = loadBridges();
		const listener = vi.fn();
		const unsubscribe = bridge.subscribe(listener);
		expect(electron.on).toHaveBeenCalledOnce();
		const [channel, receive] = electron.on.mock.calls[0] ?? [];
		expect(channel).toBe("handfinity:pointer:state");
		const state = { phase: "moving", sessionId: 1, error: null };
		const event = { sender: { privileged: true } };
		receive(event, state);
		expect(listener).toHaveBeenCalledExactlyOnceWith(state);
		electron.removeListener.mockReturnValue({ privileged: true });
		expect(unsubscribe()).toBeUndefined();
		expect(electron.removeListener).toHaveBeenCalledExactlyOnceWith(
			"handfinity:pointer:state",
			receive,
		);
	});

	it("rejects an invalid state callback before registering a listener", async () => {
		const { pointer: bridge } = loadBridges();
		expect(() =>
			bridge.subscribe(
				null as unknown as Parameters<typeof bridge.subscribe>[0],
			),
		).toThrow("A pointer state listener is required");
		expect(electron.on).not.toHaveBeenCalled();
	});

	it("exposes fixed overlay capabilities and delegates messages properly", async () => {
		const { overlay } = loadBridges();
		expect(Object.keys(overlay)).toEqual([
			"toggle",
			"pressKey",
			"close",
			"subscribeFeedback",
		]);

		electron.invoke.mockResolvedValue(true);
		expect(await overlay.toggle()).toBe(true);
		expect(electron.invoke).toHaveBeenCalledWith("handfinity:overlay:toggle");

		overlay.pressKey("a");
		expect(electron.send).toHaveBeenCalledWith(
			"handfinity:overlay:press-key",
			"a",
		);

		overlay.close();
		expect(electron.send).toHaveBeenCalledWith("handfinity:overlay:close");

		const listener = vi.fn();
		const unsubscribe = overlay.subscribeFeedback(listener);
		const feedbackCall = electron.on.mock.calls.find(
			([ch]) => ch === "handfinity:overlay:feedback",
		);
		expect(feedbackCall).toBeDefined();
		const receive = feedbackCall?.[1];
		receive?.({}, "clavier : ouvert");
		expect(listener).toHaveBeenCalledWith("clavier : ouvert");

		unsubscribe();
		expect(electron.removeListener).toHaveBeenCalledWith(
			"handfinity:overlay:feedback",
			receive,
		);
	});
});
