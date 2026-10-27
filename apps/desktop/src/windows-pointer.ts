import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { win32 } from "node:path";

export type NativeMouseButton = "left" | "right";
export type NativeMouseButtonAction = "down" | "up" | "click";

export type NativePointer = {
	start(): Promise<void>;
	move(
		point: { readonly x: number; readonly y: number },
		expiresAt: number,
	): Promise<boolean>;
	button?(
		action: NativeMouseButtonAction,
		button: NativeMouseButton,
		expiresAt: number,
	): Promise<boolean>;
	scroll?(wheelDelta: number, expiresAt: number): Promise<boolean>;
	sendKey?(key: string, expiresAt: number): Promise<boolean>;
	releaseAll?(): Promise<boolean>;
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
  private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
  private const uint MOUSEEVENTF_LEFTUP = 0x0004;
  private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
  private const uint MOUSEEVENTF_RIGHTUP = 0x0010;
  private const uint MOUSEEVENTF_WHEEL = 0x0800;
  private const uint KEYEVENTF_KEYUP = 0x0002;
  private static bool leftDown = false;
  private static bool rightDown = false;

  [DllImport("user32.dll", SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool SetPhysicalCursorPos(int x, int y);

  [DllImport("user32.dll")]
  private static extern void mouse_event(uint dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);

  [DllImport("user32.dll")]
  private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  [DllImport("user32.dll")]
  private static extern short VkKeyScanW(char ch);

  public static void MouseButton(string button, string action) {
    if (button == "left") {
      if (action == "down" && !leftDown) {
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        leftDown = true;
      } else if (action == "up" && leftDown) {
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        leftDown = false;
      } else if (action == "click") {
        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
        leftDown = false;
      }
    } else if (button == "right") {
      if (action == "down" && !rightDown) {
        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
        rightDown = true;
      } else if (action == "up" && rightDown) {
        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
        rightDown = false;
      } else if (action == "click") {
        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, UIntPtr.Zero);
        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
        rightDown = false;
      }
    }
  }

  public static void MouseWheel(int wheelDelta) {
    mouse_event(MOUSEEVENTF_WHEEL, 0, 0, wheelDelta, UIntPtr.Zero);
  }

  private static byte ResolveSpecialVk(string key) {
    switch (key) {
      case "Backspace": return 0x08;
      case "Tab": return 0x09;
      case "Enter": return 0x0D;
      case "Escape": return 0x1B;
      case "Space": return 0x20;
      case "ArrowLeft": return 0x25;
      case "ArrowUp": return 0x26;
      case "ArrowRight": return 0x27;
      case "ArrowDown": return 0x28;
      default: return 0;
    }
  }

  public static void SendKey(string key) {
    byte special = ResolveSpecialVk(key);
    if (special != 0) {
      keybd_event(special, 0, 0, UIntPtr.Zero);
      keybd_event(special, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
      return;
    }
    foreach (char ch in key) {
      short vkAndShift = VkKeyScanW(ch);
      if (vkAndShift == -1) continue;
      byte vk = (byte)(vkAndShift & 0xFF);
      bool shift = (vkAndShift & 0x0100) != 0;
      if (shift) keybd_event(0x10, 0, 0, UIntPtr.Zero);
      keybd_event(vk, 0, 0, UIntPtr.Zero);
      keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
      if (shift) keybd_event(0x10, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }
  }

  public static void ReleaseAll() {
    if (leftDown) {
      mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
      leftDown = false;
    }
    if (rightDown) {
      mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
      rightDown = false;
    }
  }
}
'@
  [Console]::WriteLine('{"type":"ready"}')
  try {
    while ($null -ne ($line = [Console]::ReadLine())) {
      $command = $line | ConvertFrom-Json
      if ($null -eq $command.id -or $null -eq $command.expiresAt) {
        throw 'Invalid pointer command'
      }
      $id = [long]$command.id
      $expiresAt = [long]$command.expiresAt
      if ($id -le 0 -or $expiresAt -ne $command.expiresAt) {
        throw 'Invalid pointer command'
      }
      $op = if ($null -eq $command.op) { 'move' } else { [string]$command.op }
      $applied = $false
      if ($op -eq 'releaseAll') {
        [HandfinityPointer]::ReleaseAll()
        $applied = $true
      } elseif ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -lt $expiresAt) {
        if ($op -eq 'move') {
          if ($null -eq $command.x -or $null -eq $command.y) {
            throw 'Invalid pointer command'
          }
          $x = [int]$command.x
          $y = [int]$command.y
          if ($x -ne $command.x -or $y -ne $command.y) {
            throw 'Invalid pointer command'
          }
          if (-not [HandfinityPointer]::SetPhysicalCursorPos($x, $y)) {
            throw ('Windows cursor move failed: ' + [Runtime.InteropServices.Marshal]::GetLastWin32Error())
          }
          $applied = $true
        } elseif ($op -eq 'button') {
          [HandfinityPointer]::MouseButton([string]$command.button, [string]$command.action)
          $applied = $true
        } elseif ($op -eq 'scroll') {
          [HandfinityPointer]::MouseWheel([int]$command.wheelDelta)
          $applied = $true
        } elseif ($op -eq 'key') {
          [HandfinityPointer]::SendKey([string]$command.key)
          $applied = $true
        } else {
          throw 'Invalid pointer command'
        }
      }
      [Console]::WriteLine((@{ type = 'ack'; id = $id; applied = $applied } | ConvertTo-Json -Compress))
    }
  } finally {
    [HandfinityPointer]::ReleaseAll()
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

	function sendPayload(
		payload: Record<string, unknown>,
		expiresAt: number,
		ignoreExpiry = false,
	): Promise<boolean> {
		const run = current;
		if (!run?.ready) {
			return Promise.reject(new Error("Windows pointer is not ready"));
		}
		if (!Number.isSafeInteger(expiresAt)) {
			return Promise.reject(new Error("Invalid Windows pointer destination"));
		}
		if (!ignoreExpiry && expiresAt <= Date.now()) {
			return Promise.resolve(false);
		}
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
					`${JSON.stringify({ id, ...payload, expiresAt })}\n`,
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

	function move(
		point: { readonly x: number; readonly y: number },
		expiresAt: number,
	): Promise<boolean> {
		if (
			![point.x, point.y].every(
				(value) =>
					Number.isInteger(value) &&
					value >= -2147483648 &&
					value <= 2147483647,
			)
		) {
			return Promise.reject(new Error("Invalid Windows pointer destination"));
		}
		return sendPayload({ x: point.x, y: point.y }, expiresAt);
	}

	function button(
		action: NativeMouseButtonAction,
		btn: NativeMouseButton,
		expiresAt: number,
	): Promise<boolean> {
		if (
			!["down", "up", "click"].includes(action) ||
			!["left", "right"].includes(btn)
		) {
			return Promise.reject(new Error("Invalid Windows mouse button command"));
		}
		return sendPayload({ op: "button", action, button: btn }, expiresAt);
	}

	function scroll(wheelDelta: number, expiresAt: number): Promise<boolean> {
		if (
			!Number.isInteger(wheelDelta) ||
			wheelDelta === 0 ||
			wheelDelta < -12000 ||
			wheelDelta > 12000
		) {
			return Promise.reject(new Error("Invalid Windows scroll delta"));
		}
		return sendPayload({ op: "scroll", wheelDelta }, expiresAt);
	}

	function sendKey(key: string, expiresAt: number): Promise<boolean> {
		if (typeof key !== "string" || key.length === 0 || key.length > 32) {
			return Promise.reject(new Error("Invalid Windows key input"));
		}
		return sendPayload({ op: "key", key }, expiresAt);
	}

	function releaseAll(): Promise<boolean> {
		return sendPayload({ op: "releaseAll" }, Date.now() + 1000, true);
	}

	return {
		start,
		move,
		button,
		scroll,
		sendKey,
		releaseAll,
		stop() {
			if (current) fail(current, abortError());
		},
	};
}
