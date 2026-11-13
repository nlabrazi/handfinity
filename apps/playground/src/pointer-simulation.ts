import type { PointerMoveCommand } from "@handfinity/engine";

export type PointerSimulationFrame = {
	readonly position: PointerMoveCommand["position"] | null;
	/** Les huit dernières commandes reçues, de la plus récente à la plus ancienne. */
	readonly commands: readonly PointerMoveCommand[];
	readonly commandCount: number;
};

/** Exécute les déplacements normalisés sans interpréter les gestes. */
export function createPointerSimulation() {
	let frame: PointerSimulationFrame;

	function reset(): PointerSimulationFrame {
		frame = { position: null, commands: [], commandCount: 0 };
		return frame;
	}

	reset();

	function execute(
		commands: readonly PointerMoveCommand[],
	): PointerSimulationFrame {
		const latest = commands[commands.length - 1];
		if (!latest) return frame;
		frame = {
			position: latest.position,
			commands: [...commands].reverse().concat(frame.commands).slice(0, 8),
			commandCount: frame.commandCount + commands.length,
		};
		return frame;
	}

	return { execute, reset };
}
