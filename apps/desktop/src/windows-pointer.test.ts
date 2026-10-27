import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWindowsPointer } from "./windows-pointer.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

function createChild() {
	const input: string[] = [];
	const stdin = new PassThrough();
	stdin.on("data", (chunk) => input.push(chunk.toString()));
	const child = Object.assign(new EventEmitter(), {
		stdin,
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		kill: vi.fn(() => true),
	});
	vi.mocked(spawn).mockReturnValueOnce(
		child as unknown as ChildProcessWithoutNullStreams,
	);
	return {
		child,
		input,
		send(message: object) {
			child.stdout.write(`${JSON.stringify(message)}\r\n`);
		},
	};
}

function setup() {
	const backend = createChild();
	const pointer = createWindowsPointer();
	const starting = pointer.start();
	return { ...backend, pointer, starting };
}

async function ready() {
	const harness = setup();
	harness.send({ type: "ready" });
	await harness.starting;
	return harness;
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
	vi.mocked(spawn).mockReset();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe("Windows pointer helper", () => {
	it("starts one hidden process with a fixed encoded program and waits for readiness", async () => {
		vi.stubEnv("SystemRoot", "D:\\Windows");
		const { pointer, starting, child } = setup();
		expect(pointer.start()).toBe(starting);
		expect(spawn).toHaveBeenCalledOnce();
		const [executable, args, options] = vi.mocked(spawn).mock.calls[0];
		expect(executable).toBe(
			"D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
		);
		expect(args).toEqual([
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-EncodedCommand",
			expect.any(String),
		]);
		expect(options).toEqual({
			windowsHide: true,
			shell: false,
			stdio: ["pipe", "pipe", "pipe"],
		});
		await expect(
			pointer.move({ x: 12, y: 34 }, Date.now() + 100),
		).rejects.toThrow("not ready");
		// Le protocole doit supporter un message coupé entre deux chunks.
		child.stdout.write('{"type":"rea');
		child.stdout.write('dy"}\r\n');
		await starting;
		expect(pointer.start()).toBe(starting);
		pointer.stop();
	});

	it("sends only coordinates and a deadline, and resolves after the native acknowledgement", async () => {
		const { pointer, send, input } = await ready();
		const expiresAt = Date.now() + 120;
		const moved = vi.fn();
		const moving = pointer.move({ x: 1919, y: 1079 }, expiresAt).then(moved);
		await Promise.resolve();
		expect(moved).not.toHaveBeenCalled();
		expect(input).toHaveLength(1);
		const message = JSON.parse(input[0]);
		expect(message).toEqual({ id: 1, x: 1919, y: 1079, expiresAt });
		send({ type: "ack", id: message.id, applied: true });
		await moving;
		expect(moved).toHaveBeenCalledExactlyOnceWith(true);
		pointer.stop();
	});

	it("does not queue a second move and becomes available again after its acknowledgement", async () => {
		const { pointer, send, input } = await ready();
		const first = pointer.move({ x: 1, y: 2 }, Date.now() + 100);
		await expect(
			pointer.move({ x: 3, y: 4 }, Date.now() + 100),
		).rejects.toThrow("already pending");
		expect(input).toHaveLength(1);
		send({ type: "ack", id: 1, applied: true });
		await expect(first).resolves.toBe(true);
		const next = pointer.move({ x: 3, y: 4 }, Date.now() + 100);
		expect(input).toHaveLength(2);
		send({ type: "ack", id: 2, applied: true });
		await expect(next).resolves.toBe(true);
		pointer.stop();
	});

	it("drops an expired move before writing and reports expiration detected by the helper", async () => {
		const { pointer, send, input } = await ready();
		await expect(pointer.move({ x: 1, y: 2 }, Date.now())).resolves.toBe(false);
		expect(input).toHaveLength(0);
		const moving = pointer.move({ x: 1, y: 2 }, Date.now() + 100);
		send({ type: "ack", id: 1, applied: false });
		await expect(moving).resolves.toBe(false);
		pointer.stop();
	});

	it.each([
		{ x: Number.NaN, y: 1, deadline: 100 },
		{ x: 1, y: Number.POSITIVE_INFINITY, deadline: 100 },
		{ x: 1.25, y: 1, deadline: 100 },
		{ x: 2147483648, y: 1, deadline: 100 },
		{ x: 1, y: -2147483649, deadline: 100 },
		{ x: 1, y: 2, deadline: Number.NaN },
	])("rejects invalid native coordinates or deadlines: %j", async (value) => {
		const { pointer, input } = await ready();
		await expect(
			pointer.move(value, Date.now() + value.deadline),
		).rejects.toThrow("Invalid");
		expect(input).toHaveLength(0);
		pointer.stop();
	});

	it("cancels a cold start once and ignores late output and exit from its process", async () => {
		const first = setup();
		const rejected = expect(first.starting).rejects.toMatchObject({
			name: "AbortError",
		});
		first.pointer.stop();
		first.pointer.stop();
		await rejected;
		expect(first.child.kill).toHaveBeenCalledOnce();
		const replacement = createChild();
		const restarted = first.pointer.start();
		first.send({ type: "ready" });
		first.child.emit("exit", 1);
		first.child.emit("error", new Error("Late failure"));
		replacement.send({ type: "ready" });
		await restarted;
		expect(replacement.child.kill).not.toHaveBeenCalled();
		first.pointer.stop();
	});

	it("cancels an in-flight move and ignores its late acknowledgement after a restart", async () => {
		const first = await ready();
		const moving = first.pointer.move({ x: 1, y: 2 }, Date.now() + 100);
		const rejected = expect(moving).rejects.toMatchObject({
			name: "AbortError",
		});
		first.pointer.stop();
		await rejected;
		expect(first.child.stdin.destroyed).toBe(true);
		const replacement = createChild();
		const restarting = first.pointer.start();
		replacement.send({ type: "ready" });
		await restarting;
		const next = first.pointer.move({ x: 3, y: 4 }, Date.now() + 100);
		first.send({ type: "ack", id: 1, applied: true });
		first.child.emit("exit", 0);
		replacement.send({ type: "ack", id: 2, applied: true });
		await expect(next).resolves.toBe(true);
		expect(replacement.child.kill).not.toHaveBeenCalled();
		first.pointer.stop();
	});

	it("terminates a process that never becomes ready after fifteen seconds", async () => {
		const { starting, child } = setup();
		const rejected = expect(starting).rejects.toThrow("startup timed out");
		await vi.advanceTimersByTimeAsync(15000);
		await rejected;
		expect(child.kill).toHaveBeenCalledOnce();
	});

	it("terminates a stalled native move after five hundred milliseconds", async () => {
		const { pointer, child } = await ready();
		const moving = pointer.move({ x: 1, y: 2 }, Date.now() + 100);
		const rejected = expect(moving).rejects.toThrow(
			"acknowledgement timed out",
		);
		await vi.advanceTimersByTimeAsync(500);
		await rejected;
		expect(child.kill).toHaveBeenCalledOnce();
		await expect(
			pointer.move({ x: 1, y: 2 }, Date.now() + 100),
		).rejects.toThrow("not ready");
	});

	it("rejects a startup failure and can start a replacement", async () => {
		const first = setup();
		const rejected = expect(first.starting).rejects.toThrow("spawn failed");
		first.child.emit("error", new Error("spawn failed"));
		await rejected;
		const replacement = createChild();
		const restarting = first.pointer.start();
		replacement.send({ type: "ready" });
		await restarting;
		first.pointer.stop();
	});

	it("reports an unexpected exit using bounded stderr", async () => {
		const { starting, child } = setup();
		const rejected = expect(starting).rejects.toThrow(/process exited.*tail/s);
		child.stderr.write(`${"x".repeat(20000)}tail`);
		child.emit("exit", 1);
		await rejected;
		await starting.catch((error: Error) =>
			expect(error.message.length).toBeLessThan(4200),
		);
	});

	it.each(["stdin", "stdout", "stderr"] as const)(
		"rejects a move after a %s pipe failure",
		async (pipe) => {
			const { pointer, child } = await ready();
			const moving = pointer.move({ x: 1, y: 2 }, Date.now() + 100);
			const rejected = expect(moving).rejects.toThrow("pipe failed");
			child[pipe].emit("error", new Error("pipe failed"));
			await rejected;
			expect(child.kill).toHaveBeenCalledOnce();
		},
	);

	it("rejects a failed write callback", async () => {
		const { pointer, child } = await ready();
		vi.spyOn(child.stdin, "write").mockImplementation((...args: unknown[]) => {
			const callback = args.at(-1);
			if (typeof callback === "function") callback(new Error("write failed"));
			return false;
		});
		await expect(
			pointer.move({ x: 1, y: 2 }, Date.now() + 100),
		).rejects.toThrow("write failed");
		expect(child.kill).toHaveBeenCalledOnce();
	});

	it.each([
		"invalid JSON\n",
		`${JSON.stringify({ type: "ack", id: 99, applied: true })}\n`,
		`${JSON.stringify({ type: "ack", id: 1, applied: "yes" })}\n`,
		`${JSON.stringify({ type: "error", message: "Native move refused" })}\n`,
	])("rejects invalid or failed native responses: %s", async (response) => {
		const { pointer, child } = await ready();
		const moving = pointer.move({ x: 1, y: 2 }, Date.now() + 100);
		const rejected = expect(moving).rejects.toBeInstanceOf(Error);
		child.stdout.write(response);
		await rejected;
		expect(child.kill).toHaveBeenCalledOnce();
	});

	it("bounds unterminated native output", async () => {
		const { child, starting } = setup();
		const rejected = expect(starting).rejects.toThrow("exceeded its limit");
		child.stdout.write("x".repeat(8193));
		await rejected;
		expect(child.kill).toHaveBeenCalledOnce();
	});

	it("sends native mouse button, scroll, key, and releaseAll commands", async () => {
		const { pointer, send, input } = await ready();
		const expiresAt = Date.now() + 100;

		const btnPromise = pointer.button?.("down", "left", expiresAt);
		expect(JSON.parse(input[0])).toEqual({
			id: 1,
			op: "button",
			action: "down",
			button: "left",
			expiresAt,
		});
		send({ type: "ack", id: 1, applied: true });
		await expect(btnPromise).resolves.toBe(true);

		const scrollPromise = pointer.scroll?.(-120, expiresAt);
		expect(JSON.parse(input[1])).toEqual({
			id: 2,
			op: "scroll",
			wheelDelta: -120,
			expiresAt,
		});
		send({ type: "ack", id: 2, applied: true });
		await expect(scrollPromise).resolves.toBe(true);

		const keyPromise = pointer.sendKey?.("Enter", expiresAt);
		expect(JSON.parse(input[2])).toEqual({
			id: 3,
			op: "key",
			key: "Enter",
			expiresAt,
		});
		send({ type: "ack", id: 3, applied: true });
		await expect(keyPromise).resolves.toBe(true);

		const releasePromise = pointer.releaseAll?.();
		expect(JSON.parse(input[3])).toMatchObject({
			id: 4,
			op: "releaseAll",
		});
		send({ type: "ack", id: 4, applied: true });
		await expect(releasePromise).resolves.toBe(true);

		pointer.stop();
	});
});
