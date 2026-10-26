import type { PointerMoveCommand } from "@handfinity/interactions/pointer-commands";
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

function samePoint(first: PhysicalPoint | null, second: PhysicalPoint) {
	return first !== null && first.x === second.x && first.y === second.y;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMove(value: unknown): value is PointerMoveCommand {
	if (!isRecord(value) || !isRecord(value.position)) return false;
	return (
		value.type === "pointer:move" &&
		Number.isSafeInteger(value.handId) &&
		Number(value.handId) > 0 &&
		typeof value.timestamp === "number" &&
		Number.isFinite(value.timestamp) &&
		value.timestamp >= 0 &&
		[value.position.x, value.position.y].every(
			(coordinate) =>
				typeof coordinate === "number" &&
				Number.isFinite(coordinate) &&
				coordinate >= 0 &&
				coordinate <= 1,
		)
	);
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
	let lastCapturedAt = -Infinity;
	let lastCommandTimestamp = -Infinity;
	let suspension = 0;
	let inFlight = false;
	let pending: PointerTarget | null = null;
	let trajectory: PointerTrajectory | null = null;
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
			phase === "waiting" || phase === "moving" ? activeSession : null;
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
		clearPresentationTimer();
		clearWatchdog();
		if (activeSession !== null) publish("waiting");
	}

	function shutdown(
		phase: PointerControlState["phase"],
		error: string | null = null,
	) {
		generation += 1;
		activeSession = null;
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

	async function flush() {
		if (inFlight || activeSession === null) return;
		const run = generation;
		const suspendedAt = suspension;
		const startedAt = Date.now();
		try {
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
				if (pending !== null) void flush();
				else schedulePresentation(startedAt);
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
		if (value.command === null || !isMove(value.command)) {
			suspend();
			return;
		}
		if (value.command.timestamp <= lastCommandTimestamp) return;
		lastCommandTimestamp = value.command.timestamp;
		const expiresAt = Math.floor(value.capturedAt + MAX_FRAME_AGE_MS);
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
			command: value.command,
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
