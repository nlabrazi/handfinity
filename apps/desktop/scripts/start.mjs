import { execFileSync, spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { release } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));

async function start() {
	let executable;
	let appPath = appRoot;
	const isWsl = process.platform === "linux" && /microsoft/i.test(release());

	if (isWsl) {
		const { devDependencies } = JSON.parse(
			readFileSync(join(appRoot, "package.json"), "utf8"),
		);
		const version = devDependencies.electron;
		const cacheRoot = join(appRoot, "node_modules", ".cache");
		const windowsLocalAppData = execFileSync(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				'[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; [Environment]::GetFolderPath("LocalApplicationData")',
			],
			{ encoding: "utf8" },
		).trim();
		if (!windowsLocalAppData)
			throw new Error("Windows LocalAppData could not be resolved");
		const localAppData = execFileSync("wslpath", ["-u", windowsLocalAppData], {
			encoding: "utf8",
		}).trim();
		// Chromium doit lancer ses processus depuis un disque Windows local.
		const runtimeRoot = join(
			localAppData,
			"Handfinity",
			"Cache",
			`electron-${version}-${process.arch}`,
		);
		const versionFile = join(runtimeRoot, "version");
		executable = join(runtimeRoot, "electron.exe");
		const installedVersion = existsSync(versionFile)
			? readFileSync(versionFile, "utf8").trim().replace(/^v/, "")
			: null;

		if (!existsSync(executable) || installedVersion !== version) {
			console.log(
				`Downloading Electron ${version} for Windows ${process.arch}…`,
			);
			const { downloadArtifact } = await import("@electron/get");
			const archive = await downloadArtifact({
				version,
				platform: "win32",
				arch: process.arch,
				artifactName: "electron",
				cacheRoot: join(cacheRoot, "electron"),
			});
			mkdirSync(runtimeRoot, { recursive: true });
			execFileSync("unzip", ["-q", "-o", archive, "-d", runtimeRoot], {
				stdio: "inherit",
			});
		}
		chmodSync(executable, 0o755);
		appPath = execFileSync("wslpath", ["-w", appRoot], {
			encoding: "utf8",
		}).trim();
	} else {
		executable = (await import("electron")).default;
	}

	const env = { ...process.env };
	delete env.ELECTRON_RUN_AS_NODE;
	const child = spawn(executable, [appPath, ...process.argv.slice(2)], {
		env,
		stdio: "inherit",
	});
	const interrupt = () => child.kill("SIGINT");
	const terminate = () => child.kill("SIGTERM");
	process.once("SIGINT", interrupt);
	process.once("SIGTERM", terminate);
	try {
		await new Promise((resolve, reject) => {
			child.once("error", reject);
			child.once("exit", (code, signal) => {
				process.exitCode = code ?? (signal === "SIGINT" ? 130 : 143);
				resolve();
			});
		});
	} finally {
		process.removeListener("SIGINT", interrupt);
		process.removeListener("SIGTERM", terminate);
	}
}

start().catch((error) => {
	console.error("Handfinity could not start:", error.message ?? error);
	process.exitCode = 1;
});
