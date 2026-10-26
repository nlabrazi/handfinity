import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { win32 } from "node:path";

export type NativePointer = {
	start(): Promise<void>;
	move(
		point: { readonly x: number; readonly y: number },
		expiresAt: number,
	): Promise<boolean>;
	stop(): void;
};

// Ce programme est fixe : seules des données JSON passent par son entrée.
const helperScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class HandfinityPointer {
  [DllImport("user32.dll", SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool SetPhysicalCursorPos(int x, int y);
}
'@
  [Console]::WriteLine('{"type":"ready"}')
  while ($null -ne ($line = [Console]::ReadLine())) {
    $command = $line | ConvertFrom-Json
    if ($null -eq $command.id -or $null -eq $command.x -or
        $null -eq $command.y -or $null -eq $command.expiresAt) {
      throw 'Invalid pointer command'
    }
    $id = [long]$command.id
    $x = [int]$command.x
    $y = [int]$command.y
    $expiresAt = [long]$command.expiresAt
    if ($id -le 0 -or $x -ne $command.x -or $y -ne $command.y -or
        $expiresAt -ne $command.expiresAt) {
      throw 'Invalid pointer command'
    }
    $applied = $false
    if ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -lt $expiresAt) {
      if (-not [HandfinityPointer]::SetPhysicalCursorPos($x, $y)) {
        throw ('Windows cursor move failed: ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error())
      }
      $applied = $true
    }
    [Console]::WriteLine((@{ type = 'ack'; id = $id; applied = $applied } | ConvertTo-Json -Compress))
  }
} catch {
  [Console]::WriteLine((@{ type = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress))
  exit 1
}
`;

type PendingMove = {
	id: number;
	resolve(applied: boolean): void;
	reject(error: Error): void;
	timer: ReturnType<typeof setTimeout>;
};

type Run = {
	child: ChildProcessWithoutNullStreams;
	started: Promise<void>;
	resolveStart(): void;
	rejectStart(error: Error): void;
	startTimer: ReturnType<typeof setTimeout>;
	ready: boolean;
	pending: PendingMove | null;
	output: string;
	stderr: string;
};

function abortError() {
	const error = new Error("Windows pointer stopped");
	error.name = "AbortError";
	return error;
}

/** Un helper persistant ; le propriétaire choisit l'écran et coalesce les commandes. */
export function createWindowsPointer(): NativePointer {
	let current: Run | null = null;
	let sequence = 0;

	function fail(run: Run, error: Error) {
		if (current !== run) return;
		current = null;
		clearTimeout(run.startTimer);
		run.rejectStart(error);
		if (run.pending) {
			clearTimeout(run.pending.timer);
			run.pending.reject(error);
			run.pending = null;
		}
		run.child.stdin.destroy();
		try {
			run.child.kill();
		} catch {
			// La promesse est déjà rejetée, même si le processus vient de sortir.
		}
	}

	function receive(run: Run, line: string) {
		if (current !== run) return;
		try {
			const message: unknown = JSON.parse(line);
			if (!message || typeof message !== "object") {
				throw new Error("Invalid Windows pointer response");
			}
			if ("type" in message && message.type === "error") {
				throw new Error(
					"message" in message && typeof message.message === "string"
						? message.message.slice(0, 4096)
						: "Windows pointer failed",
				);
			}
			if ("type" in message && message.type === "ready" && !run.ready) {
				run.ready = true;
				clearTimeout(run.startTimer);
				run.resolveStart();
				return;
			}
			if (
				"type" in message &&
				message.type === "ack" &&
				"id" in message &&
				message.id === run.pending?.id &&
				"applied" in message &&
				typeof message.applied === "boolean"
			) {
				const pending = run.pending;
				if (!pending) throw new Error("Unexpected Windows pointer response");
				run.pending = null;
				clearTimeout(pending.timer);
				pending.resolve(message.applied);
				return;
			}
			throw new Error("Unexpected Windows pointer response");
		} catch (error) {
			fail(
				run,
				error instanceof Error ? error : new Error("Windows pointer failed"),
			);
		}
	}

	function start() {
		if (current) return current.started;
		let child: ChildProcessWithoutNullStreams;
		try {
			child = spawn(
				win32.join(
					process.env.SystemRoot || "C:\\Windows",
					"System32",
					"WindowsPowerShell",
					"v1.0",
					"powershell.exe",
				),
				[
					"-NoLogo",
					"-NoProfile",
					"-NonInteractive",
					"-EncodedCommand",
					Buffer.from(helperScript, "utf16le").toString("base64"),
				],
				{ windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] },
			);
		} catch (error) {
			return Promise.reject(error);
		}
		let resolveStart!: () => void;
		let rejectStart!: (error: Error) => void;
		const started = new Promise<void>((resolve, reject) => {
			resolveStart = resolve;
			rejectStart = reject;
		});
		const run: Run = {
			child,
			started,
			resolveStart,
			rejectStart,
			startTimer: setTimeout(
				() => fail(run, new Error("Windows pointer startup timed out")),
				15000,
			),
			ready: false,
			pending: null,
			output: "",
			stderr: "",
		};
		current = run;
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stderr.on("data", (chunk: string) => {
			if (current === run) run.stderr = (run.stderr + chunk).slice(-4096);
		});
		child.stdout.on("data", (chunk: string) => {
			if (current !== run) return;
			run.output += chunk;
			if (run.output.length > 8192) {
				fail(run, new Error("Windows pointer response exceeded its limit"));
				return;
			}
			let newline = run.output.indexOf("\n");
			while (newline !== -1 && current === run) {
				const line = run.output.slice(0, newline).trim();
				run.output = run.output.slice(newline + 1);
				if (line) receive(run, line);
				newline = run.output.indexOf("\n");
			}
		});
		child.on("error", (error) => fail(run, error));
		child.stdin.on("error", (error) => fail(run, error));
		child.stdout.on("error", (error) => fail(run, error));
		child.stderr.on("error", (error) => fail(run, error));
		child.on("exit", () =>
			fail(
				run,
				new Error(
					`Windows pointer process exited${run.stderr ? `: ${run.stderr.trim()}` : ""}`,
				),
			),
		);
		return started;
	}

	function move(
		point: { readonly x: number; readonly y: number },
		expiresAt: number,
	): Promise<boolean> {
		const run = current;
		if (!run?.ready) {
			return Promise.reject(new Error("Windows pointer is not ready"));
		}
		if (
			![point.x, point.y].every(
				(value) =>
					Number.isInteger(value) &&
					value >= -2147483648 &&
					value <= 2147483647,
			) ||
			!Number.isSafeInteger(expiresAt)
		) {
			return Promise.reject(new Error("Invalid Windows pointer destination"));
		}
		if (expiresAt <= Date.now()) return Promise.resolve(false);
		if (run.pending) {
			return Promise.reject(
				new Error("A Windows pointer move is already pending"),
			);
		}
		return new Promise<boolean>((resolve, reject) => {
			const id = ++sequence;
			run.pending = {
				id,
				resolve,
				reject,
				timer: setTimeout(
					() =>
						fail(run, new Error("Windows pointer acknowledgement timed out")),
					500,
				),
			};
			try {
				run.child.stdin.write(
					`${JSON.stringify({ id, x: point.x, y: point.y, expiresAt })}\n`,
					(error) => {
						if (error) fail(run, error);
					},
				);
			} catch (error) {
				fail(
					run,
					error instanceof Error
						? error
						: new Error("Windows pointer input failed"),
				);
			}
		});
	}

	return {
		start,
		move,
		stop() {
			if (current) fail(current, abortError());
		},
	};
}
