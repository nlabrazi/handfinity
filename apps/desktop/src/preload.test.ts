import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
	PointerControlState,
	SystemPointerBridge,
} from "./pointer-contract";

const electron = vi.hoisted(() => ({
	expose: vi.fn(),
	invoke: vi.fn(),
	send: vi.fn(),
	on: vi.fn(),
	removeListener: vi.fn(),
}));

function loadBridge(): SystemPointerBridge {
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
	expect(electron.expose).toHaveBeenCalledOnce();
	const [name, bridge] = electron.expose.mock.calls[0] ?? [];
	expect(name).toBe("handfinityPointer");
	return bridge;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("System pointer preload bridge", () => {
	it("exposes fixed capabilities without a general Electron API", async () => {
		const bridge = await loadBridge();
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
		const bridge = await loadBridge();
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
		const bridge = await loadBridge();
		expect(() =>
			bridge.subscribe(
				null as unknown as Parameters<typeof bridge.subscribe>[0],
			),
		).toThrow("A pointer state listener is required");
		expect(electron.on).not.toHaveBeenCalled();
	});
});
