import { type ExecFileException, execFile } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureWindowsTracking } from "./windows-tracking-performance.js";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));

const platform = Object.getOwnPropertyDescriptor(process, "platform");
if (!platform) throw new Error("Missing process platform descriptor");

type Callback = (
	error: ExecFileException | null,
	stdout: string,
	stderr: string,
) => void;

function invocation(index = 0) {
	const call = vi.mocked(execFile).mock.calls[index];
	if (!call) throw new Error("Missing Windows helper call");
	return {
		executable: call[0],
		args: call[1] as readonly string[],
		options: call[2],
		callback: call[3] as Callback,
	};
}

beforeEach(() => {
	Object.defineProperty(process, "platform", { value: "win32" });
	vi.stubEnv("SystemRoot", "C:\\Windows");
	vi.mocked(execFile).mockReset();
});

afterEach(() => {
	Object.defineProperty(process, "platform", platform);
	vi.unstubAllEnvs();
});

describe("Windows renderer tracking performance", () => {
	it.each(["linux", "darwin"])("does nothing on %s", async (target) => {
		Object.defineProperty(process, "platform", { value: target });
		await expect(configureWindowsTracking(123)).resolves.toBeUndefined();
		expect(execFile).not.toHaveBeenCalled();
	});

	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 0x100000000])(
		"rejects an invalid renderer process ID before launch: %s",
		async (processId) => {
			await expect(configureWindowsTracking(processId)).rejects.toThrow(
				"Invalid renderer process ID",
			);
			expect(execFile).not.toHaveBeenCalled();
		},
	);

	it("uses an absolute Windows executable, bounded execution and the supplied abort signal", async () => {
		vi.stubEnv("SystemRoot", "D:\\Windows");
		const abort = new AbortController();
		const configured = configureWindowsTracking(123, abort.signal);
		const call = invocation();
		expect(call.executable).toBe(
			"D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
		);
		expect(call.args.slice(0, -1)).toEqual([
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-EncodedCommand",
		]);
		expect(call.options).toMatchObject({
			encoding: "utf8",
			windowsHide: true,
			shell: false,
			timeout: 10000,
			maxBuffer: 4096,
			signal: abort.signal,
		});
		call.callback(null, "configured:123\r\n", "");
		await expect(configured).resolves.toBeUndefined();
	});

	it("keeps the program fixed and supplies the process ID only through a local environment", async () => {
		vi.stubEnv("HANDFINITY_TRACKING_PROCESS_ID", "old");
		const first = configureWindowsTracking(123);
		const next = configureWindowsTracking(456);
		const firstCall = invocation(0);
		const nextCall = invocation(1);
		expect(firstCall.args).toEqual(nextCall.args);
		expect(firstCall.options).toMatchObject({
			env: { HANDFINITY_TRACKING_PROCESS_ID: "123" },
		});
		expect(nextCall.options).toMatchObject({
			env: { HANDFINITY_TRACKING_PROCESS_ID: "456" },
		});
		expect(process.env.HANDFINITY_TRACKING_PROCESS_ID).toBe("old");
		const program = Buffer.from(firstCall.args.at(-1) ?? "", "base64").toString(
			"utf16le",
		);
		expect(program).toContain("GetProcessInformation");
		expect(program).toContain("SetProcessInformation");
		expect(program).toContain("state.ControlMask |= 1");
		expect(program).toContain("state.StateMask &= ~1u");
		expect(program).toContain("finally { CloseHandle(handle); }");
		expect(program).not.toMatch(
			/SetPriorityClass|SetThreadPriority|HIGH_PRIORITY_CLASS|SetPhysicalCursorPos|SetCursorPos|ExecutionPolicy|Set-ItemProperty/,
		);
		firstCall.callback(null, "configured:123", "");
		nextCall.callback(null, "configured:456", "");
		await Promise.all([first, next]);
	});

	it("falls back to the standard absolute Windows directory when SystemRoot is absent", async () => {
		vi.stubEnv("SystemRoot", undefined);
		const configured = configureWindowsTracking(123);
		expect(invocation().executable).toBe(
			"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
		);
		invocation().callback(null, "configured:123", "");
		await configured;
	});

	it("rejects a relative system directory instead of searching the working directory", async () => {
		vi.stubEnv("SystemRoot", "relative-directory");
		await expect(configureWindowsTracking(123)).rejects.toThrow(
			"must be absolute",
		);
		expect(execFile).not.toHaveBeenCalled();
	});

	it("reports a native failure using bounded useful stderr", async () => {
		const configured = configureWindowsTracking(123);
		const rejected = expect(configured).rejects.toThrow(
			/Cannot open renderer process/,
		);
		invocation().callback(
			Object.assign(new Error("Command failed"), { code: 1 }),
			"",
			`Cannot open renderer process: access denied ${"x".repeat(4096)}`,
		);
		await rejected;
		await configured.catch((error: Error) =>
			expect(error.message.length).toBeLessThan(600),
		);
	});

	it("reports a timeout delivered by execFile without exposing the encoded command", async () => {
		const configured = configureWindowsTracking(123);
		const rejected = expect(configured).rejects.toThrow("Helper timed out");
		invocation().callback(
			Object.assign(new Error("EncodedCommand payload"), {
				killed: true,
				signal: "SIGTERM" as const,
			}),
			"",
			"",
		);
		await rejected;
	});

	it("keeps an abort callback distinguishable from an operational failure", async () => {
		const abort = new AbortController();
		const configured = configureWindowsTracking(123, abort.signal);
		const error = Object.assign(new Error("Aborted"), { name: "AbortError" });
		const rejected = expect(configured).rejects.toBe(error);
		abort.abort();
		invocation().callback(error, "", "");
		await rejected;
	});

	it("does not launch a helper for an already aborted request", async () => {
		const abort = new AbortController();
		const reason = new Error("Window closed");
		abort.abort(reason);
		await expect(configureWindowsTracking(123, abort.signal)).rejects.toBe(
			reason,
		);
		expect(execFile).not.toHaveBeenCalled();
	});

	it.each(["", "configured:456", "unexpected output"])(
		"requires confirmation of the actual renderer: %s",
		async (output) => {
			const configured = configureWindowsTracking(123);
			const rejected = expect(configured).rejects.toThrow("did not confirm");
			invocation().callback(null, output, "");
			await rejected;
		},
	);

	it("rejects a synchronous helper launch failure", async () => {
		const failure = new Error("PowerShell unavailable");
		vi.mocked(execFile).mockImplementationOnce(() => {
			throw failure;
		});
		await expect(configureWindowsTracking(123)).rejects.toBe(failure);
	});
});
