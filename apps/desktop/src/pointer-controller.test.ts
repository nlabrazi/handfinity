import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPointerController } from "./pointer-controller";
import type { NativePointer } from "./windows-pointer";

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function setup(supported = true) {
	const driver = {
		start: vi.fn<NativePointer["start"]>().mockResolvedValue(undefined),
		move: vi.fn<NativePointer["move"]>().mockResolvedValue(true),
		stop: vi.fn<NativePointer["stop"]>(),
	};
	const getBounds = vi.fn(() => ({ x: 0, y: 0, width: 1920, height: 1080 }));
	const registerStop = vi
		.fn<(_: () => void) => boolean>()
		.mockReturnValue(true);
	const unregisterStop = vi.fn();
	const onState = vi.fn();
	const controller = createPointerController({
		supported,
		driver,
		getBounds,
		registerStop,
		unregisterStop,
		onState,
	});
	return {
		controller,
		driver,
		getBounds,
		registerStop,
		unregisterStop,
		onState,
	};
}

function update(
	sessionId: number | null,
	timestamp = 1000,
	position = { x: 0.25, y: 0.75 },
	capturedAt = Date.now(),
) {
	return {
		sessionId,
		capturedAt,
		command: { type: "pointer:move", handId: 1, timestamp, position },
	};
}

async function settle() {
	// Un ACK peut immédiatement lancer le déplacement conservé en attente.
	await Promise.resolve();
	await Promise.resolve();
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(1_800_000_000_000);
});

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("System pointer activation", () => {
	it("starts disabled and ignores commands until explicit activation", async () => {
		const { controller, driver, registerStop } = setup();
		expect(controller.getState()).toEqual({
			phase: "disabled",
			sessionId: null,
			error: null,
		});
		controller.submit(update(1));
		expect(driver.start).not.toHaveBeenCalled();
		expect(driver.move).not.toHaveBeenCalled();
		const state = await controller.enable();
		expect(registerStop).toHaveBeenCalledOnce();
		expect(driver.start).toHaveBeenCalledOnce();
		expect(state.phase).toBe("waiting");
		expect(state.sessionId).toEqual(expect.any(Number));
		expect(driver.move).not.toHaveBeenCalled();
		await controller.enable();
		expect(driver.start).toHaveBeenCalledOnce();
	});

	it("does not activate the driver or shortcut on an unsupported platform", async () => {
		const { controller, driver, registerStop } = setup(false);
		const state = await controller.enable();
		expect(state).toEqual({
			phase: "unsupported",
			sessionId: null,
			error: null,
		});
		controller.submit(update(1));
		expect(registerStop).not.toHaveBeenCalled();
		expect(driver.start).not.toHaveBeenCalled();
		expect(driver.move).not.toHaveBeenCalled();
	});

	it("disables through the registered stop shortcut and drops pending movement", async () => {
		const { controller, driver, registerStop, unregisterStop } = setup();
		const ack = deferred<boolean>();
		driver.move.mockReturnValueOnce(ack.promise);
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId));
		vi.setSystemTime(Date.now() + 1);
		controller.submit(update(sessionId, 1001));
		registerStop.mock.calls[0]?.[0]();
		expect(controller.getState().phase).toBe("disabled");
		expect(driver.stop).toHaveBeenCalledOnce();
		expect(unregisterStop).toHaveBeenCalledOnce();
		ack.resolve(true);
		await settle();
		expect(driver.move).toHaveBeenCalledOnce();
		expect(controller.getState().phase).toBe("disabled");
	});

	it("stays disabled when startup completes after an explicit stop", async () => {
		const { controller, driver, unregisterStop } = setup();
		const starting = deferred<void>();
		driver.start.mockReturnValueOnce(starting.promise);
		const enabling = controller.enable();
		expect(controller.getState().phase).toBe("starting");
		await controller.enable();
		expect(driver.start).toHaveBeenCalledOnce();
		controller.disable();
		starting.resolve(undefined);
		await enabling;
		expect(controller.getState()).toMatchObject({
			phase: "disabled",
			sessionId: null,
		});
		expect(driver.stop).toHaveBeenCalledOnce();
		expect(unregisterStop).toHaveBeenCalledOnce();
	});

	it("issues a new session on reactivation and ignores old commands and ACKs", async () => {
		const { controller, driver } = setup();
		const oldAck = deferred<boolean>();
		driver.move.mockReturnValueOnce(oldAck.promise);
		const first = await controller.enable();
		controller.submit(update(first.sessionId));
		controller.disable();
		const second = await controller.enable();
		expect(second.sessionId).not.toBe(first.sessionId);
		controller.submit(update(first.sessionId));
		oldAck.resolve(true);
		await settle();
		expect(controller.getState()).toEqual(second);
		expect(driver.move).toHaveBeenCalledOnce();
		controller.submit(update(second.sessionId, 1));
		await settle();
		expect(driver.move).toHaveBeenCalledTimes(2);
		expect(controller.getState().phase).toBe("moving");
	});
});

describe("System pointer destinations", () => {
	it("converts a fractional performance timestamp into an integer native deadline", async () => {
		const { controller, driver } = setup();
		const { sessionId } = await controller.enable();
		// performance.timeOrigin + frame.timestamp peut contenir des décimales.
		const capturedAt = Date.now() - 0.75;
		controller.submit(update(sessionId, 1000.25, { x: 0, y: 0 }, capturedAt));
		expect(driver.move).toHaveBeenCalledExactlyOnceWith(
			{ x: 0, y: 0 },
			Date.now() + 249,
		);
	});

	it.each([
		{ position: { x: 0, y: 0 }, point: { x: -200, y: 100 } },
		{ position: { x: 1, y: 1 }, point: { x: 3639, y: 2259 } },
		{ position: { x: 0.25, y: 0.75 }, point: { x: 760, y: 1719 } },
	])(
		"projects $position into supplied physical bounds without another mirror",
		async ({ position, point }) => {
			const { controller, driver, getBounds } = setup();
			// Exemple d'écran 1920×1080 à 200 % : le main fournit déjà les pixels physiques.
			getBounds.mockReturnValue({ x: -200, y: 100, width: 3840, height: 2160 });
			const { sessionId } = await controller.enable();
			const capturedAt = Date.now();
			controller.submit(update(sessionId, 1000, position, capturedAt));
			expect(driver.move).toHaveBeenCalledExactlyOnceWith(
				point,
				capturedAt + 250,
			);
			await settle();
			expect(controller.getState().phase).toBe("moving");
		},
	);

	it("reads current bounds for each applied movement", async () => {
		const { controller, driver, getBounds } = setup();
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId, 1000, { x: 1, y: 1 }));
		await settle();
		getBounds.mockReturnValue({ x: 10, y: 20, width: 1, height: 1 });
		vi.setSystemTime(Date.now() + 1);
		controller.submit(update(sessionId, 1001, { x: 1, y: 1 }));
		await vi.advanceTimersByTimeAsync(25);
		expect(driver.move.mock.calls[0]?.[0]).toEqual({ x: 1919, y: 1079 });
		expect(driver.move.mock.lastCall?.[0]).toEqual({ x: 10, y: 20 });
		expect(getBounds).toHaveBeenCalledTimes(2);
	});

	it("fails closed when physical display bounds are unavailable", async () => {
		const { controller, driver, getBounds, unregisterStop } = setup();
		getBounds.mockReturnValue({ x: 0, y: 0, width: 0, height: 1080 });
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId));
		await settle();
		expect(controller.getState()).toMatchObject({
			phase: "error",
			sessionId: null,
			error: expect.stringContaining("bounds"),
		});
		expect(driver.move).not.toHaveBeenCalled();
		expect(driver.stop).toHaveBeenCalledOnce();
		expect(unregisterStop).toHaveBeenCalledOnce();
	});
});

describe("System pointer backpressure and tracking loss", () => {
	it("keeps one move in flight and replaces the pending destination with the latest", async () => {
		const { controller, driver } = setup();
		const firstAck = deferred<boolean>();
		driver.move.mockReturnValueOnce(firstAck.promise);
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId, 1000, { x: 0, y: 0 }));
		vi.setSystemTime(Date.now() + 10);
		controller.submit(update(sessionId, 1010, { x: 0.5, y: 0.5 }));
		vi.setSystemTime(Date.now() + 10);
		controller.submit(update(sessionId, 1020, { x: 1, y: 1 }));
		expect(driver.move).toHaveBeenCalledOnce();
		firstAck.resolve(true);
		await settle();
		expect(driver.move).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(25);
		expect(driver.move.mock.lastCall?.[0]).toEqual({ x: 1919, y: 1079 });
		expect(driver.move.mock.calls.length).toBeGreaterThan(2);
	});

	it("purges pending movement on loss and prevents a late ACK from resuming movement", async () => {
		const { controller, driver } = setup();
		const ack = deferred<boolean>();
		driver.move.mockReturnValueOnce(ack.promise);
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId));
		vi.setSystemTime(Date.now() + 10);
		controller.submit(update(sessionId, 1010));
		vi.setSystemTime(Date.now() + 10);
		controller.submit({ sessionId, capturedAt: Date.now(), command: null });
		ack.resolve(true);
		await settle();
		expect(driver.move).toHaveBeenCalledOnce();
		expect(controller.getState().phase).toBe("waiting");
		vi.setSystemTime(Date.now() + 10);
		controller.submit(update(sessionId, 1030));
		await settle();
		expect(driver.move).toHaveBeenCalledTimes(2);
		expect(controller.getState().phase).toBe("moving");
	});

	it("drops expired pending movement after silence and ignores its late ACK", async () => {
		const { controller, driver } = setup();
		const ack = deferred<boolean>();
		driver.move.mockReturnValueOnce(ack.promise);
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId));
		await vi.advanceTimersByTimeAsync(10);
		controller.submit(update(sessionId, 1010));
		await vi.advanceTimersByTimeAsync(251);
		expect(controller.getState().phase).toBe("waiting");
		ack.resolve(true);
		await settle();
		expect(driver.move).toHaveBeenCalledOnce();
		expect(controller.getState().phase).toBe("waiting");
	});

	it("returns to waiting after an acknowledged movement goes silent", async () => {
		const { controller, driver } = setup();
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId));
		await settle();
		expect(controller.getState().phase).toBe("moving");
		await vi.advanceTimersByTimeAsync(250);
		expect(controller.getState()).toMatchObject({
			phase: "waiting",
			sessionId,
		});
		expect(driver.move).toHaveBeenCalledOnce();
		expect(driver.stop).not.toHaveBeenCalled();
	});

	it("stays waiting when the backend declines an expired move", async () => {
		const { controller, driver } = setup();
		driver.move.mockResolvedValueOnce(false);
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId));
		await settle();
		expect(controller.getState()).toMatchObject({
			phase: "waiting",
			sessionId,
		});
	});
});

describe("System pointer input validation", () => {
	it.each([
		{ name: "old frame", elapsed: 300, capturedAt: () => Date.now() - 251 },
		{ name: "future frame", elapsed: 20, capturedAt: () => Date.now() + 51 },
		{ name: "non-finite time", elapsed: 20, capturedAt: () => Number.NaN },
	])(
		"rejects a $name and clears an older pending command",
		async ({ capturedAt, elapsed }) => {
			const { controller, driver } = setup();
			const ack = deferred<boolean>();
			driver.move.mockReturnValueOnce(ack.promise);
			const { sessionId } = await controller.enable();
			controller.submit(update(sessionId));
			vi.setSystemTime(Date.now() + 10);
			controller.submit(update(sessionId, 1010));
			vi.setSystemTime(Date.now() + elapsed);
			controller.submit(update(sessionId, 1020, undefined, capturedAt()));
			ack.resolve(true);
			await settle();
			expect(driver.move).toHaveBeenCalledOnce();
			expect(controller.getState().phase).toBe("waiting");
		},
	);

	it("purges an older pending move when the next command is malformed", async () => {
		const { controller, driver } = setup();
		const ack = deferred<boolean>();
		driver.move.mockReturnValueOnce(ack.promise);
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId));
		vi.setSystemTime(Date.now() + 10);
		controller.submit(update(sessionId, 1010));
		vi.setSystemTime(Date.now() + 10);
		controller.submit(update(sessionId, 1020, { x: Number.NaN, y: 0 }));
		ack.resolve(true);
		await settle();
		expect(driver.move).toHaveBeenCalledOnce();
		expect(controller.getState().phase).toBe("waiting");
	});

	it.each([
		null,
		[],
		{
			type: "pointer:click",
			handId: 1,
			timestamp: 1000,
			position: { x: 0, y: 0 },
		},
		{
			type: "pointer:move",
			handId: 0,
			timestamp: 1000,
			position: { x: 0, y: 0 },
		},
		{
			type: "pointer:move",
			handId: 1.5,
			timestamp: 1000,
			position: { x: 0, y: 0 },
		},
		{
			type: "pointer:move",
			handId: 1,
			timestamp: -1,
			position: { x: 0, y: 0 },
		},
		{
			type: "pointer:move",
			handId: 1,
			timestamp: Number.POSITIVE_INFINITY,
			position: { x: 0, y: 0 },
		},
		{
			type: "pointer:move",
			handId: 1,
			timestamp: 1000,
			position: { x: -0.01, y: 0 },
		},
		{
			type: "pointer:move",
			handId: 1,
			timestamp: 1000,
			position: { x: 0, y: 1.01 },
		},
		{
			type: "pointer:move",
			handId: 1,
			timestamp: 1000,
			position: { x: Number.NaN, y: 0 },
		},
		{
			type: "pointer:move",
			handId: 1,
			timestamp: 1000,
			position: { x: "0", y: 0 },
		},
	])(
		"ignores invalid command %# without moving the pointer",
		async (command) => {
			const { controller, driver } = setup();
			const { sessionId } = await controller.enable();
			controller.submit({ sessionId, capturedAt: Date.now(), command });
			await settle();
			expect(driver.move).not.toHaveBeenCalled();
			expect(controller.getState().phase).toBe("waiting");
		},
	);

	it("ignores malformed envelopes and foreign sessions", async () => {
		const { controller, driver } = setup();
		const { sessionId } = await controller.enable();
		for (const value of [
			null,
			[],
			1,
			{},
			update(-1),
			update(String(sessionId) as unknown as number),
		]) {
			controller.submit(value);
		}
		expect(driver.move).not.toHaveBeenCalled();
	});

	it("requires both capture time and command timestamp to increase", async () => {
		const { controller, driver } = setup();
		const { sessionId } = await controller.enable();
		const capturedAt = Date.now();
		controller.submit(update(sessionId, 1000, undefined, capturedAt));
		await settle();
		controller.submit(update(sessionId, 1001, undefined, capturedAt));
		controller.submit(update(sessionId, 1002, undefined, capturedAt - 1));
		vi.setSystemTime(capturedAt + 10);
		controller.submit(update(sessionId, 1000));
		vi.setSystemTime(capturedAt + 20);
		controller.submit(update(sessionId, 999));
		expect(driver.move).toHaveBeenCalledOnce();
		vi.setSystemTime(capturedAt + 30);
		controller.submit(update(sessionId, 1003, { x: 1, y: 1 }));
		await vi.advanceTimersByTimeAsync(40);
		expect(driver.move.mock.lastCall?.[0]).toEqual({ x: 1919, y: 1079 });
		expect(driver.move.mock.calls.length).toBeGreaterThan(1);
	});
});

describe("System pointer failures", () => {
	it("refuses activation when the emergency shortcut cannot be registered", async () => {
		const { controller, driver, registerStop, unregisterStop } = setup();
		registerStop.mockReturnValue(false);
		await controller.enable();
		expect(controller.getState()).toMatchObject({
			phase: "error",
			sessionId: null,
			error: expect.stringContaining("shortcut"),
		});
		expect(driver.start).not.toHaveBeenCalled();
		expect(driver.stop).toHaveBeenCalledOnce();
		expect(unregisterStop).toHaveBeenCalledOnce();
	});

	it("releases the shortcut and backend after startup failure", async () => {
		const { controller, driver, unregisterStop } = setup();
		driver.start.mockRejectedValueOnce(new Error("Helper failed"));
		await controller.enable();
		expect(controller.getState()).toMatchObject({
			phase: "error",
			sessionId: null,
			error: "Helper failed",
		});
		expect(driver.stop).toHaveBeenCalledOnce();
		expect(unregisterStop).toHaveBeenCalledOnce();
	});

	it("fails closed on a movement error and drops the pending move", async () => {
		const { controller, driver, unregisterStop } = setup();
		const ack = deferred<boolean>();
		driver.move.mockReturnValueOnce(ack.promise);
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId));
		vi.setSystemTime(Date.now() + 1);
		controller.submit(update(sessionId, 1001));
		ack.reject(new Error("SetPhysicalCursorPos failed"));
		await settle();
		expect(controller.getState()).toMatchObject({
			phase: "error",
			sessionId: null,
			error: "SetPhysicalCursorPos failed",
		});
		expect(driver.move).toHaveBeenCalledOnce();
		expect(driver.stop).toHaveBeenCalledOnce();
		expect(unregisterStop).toHaveBeenCalledOnce();
	});

	it("does not let a failure from an old start disable its replacement", async () => {
		const { controller, driver } = setup();
		const oldStart = deferred<void>();
		driver.start.mockReturnValueOnce(oldStart.promise);
		const enabling = controller.enable();
		controller.disable();
		const replacement = await controller.enable();
		oldStart.reject(new Error("Old helper failed"));
		await enabling;
		expect(controller.getState()).toEqual(replacement);
		expect(driver.stop).toHaveBeenCalledOnce();
	});
});

describe("System pointer presentation", () => {
	it("applies the first unknown position immediately and leaves no presentation timer idle", async () => {
		const { controller, driver } = setup();
		const { sessionId } = await controller.enable();
		expect(vi.getTimerCount()).toBe(0);
		controller.submit(update(sessionId, 1000, { x: 1, y: 1 }));
		expect(driver.move).toHaveBeenCalledExactlyOnceWith(
			{ x: 1919, y: 1079 },
			Date.now() + 250,
		);
		await settle();
		// Seul le watchdog de fraîcheur subsiste, aucun timer de présentation.
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(driver.move).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("interpolates finite integer pixels monotonically without overshooting either axis", async () => {
		const { controller, driver, getBounds } = setup();
		getBounds.mockReturnValue({ x: 0, y: 0, width: 1001, height: 1001 });
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId, 1000, { x: 0.1, y: 0.8 }));
		await settle();
		await vi.advanceTimersByTimeAsync(100);
		controller.submit(update(sessionId, 1100, { x: 0.9, y: 0.2 }));
		expect(driver.move).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(50);
		const halfway = driver.move.mock.lastCall?.[0];
		expect(halfway?.x).toBeGreaterThan(100);
		expect(halfway?.x).toBeLessThan(900);
		await vi.advanceTimersByTimeAsync(60);
		const points = driver.move.mock.calls.map(([point]) => point);
		expect(points.at(-1)).toEqual({ x: 900, y: 200 });
		for (let index = 0; index < points.length; index += 1) {
			const point = points[index];
			expect(Number.isSafeInteger(point.x)).toBe(true);
			expect(Number.isSafeInteger(point.y)).toBe(true);
			expect(point.x).toBeGreaterThanOrEqual(100);
			expect(point.x).toBeLessThanOrEqual(900);
			expect(point.y).toBeGreaterThanOrEqual(200);
			expect(point.y).toBeLessThanOrEqual(800);
			if (index > 0) {
				expect(point.x).toBeGreaterThanOrEqual(points[index - 1].x);
				expect(point.y).toBeLessThanOrEqual(points[index - 1].y);
			}
		}
		await vi.advanceTimersByTimeAsync(100);
		expect(driver.move).toHaveBeenCalledTimes(points.length);
		expect(vi.getTimerCount()).toBe(1);
	});

	it.each([
		{ interval: 1, completion: 25 },
		{ interval: 200, completion: 110 },
	])(
		"bounds presentation duration for a $interval ms capture interval",
		async ({ interval, completion }) => {
			const { controller, driver, getBounds } = setup();
			getBounds.mockReturnValue({ x: 0, y: 0, width: 1001, height: 1001 });
			const { sessionId } = await controller.enable();
			controller.submit(update(sessionId, 1000, { x: 0, y: 0 }));
			await settle();
			await vi.advanceTimersByTimeAsync(interval);
			controller.submit(update(sessionId, 1000 + interval, { x: 1, y: 1 }));
			await vi.advanceTimersByTimeAsync(8);
			expect(driver.move.mock.lastCall?.[0].x).toBeGreaterThan(0);
			expect(driver.move.mock.lastCall?.[0].x).toBeLessThan(1000);
			await vi.advanceTimersByTimeAsync(completion - 8);
			expect(driver.move.mock.lastCall?.[0]).toEqual({ x: 1000, y: 1000 });
			expect(vi.getTimerCount()).toBe(1);
		},
	);

	it("builds a replacement trajectory only after the current physical move is acknowledged", async () => {
		const { controller, driver, getBounds } = setup();
		getBounds.mockReturnValue({ x: 0, y: 0, width: 1001, height: 1001 });
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId, 1000, { x: 0, y: 0 }));
		await settle();
		const ack = deferred<boolean>();
		driver.move.mockReturnValueOnce(ack.promise);
		await vi.advanceTimersByTimeAsync(100);
		controller.submit(update(sessionId, 1100, { x: 1, y: 0 }));
		await vi.advanceTimersByTimeAsync(8);
		const sent = driver.move.mock.lastCall?.[0].x ?? 0;
		expect(sent).toBe(80);
		await vi.advanceTimersByTimeAsync(1);
		controller.submit(update(sessionId, 1109, { x: 0.12, y: 0 }));
		await vi.advanceTimersByTimeAsync(1);
		expect(driver.move).toHaveBeenCalledTimes(2);
		ack.resolve(true);
		await settle();
		expect(driver.move).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(8);
		const next = driver.move.mock.lastCall?.[0].x ?? 0;
		expect(next).toBeGreaterThan(sent);
		expect(next).toBeLessThan(120);
		await vi.advanceTimersByTimeAsync(20);
		expect(driver.move.mock.lastCall?.[0]).toEqual({ x: 120, y: 0 });
	});

	it("keeps the scheduled presentation slot when a replacement arrives just before it", async () => {
		const { controller, driver, getBounds } = setup();
		getBounds.mockReturnValue({ x: 0, y: 0, width: 1001, height: 1001 });
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId, 1000, { x: 0, y: 0 }));
		await settle();
		await vi.advanceTimersByTimeAsync(100);
		controller.submit(update(sessionId, 1100, { x: 0.5, y: 0 }));
		await vi.advanceTimersByTimeAsync(103);
		const before = driver.move.mock.calls.length;
		const acknowledged = driver.move.mock.lastCall?.[0].x ?? 0;
		expect(acknowledged).toBe(480);
		// La capture suivante arrive 1 ms avant le créneau déjà prévu à t=204.
		controller.submit(update(sessionId, 1200, { x: 1, y: 0 }, Date.now() - 3));
		expect(driver.move).toHaveBeenCalledTimes(before);
		await vi.advanceTimersByTimeAsync(1);
		expect(driver.move).toHaveBeenCalledTimes(before + 1);
		const next = driver.move.mock.lastCall?.[0].x ?? 0;
		expect(next).toBeGreaterThan(acknowledged);
		expect(next).toBeLessThan(1000);
		await vi.advanceTimersByTimeAsync(110);
		expect(driver.move.mock.lastCall?.[0]).toEqual({ x: 1000, y: 0 });
	});

	it("does not reuse time spent idle when starting another trajectory", async () => {
		const { controller, driver, getBounds } = setup();
		getBounds.mockReturnValue({ x: 0, y: 0, width: 1001, height: 1001 });
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId, 1000, { x: 0, y: 0 }));
		await settle();
		await vi.advanceTimersByTimeAsync(200);
		controller.submit(update(sessionId, 1200, { x: 0, y: 0 }));
		await vi.advanceTimersByTimeAsync(100);
		controller.submit(update(sessionId, 1300, { x: 1, y: 0 }));
		expect(driver.move).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(8);
		expect(driver.move.mock.lastCall?.[0].x).toBe(80);
		await vi.advanceTimersByTimeAsync(110);
		expect(driver.move.mock.lastCall?.[0]).toEqual({ x: 1000, y: 0 });
	});

	it("does not queue missed presentation ticks while a native ACK is delayed", async () => {
		const { controller, driver, getBounds } = setup();
		getBounds.mockReturnValue({ x: 0, y: 0, width: 1001, height: 1001 });
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId, 1000, { x: 0, y: 0 }));
		await settle();
		const ack = deferred<boolean>();
		driver.move.mockReturnValueOnce(ack.promise);
		await vi.advanceTimersByTimeAsync(100);
		controller.submit(update(sessionId, 1100, { x: 1, y: 0 }));
		await vi.advanceTimersByTimeAsync(8);
		await vi.advanceTimersByTimeAsync(60);
		expect(driver.move).toHaveBeenCalledTimes(2);
		ack.resolve(true);
		await settle();
		await vi.advanceTimersByTimeAsync(0);
		expect(driver.move).toHaveBeenCalledTimes(3);
		expect(driver.move.mock.lastCall?.[0].x).toBeGreaterThanOrEqual(680);
	});

	it("omits identical rounded pixels and stops its timer once the destination is reached", async () => {
		const { controller, driver, getBounds } = setup();
		getBounds.mockReturnValue({ x: 0, y: 0, width: 3, height: 3 });
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId, 1000, { x: 0, y: 0 }));
		await settle();
		await vi.advanceTimersByTimeAsync(100);
		controller.submit(update(sessionId, 1100, { x: 1, y: 1 }));
		await vi.advanceTimersByTimeAsync(110);
		expect(driver.move.mock.calls.map(([point]) => point)).toEqual([
			{ x: 0, y: 0 },
			{ x: 1, y: 1 },
			{ x: 2, y: 2 },
		]);
		expect(vi.getTimerCount()).toBe(1);
		controller.submit(update(sessionId, 1210, { x: 1, y: 1 }));
		await vi.advanceTimersByTimeAsync(100);
		expect(driver.move).toHaveBeenCalledTimes(3);
		expect(vi.getTimerCount()).toBe(1);
	});

	it.each(["null", "malformed", "expired", "disabled"] as const)(
		"cancels trajectory, latest target and timers on %s without reviving them after a late ACK",
		async (reason) => {
			const { controller, driver } = setup();
			const { sessionId } = await controller.enable();
			controller.submit(update(sessionId, 1000, { x: 0, y: 0 }));
			await settle();
			const ack = deferred<boolean>();
			driver.move.mockReturnValueOnce(ack.promise);
			await vi.advanceTimersByTimeAsync(100);
			controller.submit(update(sessionId, 1100, { x: 1, y: 1 }));
			await vi.advanceTimersByTimeAsync(9);
			controller.submit(update(sessionId, 1109, { x: 0.75, y: 0.75 }));
			await vi.advanceTimersByTimeAsync(1);
			if (reason === "null") {
				controller.submit({ sessionId, capturedAt: Date.now(), command: null });
			} else if (reason === "malformed") {
				controller.submit(update(sessionId, 1110, { x: Number.NaN, y: 0 }));
			} else if (reason === "disabled") {
				controller.disable();
			} else {
				await vi.advanceTimersByTimeAsync(250);
			}
			ack.resolve(true);
			await settle();
			await vi.advanceTimersByTimeAsync(1000);
			expect(driver.move).toHaveBeenCalledTimes(2);
			expect(controller.getState().phase).toBe(
				reason === "disabled" ? "disabled" : "waiting",
			);
			expect(vi.getTimerCount()).toBe(0);
			if (reason !== "disabled") {
				controller.submit(update(sessionId, 3000, { x: 0.3, y: 0.3 }));
				await settle();
				expect(driver.move).toHaveBeenCalledTimes(3);
				expect(driver.move.mock.lastCall?.[0]).toEqual({ x: 576, y: 324 });
			}
		},
	);

	it("cancels a scheduled interpolation before it can emit its first step", async () => {
		const { controller, driver } = setup();
		const { sessionId } = await controller.enable();
		controller.submit(update(sessionId, 1000, { x: 0, y: 0 }));
		await settle();
		await vi.advanceTimersByTimeAsync(100);
		controller.submit(update(sessionId, 1100, { x: 1, y: 1 }));
		expect(vi.getTimerCount()).toBe(2);
		await vi.advanceTimersByTimeAsync(1);
		controller.submit({ sessionId, capturedAt: Date.now(), command: null });
		await vi.advanceTimersByTimeAsync(1000);
		expect(driver.move).toHaveBeenCalledOnce();
		expect(vi.getTimerCount()).toBe(0);
	});

	it("never emits an interpolated pixel at or after the source deadline", async () => {
		const { controller, driver } = setup();
		const outputs: { sentAt: number; expiresAt: number }[] = [];
		driver.move.mockImplementation(async (_point, expiresAt) => {
			outputs.push({ sentAt: Date.now(), expiresAt });
			return true;
		});
		const { sessionId } = await controller.enable();
		controller.submit(
			update(sessionId, 1000, { x: 0, y: 0 }, Date.now() - 240),
		);
		await settle();
		await vi.advanceTimersByTimeAsync(1);
		controller.submit(
			update(sessionId, 1001, { x: 1, y: 1 }, Date.now() - 240),
		);
		await vi.advanceTimersByTimeAsync(50);
		expect(outputs.length).toBeGreaterThan(1);
		for (const output of outputs) {
			expect(output.sentAt).toBeLessThan(output.expiresAt);
		}
		expect(driver.move.mock.lastCall?.[0].x).toBeLessThan(1919);
		expect(controller.getState().phase).toBe("waiting");
		expect(vi.getTimerCount()).toBe(0);
	});
});
