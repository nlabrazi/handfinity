import { execFile } from "node:child_process";
import { win32 } from "node:path";

// Programme fixe : le PID validé est fourni par le main dans l'environnement.
const configureScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class HandfinityTrackingPerformance {
  [StructLayout(LayoutKind.Sequential)]
  public struct PowerState { public uint Version, ControlMask, StateMask; }
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool GetProcessInformation(IntPtr process, int kind, ref PowerState state, uint size);
  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool SetProcessInformation(IntPtr process, int kind, ref PowerState state, uint size);
  [DllImport("kernel32.dll")]
  public static extern bool CloseHandle(IntPtr handle);
  public static void Configure(uint processId) {
    IntPtr handle = OpenProcess(0x1200, false, processId);
    if (handle == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot open renderer process");
    try {
      PowerState state = new PowerState(); state.Version = 1;
      if (!GetProcessInformation(handle, 4, ref state, 12))
        throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot read renderer performance policy");
      state.ControlMask |= 1;
      state.StateMask &= ~1u;
      if (!SetProcessInformation(handle, 4, ref state, 12))
        throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot configure renderer performance policy");
      PowerState confirmed = new PowerState(); confirmed.Version = 1;
      if (!GetProcessInformation(handle, 4, ref confirmed, 12))
        throw new Win32Exception(Marshal.GetLastWin32Error(), "Cannot verify renderer performance policy");
      if ((confirmed.ControlMask & 1) == 0 || (confirmed.StateMask & 1) != 0)
        throw new InvalidOperationException("Windows did not confirm renderer performance policy");
    } finally { CloseHandle(handle); }
  }
}
'@
  $targetProcessId = [uint32]$env:HANDFINITY_TRACKING_PROCESS_ID
  [HandfinityTrackingPerformance]::Configure($targetProcessId)
  [Console]::WriteLine('configured:' + $targetProcessId)
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`;

/** Politique de puissance locale au renderer ; sa priorité CPU reste inchangée. */
export async function configureWindowsTracking(
	processId: number,
	signal?: AbortSignal,
): Promise<void> {
	if (process.platform !== "win32") return;
	if (
		!Number.isSafeInteger(processId) ||
		processId <= 0 ||
		processId > 0xffffffff
	)
		throw new Error("Invalid renderer process ID");
	signal?.throwIfAborted();
	const systemRoot = process.env.SystemRoot || "C:\\Windows";
	if (!win32.isAbsolute(systemRoot))
		throw new Error("Windows system directory must be absolute");
	await new Promise<void>((resolve, reject) => {
		execFile(
			win32.join(
				systemRoot,
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
				Buffer.from(configureScript, "utf16le").toString("base64"),
			],
			{
				encoding: "utf8",
				env: {
					...process.env,
					HANDFINITY_TRACKING_PROCESS_ID: String(processId),
				},
				timeout: 10000,
				maxBuffer: 4096,
				windowsHide: true,
				shell: false,
				signal,
			},
			(error, stdout, stderr) => {
				if (error?.name === "AbortError") return reject(error);
				if (error) {
					const detail =
						stderr.trim() ||
						(error.killed ? "Helper timed out" : error.code || error.message);
					return reject(
						new Error(
							`Windows tracking performance setup failed: ${String(detail).slice(0, 512)}`,
						),
					);
				}
				if (stdout.trim() !== `configured:${processId}`)
					return reject(
						new Error("Windows did not confirm tracking performance setup"),
					);
				resolve();
			},
		);
	});
}
