import { describe, expect, it } from "vitest";
import {
	hitTestTargets,
	projectHandPoint,
	type InteractionTarget,
} from "./targets";

const surface = { left: 100, top: 200, width: 400, height: 300 };
const targets: readonly InteractionTarget[] = [
	{ id: "left", rect: { left: 100, top: 200, width: 200, height: 300 } },
	{ id: "right", rect: { left: 300, top: 200, width: 200, height: 300 } },
];

describe("Hand pointer projection", () => {
	it("projects normalized source positions into client coordinates, with an explicit mirror", () => {
		expect(projectHandPoint({ x: 0.25, y: 0.5 }, surface)).toEqual({
			x: 200,
			y: 350,
		});
		expect(
			projectHandPoint({ x: 0.25, y: 0.5 }, surface, { mirrorX: true }),
		).toEqual({ x: 400, y: 350 });
		expect(projectHandPoint({ x: 0, y: 0 }, surface)).toEqual({
			x: 100,
			y: 200,
		});
		expect(projectHandPoint({ x: 1, y: 1 }, surface)).toEqual({
			x: 500,
			y: 500,
		});
	});

	it.each([
		{ x: -0.1, y: 0.5 },
		{ x: 1.1, y: 0.5 },
		{ x: 0.5, y: -0.1 },
		{ x: 0.5, y: 1.1 },
		{ x: Number.NaN, y: 0.5 },
	])(
		"ignores an out-of-image or invalid point %s instead of clamping to a target",
		(point) => {
			expect(projectHandPoint(point, surface)).toBeNull();
		},
	);

	it("ignores surfaces without usable dimensions", () => {
		for (const invalid of [
			{ ...surface, width: 0 },
			{ ...surface, height: -1 },
			{ ...surface, left: Infinity },
		]) {
			expect(projectHandPoint({ x: 0.5, y: 0.5 }, invalid)).toBeNull();
		}
	});

	it("keeps projection and targets in the same coordinate system after resize and scroll", () => {
		const source = { x: 0.25, y: 0.5 };
		expect(
			hitTestTargets(
				projectHandPoint(source, surface, { mirrorX: true }),
				targets,
			)?.id,
		).toBe("right");
		const resized = { left: 20, top: -100, width: 800, height: 600 };
		const resizedTargets = [
			{ id: "left", rect: { left: 20, top: -100, width: 400, height: 600 } },
			{ id: "right", rect: { left: 420, top: -100, width: 400, height: 600 } },
		];
		expect(
			hitTestTargets(
				projectHandPoint(source, resized, { mirrorX: true }),
				resizedTargets,
			)?.id,
		).toBe("right");
	});
});

describe("Interaction target detection", () => {
	it("assigns shared borders to exactly one target and excludes the bottom/right outer borders", () => {
		expect(hitTestTargets({ x: 100, y: 200 }, targets)?.id).toBe("left");
		expect(hitTestTargets({ x: 299.9, y: 350 }, targets)?.id).toBe("left");
		expect(hitTestTargets({ x: 300, y: 350 }, targets)?.id).toBe("right");
		expect(hitTestTargets({ x: 500, y: 350 }, targets)).toBeNull();
		expect(hitTestTargets({ x: 200, y: 500 }, targets)).toBeNull();
	});

	it("clears hover for an absent pointer, a gap, or an invalid position", () => {
		expect(hitTestTargets(null, targets)).toBeNull();
		expect(hitTestTargets({ x: 50, y: 350 }, targets)).toBeNull();
		expect(hitTestTargets({ x: Infinity, y: 350 }, targets)).toBeNull();
	});

	it("skips disabled targets even when they cover an enabled one", () => {
		const overlapping = [
			{
				...targets[0],
				id: "disabled",
				rect: surface,
				disabled: true,
				priority: 10,
			},
			...targets,
		];
		expect(hitTestTargets({ x: 200, y: 350 }, overlapping)?.id).toBe("left");
	});

	it("chooses the highest-priority overlapping target without mutating input order", () => {
		const overlapping = Object.freeze([
			{ id: "background", rect: surface },
			{ id: "foreground", rect: surface, priority: 1 },
		]);
		expect(hitTestTargets({ x: 200, y: 350 }, overlapping)?.id).toBe(
			"foreground",
		);
		expect(overlapping.map((target) => target.id)).toEqual([
			"background",
			"foreground",
		]);
	});

	it("breaks equal-priority overlap ties using the declared target order", () => {
		expect(
			hitTestTargets({ x: 200, y: 350 }, [
				{ id: "first", rect: surface },
				{ id: "second", rect: surface },
			])?.id,
		).toBe("first");
	});

	it("skips invalid target dimensions and priorities", () => {
		const invalid = [
			{ id: "empty", rect: { ...surface, width: 0 } },
			{ id: "invalid", rect: { ...surface, top: Number.NaN } },
			{ id: "priority", rect: surface, priority: Infinity },
			...targets,
		];
		expect(hitTestTargets({ x: 200, y: 350 }, invalid)?.id).toBe("left");
	});

	it("uses updated target rectangles when a layout changes", () => {
		const position = { x: 200, y: 350 };
		expect(hitTestTargets(position, targets)?.id).toBe("left");
		expect(
			hitTestTargets(position, [
				{ id: "moved", rect: { left: 300, top: 200, width: 200, height: 300 } },
			]),
		).toBeNull();
	});
});
