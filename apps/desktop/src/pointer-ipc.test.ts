import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PointerControlState } from "./pointer-contract";
import { POINTER_STATE_CHANNEL, registerPointerIpc } from "./pointer-ipc";

type InvokeHandler = (event: IpcMainInvokeEvent) => unknown;
type UpdateListener = (event: IpcMainEvent, update: unknown) => void;

const ipc = vi.hoisted(() => ({
	handlers: new Map<string, InvokeHandler>(),
	listeners: new Map<string, UpdateListener>(),
	removeListener: vi.fn(),
}));

vi.mock("electron", () => ({
	ipcMain: {
		handle: (channel: string, handler: InvokeHandler) => {
			ipc.handlers.set(channel, handler);
		},
		on: (channel: string, listener: UpdateListener) => {
			ipc.listeners.set(channel, listener);
		},
		removeHandler: (channel: string) => ipc.handlers.delete(channel),
		removeListener: (channel: string, listener: UpdateListener) => {
			ipc.removeListener(channel, listener);
			if (ipc.listeners.get(channel) === listener) {
				ipc.listeners.delete(channel);
			}
		},
	},
}));

beforeEach(() => {
	ipc.handlers.clear();
	ipc.listeners.clear();
	vi.clearAllMocks();
});

function setup() {
	const state: PointerControlState = {
		phase: "disabled",
		sessionId: null,
		error: null,
	};
	const controller = {
		getState: vi.fn(() => state),
		enable: vi.fn(async () => ({ ...state, phase: "waiting" as const })),
		disable: vi.fn(() => state),
		submit: vi.fn(),
	};
	const frame = { origin: "handfinity://app", url: "handfinity://app/" };
	const contents = {
		mainFrame: frame,
		isDestroyed: vi.fn(() => false),
	};
	const window = {
		webContents: contents,
		isDestroyed: vi.fn(() => false),
	};
	let current: BrowserWindow | null = window as unknown as BrowserWindow;
	const dispose = registerPointerIpc(() => current, controller);
	const event = {
		sender: contents,
		senderFrame: frame,
	} as unknown as IpcMainInvokeEvent;
	return {
		controller,
		state,
		frame,
		contents,
		window,
		event,
		dispose,
		clearWindow: () => {
			current = null;
		},
	};
}

function invoke(channel: string, event: IpcMainInvokeEvent) {
	const handler = ipc.handlers.get(`handfinity:pointer:${channel}`);
	if (!handler) throw new Error(`Missing handler: ${channel}`);
	return handler(event);
}

function update(event: IpcMainEvent, payload: unknown) {
	const listener = ipc.listeners.get("handfinity:pointer:update");
	if (!listener) throw new Error("Missing pointer listener");
	listener(event, payload);
}

describe("System pointer IPC", () => {
	it("exposes only the fixed pointer channels and delegates trusted requests", async () => {
		const { event, controller, state } = setup();
		expect([...ipc.handlers.keys()]).toEqual([
			"handfinity:pointer:get-state",
			"handfinity:pointer:enable",
			"handfinity:pointer:disable",
		]);
		expect([...ipc.listeners.keys()]).toEqual(["handfinity:pointer:update"]);
		expect(POINTER_STATE_CHANNEL).toBe("handfinity:pointer:state");
		expect(invoke("get-state", event)).toBe(state);
		expect(await invoke("enable", event)).toMatchObject({ phase: "waiting" });
		expect(invoke("disable", event)).toBe(state);
		const payload = { sessionId: 1, command: null, capturedAt: 1000 };
		update(event, payload);
		expect(controller.getState).toHaveBeenCalledOnce();
		expect(controller.enable).toHaveBeenCalledOnce();
		expect(controller.disable).toHaveBeenCalledOnce();
		expect(controller.submit).toHaveBeenCalledExactlyOnceWith(payload);
	});

	it.each([
		"missing window",
		"destroyed window",
		"destroyed contents",
		"other contents",
		"subframe",
		"destroyed frame",
		"foreign origin",
		"foreign URL",
	] as const)("rejects requests from %s", async (source) => {
		const harness = setup();
		const { event, controller, frame, contents, window } = harness;
		const untrusted = { ...event };
		if (source === "missing window") harness.clearWindow();
		if (source === "destroyed window") window.isDestroyed.mockReturnValue(true);
		if (source === "destroyed contents") {
			contents.isDestroyed.mockReturnValue(true);
		}
		if (source === "other contents") {
			untrusted.sender = {} as IpcMainInvokeEvent["sender"];
		}
		if (source === "subframe") {
			untrusted.senderFrame = { ...frame } as IpcMainInvokeEvent["senderFrame"];
		}
		if (source === "destroyed frame") untrusted.senderFrame = null;
		if (source === "foreign origin") frame.origin = "https://example.org";
		if (source === "foreign URL") frame.url = "https://example.org";
		for (const channel of ["get-state", "enable", "disable"]) {
			await expect(
				Promise.resolve().then(() => invoke(channel, untrusted)),
			).rejects.toThrow("Untrusted pointer IPC source");
		}
		update(untrusted, { sessionId: 1, command: null, capturedAt: 1000 });
		for (const callback of Object.values(controller)) {
			expect(callback).not.toHaveBeenCalled();
		}
	});

	it("disposes every handler and removes only its own update listener", () => {
		const { dispose } = setup();
		const listener = ipc.listeners.get("handfinity:pointer:update");
		dispose();
		expect(ipc.handlers.size).toBe(0);
		expect(ipc.listeners.size).toBe(0);
		expect(ipc.removeListener).toHaveBeenCalledExactlyOnceWith(
			"handfinity:pointer:update",
			listener,
		);
	});
});
