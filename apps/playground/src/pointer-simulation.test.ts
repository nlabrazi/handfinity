import type { PointerMoveCommand } from "@handfinity/interactions";
import { describe, expect, it } from "vitest";
import { createPointerSimulation } from "./pointer-simulation";

function move(timestamp: number, x = 0.2, y = 0.7): PointerMoveCommand {
	return {
		type: "pointer:move",
		handId: 1,
		timestamp,
		position: { x, y },
	};
}

describe("Pointer command simulation", () => {
	it("executes normalized destination coordinates directly without mirroring", () => {
		const simulation = createPointerSimulation();
		const command = move(80);
		expect(simulation.execute([command])).toEqual({
			position: { x: 0.2, y: 0.7 },
			commands: [command],
			commandCount: 1,
		});
	});

	it("executes a batch in order and logs the latest command first", () => {
		const commands = [move(80, 0, 0), move(100, 1, 1), move(120, 0.4, 0.5)];
		const simulation = createPointerSimulation();
		expect(simulation.execute(commands)).toEqual({
			position: { x: 0.4, y: 0.5 },
			commands: [commands[2], commands[1], commands[0]],
			commandCount: 3,
		});
		expect(commands.map((command) => command.timestamp)).toEqual([
			80, 100, 120,
		]);
	});

	it("keeps the same snapshot and last position when no command arrives", () => {
		const simulation = createPointerSimulation();
		expect(simulation.execute([])).toEqual({
			position: null,
			commands: [],
			commandCount: 0,
		});
		const moved = simulation.execute([move(80)]);
		expect(simulation.execute([])).toBe(moved);
	});

	it("limits the log to eight commands while counting every received command", () => {
		const simulation = createPointerSimulation();
		const firstBatch = Array.from({ length: 10 }, (_, index) => move(index));
		expect(
			simulation
				.execute(firstBatch)
				.commands.map((command) => command.timestamp),
		).toEqual([9, 8, 7, 6, 5, 4, 3, 2]);
		const next = simulation.execute([move(10), move(11)]);
		expect(next.commands.map((command) => command.timestamp)).toEqual([
			11, 10, 9, 8, 7, 6, 5, 4,
		]);
		expect(next.commandCount).toBe(12);
	});

	it("preserves previous snapshots across moves and reset", () => {
		const simulation = createPointerSimulation();
		const command = move(80);
		const original = simulation.execute([command]);
		simulation.execute([move(100, 0.8, 0.3)]);
		simulation.reset();
		expect(original).toEqual({
			position: { x: 0.2, y: 0.7 },
			commands: [command],
			commandCount: 1,
		});
	});

	it("clears the cursor, log and count before a new session", () => {
		const simulation = createPointerSimulation();
		simulation.execute([move(80), move(100)]);
		const empty = simulation.reset();
		expect(empty).toEqual({
			position: null,
			commands: [],
			commandCount: 0,
		});
		expect(simulation.execute([])).toBe(empty);
		const restarted = simulation.execute([move(0, 0.9, 0.1)]);
		expect(restarted.commandCount).toBe(1);
		expect(restarted.position).toEqual({ x: 0.9, y: 0.1 });
	});
});
