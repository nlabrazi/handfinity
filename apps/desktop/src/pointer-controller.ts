import type {
	PointerActionCommand,
	PointerMoveCommand,
} from "@handfinity/engine/commands";
import type { PointerControlState } from "./pointer-contract.js";
import type { NativePointer } from "./windows-pointer.js";

type ScreenBounds = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;

type PointerControllerOptions = {
	supported: boolean;
	driver: NativePointer;
	getBounds(): ScreenBounds;
	registerStop(stop: () => void): boolean;
	unregisterStop(): void;
	onState(state: PointerControlState): void;
};

const MAX_FRAME_AGE_MS = 250;
// Cadence demandée : la précision effective dépend des timers du système.
const PRESENTATION_INTERVAL_MS = 1000 / 120;
const MIN_TRAJECTORY_DURATION_MS = 1000 / 60;
const MAX_TRAJECTORY_DURATION_MS = 100;
const WHEEL_STEP = 120;

type PhysicalPoint = { x: number; y: number };
type PointerTarget = {
	command: PointerMoveCommand;
	expiresAt: number;
	duration: number;
	continuing: boolean;
};
type PointerTrajectory = {
	from: PhysicalPoint;
	to: PhysicalPoint;
	startedAt: number;
	duration: number;
	expiresAt: number;
};

type QueuedDriverTask =
	| {
			kind: "button";
			action: "down" | "up" | "click";
			button: "left" | "right";
			expiresAt: number;
	  }
	| {
			kind: "scroll";
			wheelDelta: number;
			expiresAt: number;
	  }
	| {
			kind: "key";
			key: string;
			expiresAt: number;
	  }
	| {
			kind: "releaseAll";
	  };

function samePoint(first: PhysicalPoint | null, second: PhysicalPoint) {
	return first !== null && first.x === second.x && first.y === second.y;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNormalizedPosition(
	value: unknown,
): value is Readonly<{ x: number; y: number }> {
	if (!isRecord(value)) return false;
	return [value.x, value.y].every(
		(coordinate) =>
			typeof coordinate === "number" &&
			Number.isFinite(coordinate) &&
			coordinate >= 0 &&
			coordinate <= 1,
	);
}

function isMove(value: unknown): value is PointerMoveCommand {
	if (!isRecord(value) || !isNormalizedPosition(value.position)) return false;
	return (
		value.type === "pointer:move" &&
		Number.isSafeInteger(value.handId) &&
		Number(value.handId) > 0 &&
		typeof value.timestamp === "number" &&
		Number.isFinite(value.timestamp) &&
		value.timestamp >= 0
	);
}

function isAction(value: unknown): value is PointerActionCommand {
	if (!isRecord(value)) return false;
	if (
		!Number.isSafeInteger(value.handId) ||
		Number(value.handId) <= 0 ||
		typeof value.timestamp !== "number" ||
		!Number.isFinite(value.timestamp) ||
		value.timestamp < 0
	) {
		return false;
	}
	if (
		value.type === "pointer:down" ||
		value.type === "pointer:up" ||
		value.type === "pointer:click"
	) {
		return (
			(value.button === "left" || value.button === "right") &&
			isNormalizedPosition(value.position)
		);
	}
	if (value.type === "pointer:scroll") {
		return typeof value.deltaY === "number" && Number.isFinite(value.deltaY);
	}
	return false;
}

/** Consomme les commandes du moteur, sans interpréter de geste. */
export function createPointerController(options: PointerControllerOptions) {
	let state: PointerControlState = {
		phase: options.supported ? "disabled" : "unsupported",
		sessionId: null,
		error: null,
	};
	let generation = 0;
	let activeSession: number | null = null;
	let paused = false;
	let lastCapturedAt = -Infinity;
	let lastCommandTimestamp = -Infinity;
	let commandHandId: number | null = null;
	let suspension = 0;
	let inFlight = false;
	let heldLeftButton = false;
	let pending: PointerTarget | null = null;
	let trajectory: PointerTrajectory | null = null;
	let taskQueue: QueuedDriverTask[] = [];
	let acknowledgedPoint: PhysicalPoint | null = null;
	let acknowledgedAt: number | null = null;
	let lastTargetCapturedAt: number | null = null;
	let presentationTimer: ReturnType<typeof setTimeout> | null = null;
	let watchdog: ReturnType<typeof setTimeout> | null = null;

	function publish(
		phase: PointerControlState["phase"],
		error: string | null = null,
	) {
		const sessionId =
			phase === "waiting" || phase === "moving" || phase === "paused"
				? activeSession
				: null;
		if (
			state.phase === phase &&
			state.error === error &&
			state.sessionId === sessionId
		)
			return;
		state = { phase, sessionId, error };
		options.onState(state);
	}

	function clearWatchdog() {
		if (watchdog !== null) clearTimeout(watchdog);
		watchdog = null;
	}

	function clearPresentationTimer() {
		if (presentationTimer !== null) clearTimeout(presentationTimer);
		presentationTimer = null;
	}

	function suspend() {
		suspension += 1;
		pending = null;
		trajectory = null;
		acknowledgedPoint = null;
		acknowledgedAt = null;
		lastTargetCapturedAt = null;
		commandHandId = null;
		taskQueue = [];
		if (heldLeftButton) {
			heldLeftButton = false;
			if (activeSession !== null && options.driver.releaseAll) {
				taskQueue.push({ kind: "releaseAll" });
			}
		}
		clearPresentationTimer();
		clearWatchdog();
		if (activeSession !== null) publish(paused ? "paused" : "waiting");
		if (taskQueue.length > 0 && !inFlight) void flush();
	}

	function shutdown(
		phase: PointerControlState["phase"],
		error: string | null = null,
	) {
		generation += 1;
		activeSession = null;
		paused = false;
		heldLeftButton = false;
		taskQueue = [];
		suspend();
		inFlight = false;
		lastCapturedAt = -Infinity;
		lastCommandTimestamp = -Infinity;
		options.driver.stop();
		options.unregisterStop();
		publish(phase, error);
		return state;
	}

	function disable() {
		return shutdown(options.supported ? "disabled" : "unsupported");
	}

	function fail(error: unknown) {
		return shutdown(
			"error",
			error instanceof Error ? error.message : "Windows pointer failed",
		);
	}

	async function enable() {
		if (
			!options.supported ||
			state.phase === "starting" ||
			activeSession !== null
		)
			return state;
		const run = ++generation;
		publish("starting");
		try {
			if (!options.registerStop(disable))
				throw new Error("The stop shortcut Ctrl+Alt+Esc is unavailable.");
			await options.driver.start();
			if (generation !== run) return state;
			activeSession = run;
			publish("waiting");
		} catch (error) {
			if (generation === run) fail(error);
		}
		return state;
	}

	function schedulePresentation(startedAt: number) {
		if (presentationTimer !== null || trajectory === null) return;
		const run = generation;
		const suspendedAt = suspension;
		// Aucun rattrapage : le prochain passage utilise directement l'heure courante.
		const timer = setTimeout(
			() => {
				if (presentationTimer !== timer) return;
				presentationTimer = null;
				if (generation === run && suspension === suspendedAt) void flush();
			},
			Math.max(0, PRESENTATION_INTERVAL_MS - (Date.now() - startedAt)),
		);
		presentationTimer = timer;
	}

	function project(command: PointerMoveCommand): PhysicalPoint {
		const bounds = options.getBounds();
		if (
			![bounds.x, bounds.y, bounds.width, bounds.height].every(
				Number.isSafeInteger,
			) ||
			bounds.width < 1 ||
			bounds.height < 1
		)
			throw new Error("The primary display bounds are unavailable.");
		return {
			x: bounds.x + Math.round(command.position.x * (bounds.width - 1)),
			y: bounds.y + Math.round(command.position.y * (bounds.height - 1)),
		};
	}

	async function executeTask(task: QueuedDriverTask): Promise<boolean> {
		switch (task.kind) {
			case "button":
				if (!options.driver.button) return true;
				return options.driver.button(task.action, task.button, task.expiresAt);
			case "scroll":
				if (!options.driver.scroll) return true;
				return options.driver.scroll(task.wheelDelta, task.expiresAt);
			case "key":
				if (!options.driver.sendKey) return true;
				return options.driver.sendKey(task.key, task.expiresAt);
			case "releaseAll":
				if (!options.driver.releaseAll) return true;
				return options.driver.releaseAll();
		}
	}

	async function flush() {
		if (inFlight || activeSession === null) return;
		const run = generation;
		const suspendedAt = suspension;
		const startedAt = Date.now();
		try {
			while (taskQueue.length > 0) {
				const task = taskQueue.shift();
				if (!task) break;
				inFlight = true;
				await executeTask(task);
				inFlight = false;
				if (generation !== run) return;
			}
			if (suspension !== suspendedAt) return;
			if (pending !== null) {
				const target = pending;
				pending = null;
				if (Date.now() >= target.expiresAt) {
					suspend();
					return;
				}
				const to = project(target.command);
				// Une nouvelle cible part du dernier point réellement acquitté.
				trajectory = samePoint(acknowledgedPoint, to)
					? null
					: {
							from: acknowledgedPoint ?? to,
							to,
							startedAt:
								target.continuing && acknowledgedAt !== null
									? acknowledgedAt
									: Date.now(),
							duration: acknowledgedPoint === null ? 0 : target.duration,
							expiresAt: target.expiresAt,
						};
			}
			const move = trajectory;
			if (move === null) return;
			const now = Date.now();
			if (now >= move.expiresAt) {
				suspend();
				return;
			}
			const progress =
				move.duration === 0
					? 1
					: Math.max(0, Math.min(1, (now - move.startedAt) / move.duration));
			const point = {
				x: Math.round(move.from.x + (move.to.x - move.from.x) * progress),
				y: Math.round(move.from.y + (move.to.y - move.from.y) * progress),
			};
			if (samePoint(acknowledgedPoint, point)) {
				if (samePoint(acknowledgedPoint, move.to)) trajectory = null;
				return;
			}
			inFlight = true;
			const applied = await options.driver.move(point, move.expiresAt);
			if (generation !== run || suspension !== suspendedAt) return;
			if (!applied || Date.now() >= move.expiresAt) {
				suspend();
				return;
			}
			acknowledgedPoint = point;
			acknowledgedAt = Date.now();
			if (trajectory === move && samePoint(point, move.to)) trajectory = null;
			publish("moving");
		} catch (error) {
			if (generation === run) fail(error);
		} finally {
			if (generation === run) {
				inFlight = false;
				if (pending !== null || taskQueue.length > 0) void flush();
				else schedulePresentation(startedAt);
			}
		}
	}

	function enqueueActions(
		actions: readonly PointerActionCommand[],
		expiresAt: number,
	) {
		for (const action of actions) {
			if (action.type === "pointer:down") {
				if (action.button === "left") heldLeftButton = true;
				taskQueue.push({
					kind: "button",
					action: "down",
					button: action.button,
					expiresAt,
				});
			} else if (action.type === "pointer:up") {
				if (action.button === "left") heldLeftButton = false;
				taskQueue.push({
					kind: "button",
					action: "up",
					button: action.button,
					expiresAt,
				});
			} else if (action.type === "pointer:click") {
				taskQueue.push({
					kind: "button",
					action: "click",
					button: action.button,
					expiresAt,
				});
			} else if (action.type === "pointer:scroll") {
				// Sur Windows, un wheelDelta négatif défile vers le bas.
				const wheelDelta = Math.max(
					-1200,
					Math.min(1200, Math.round(-action.deltaY * WHEEL_STEP)),
				);
				if (wheelDelta !== 0) {
					taskQueue.push({
						kind: "scroll",
						wheelDelta,
						expiresAt,
					});
				}
			}
		}
	}

	function submit(value: unknown) {
		if (
			activeSession === null ||
			!isRecord(value) ||
			value.sessionId !== activeSession
		)
			return;
		if (
			typeof value.capturedAt !== "number" ||
			!Number.isFinite(value.capturedAt)
		) {
			suspend();
			return;
		}
		if (value.capturedAt <= lastCapturedAt) return;
		const now = Date.now();
		if (
			value.capturedAt < now - MAX_FRAME_AGE_MS ||
			value.capturedAt > now + 50
		) {
			suspend();
			return;
		}
		lastCapturedAt = value.capturedAt;
		if (typeof value.paused !== "boolean") {
			suspend();
			return;
		}
		const command = value.command;
		if (command !== null && !isMove(command)) {
			suspend();
			return;
		}
		let actions: readonly PointerActionCommand[] = [];
		if (value.actions !== undefined) {
			if (!Array.isArray(value.actions) || !value.actions.every(isAction)) {
				suspend();
				return;
			}
			actions = value.actions;
		}
		let keys: readonly string[] = [];
		if (value.keys !== undefined) {
			if (
				!Array.isArray(value.keys) ||
				!value.keys.every(
					(k): k is string =>
						typeof k === "string" && k.length > 0 && k.length <= 32,
				)
			) {
				suspend();
				return;
			}
			keys = value.keys;
		}
		if (
			!value.paused &&
			command !== null &&
			command.timestamp <= lastCommandTimestamp &&
			actions.length === 0 &&
			keys.length === 0
		)
			return;
		const wasPaused = paused;
		paused = value.paused;
		if (paused || wasPaused) suspend();
		if (paused) return;

		const expiresAt = Math.floor(value.capturedAt + MAX_FRAME_AGE_MS);
		for (const key of keys) {
			taskQueue.push({ kind: "key", key, expiresAt });
		}
		if (actions.length > 0) {
			enqueueActions(actions, expiresAt);
		}
		if (command === null) {
			if (actions.length === 0 && keys.length === 0 && !heldLeftButton) {
				suspend();
				return;
			}
			if (taskQueue.length > 0 && presentationTimer === null) {
				void flush();
			}
			return;
		}
		lastCommandTimestamp = Math.max(lastCommandTimestamp, command.timestamp);
		if (commandHandId !== null && commandHandId !== command.handId) suspend();
		commandHandId = command.handId;
		const duration = Math.max(
			MIN_TRAJECTORY_DURATION_MS,
			Math.min(
				MAX_TRAJECTORY_DURATION_MS,
				lastTargetCapturedAt === null
					? MIN_TRAJECTORY_DURATION_MS
					: value.capturedAt - lastTargetCapturedAt,
			),
		);
		lastTargetCapturedAt = value.capturedAt;
		pending = {
			command,
			expiresAt,
			duration,
			continuing: trajectory !== null,
		};
		clearWatchdog();
		watchdog = setTimeout(suspend, Math.max(0, expiresAt - now));
		// Conserver le prochain créneau évite un passage vide à chaque image source.
		if (presentationTimer === null) void flush();
	}

	return { getState: () => state, enable, disable, submit };
}
