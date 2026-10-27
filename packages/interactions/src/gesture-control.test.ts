import type {
	HandPoseKind,
	HandTrackingFrame,
	TrackedHandPose,
} from "@handfinity/core";
import { describe, expect, it } from "vitest";
import { CONTROL_HOLD_MS, createGestureControl } from "./gesture-control";

function tracking(
	timestamp: number,
	ids = [1],
	observedAt = timestamp,
): HandTrackingFrame {
	return {
		timestamp,
		ambiguous: false,
		events: [],
		hands: ids.map((id) => ({
			id,
			status: "tracked",
			observation: {
				timestamp: observedAt,
				handedness: "unknown",
				handednessConfidence: null,
				landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
			},
		})),
	};
}

function pose(id = 1, kind: HandPoseKind = "open-palm"): TrackedHandPose {
	return {
		handId: id,
		status: "tracked",
		pose: kind,
		candidate: kind,
		pending: false,
		since: 0,
		measurements: {
			pinchRatio: 1,
			fingers: {
				thumb: "extended",
				index: "extended",
				middle: "extended",
				ring: "extended",
				pinky: "extended",
			},
		},
	};
}

describe("Voluntary gesture control", () => {
	it("requires a full 1.5 second hold and preserves previous snapshots", () => {
		const control = createGestureControl();
		expect(CONTROL_HOLD_MS).toBe(1500);
		const first = control.update(tracking(0), [pose()], 1);
		const halfway = control.update(tracking(750), [pose()], 1);
		expect(halfway).toMatchObject({
			paused: false,
			handId: 1,
			holdProgress: 0.5,
		});
		expect(control.update(tracking(1499), [pose()], 1).paused).toBe(false);
		expect(control.update(tracking(1500), [pose()], 1)).toEqual({
			paused: true,
			handId: null,
			holdProgress: 0,
			requiresRelease: true,
		});
		expect(first.holdProgress).toBe(0);
		expect(halfway.paused).toBe(false);
	});

	it("toggles once until another confirmed posture releases the gesture", () => {
		const control = createGestureControl();
		control.update(tracking(0), [pose()], 1);
		control.update(tracking(1500), [pose()], 1);
		for (const time of [1600, 3000, 5000])
			expect(control.update(tracking(time), [pose()], 1).paused).toBe(true);
		control.update(tracking(5100), [pose(1, "pointing")], 1);
		control.update(tracking(5200), [pose()], 1);
		expect(control.update(tracking(6699), [pose()], 1).paused).toBe(true);
		expect(control.update(tracking(6700), [pose()], 1).paused).toBe(false);
	});

	it("does not rearm after brief pose noise or a disappearance", () => {
		const control = createGestureControl();
		control.update(tracking(0), [pose()], 1);
		control.update(tracking(1500), [pose()], 1);
		control.update(
			tracking(1600),
			[{ ...pose(), candidate: "unknown", pending: true }],
			1,
		);
		control.update(tracking(1700, []), [], null);
		control.update(tracking(1800, [2]), [pose(2)], 2);
		expect(control.update(tracking(4000, [2]), [pose(2)], 2)).toMatchObject({
			paused: true,
			requiresRelease: true,
		});
	});

	it("never advances a hold by replaying observations", () => {
		const control = createGestureControl();
		control.update(tracking(0), [pose()], 1);
		for (const time of [100, 1500, 5000]) {
			expect(control.update(tracking(time, [1], 0), [pose()], 1)).toMatchObject(
				{ paused: false, holdProgress: 0 },
			);
		}
	});

	it("does not treat an uncertain new identity as deliberate release", () => {
		const control = createGestureControl();
		control.update(tracking(0), [pose()], 1);
		control.update(tracking(1500), [pose()], 1);
		control.update(tracking(1700, []), [], null);
		const uncertain = pose(2, "unknown");
		control.update(tracking(1800, [2]), [uncertain], 2);
		expect(control.getState().requiresRelease).toBe(true);
		control.update(tracking(1900, [2]), [pose(2)], 2);
		expect(control.update(tracking(4000, [2]), [pose(2)], 2).paused).toBe(true);
	});

	it("accepts clearly folded fingers as release without adding a new gesture pose", () => {
		const control = createGestureControl();
		control.update(tracking(0), [pose()], 1);
		control.update(tracking(1500), [pose()], 1);
		const closed = pose(1, "unknown");
		if (!closed.measurements) throw new Error("Missing measurements");
		control.update(
			tracking(1600),
			[
				{
					...closed,
					measurements: {
						...closed.measurements,
						fingers: {
							thumb: "uncertain",
							index: "folded",
							middle: "folded",
							ring: "folded",
							pinky: "folded",
						},
					},
				},
			],
			1,
		);
		expect(control.getState().requiresRelease).toBe(false);
		control.update(tracking(1700), [pose()], 1);
		expect(control.update(tracking(3200), [pose()], 1).paused).toBe(false);
	});

	it.each(["missing", "ambiguous", "invalid", "candidate"])(
		"cancels a partial hold on %s input",
		(reason) => {
			const control = createGestureControl();
			control.update(tracking(0), [pose()], 1);
			control.update(tracking(700), [pose()], 1);
			const frame = tracking(800, reason === "missing" ? [] : [1]);
			const measured =
				reason === "invalid"
					? { ...pose(), measurements: null }
					: reason === "candidate"
						? { ...pose(), candidate: "unknown" as const, pending: true }
						: pose();
			control.update(
				{ ...frame, ambiguous: reason === "ambiguous" },
				[measured],
				1,
			);
			expect(control.getState().holdProgress).toBe(0);
			control.update(tracking(900), [pose()], 1);
			expect(control.update(tracking(1500), [pose()], 1).paused).toBe(false);
			expect(control.update(tracking(2400), [pose()], 1).paused).toBe(true);
		},
	);

	it("accepts only the primary hand while one owns control", () => {
		const control = createGestureControl();
		for (const time of [0, 1500, 3000]) {
			expect(
				control.update(
					tracking(time, [1, 2]),
					[pose(1, "pointing"), pose(2)],
					1,
				).paused,
			).toBe(false);
		}
	});

	it("does not let an unselected hand pause or resume, even when it is the only visible hand", () => {
		const control = createGestureControl();
		control.update(tracking(0, [2]), [pose(2)], null);
		expect(control.update(tracking(1500, [2]), [pose(2)], null).paused).toBe(
			false,
		);
		control.update(tracking(1600, [2]), [pose(2)], 2);
		expect(control.update(tracking(3100, [2]), [pose(2)], 2).paused).toBe(true);
	});

	it("never combines hold time from different hands", () => {
		const control = createGestureControl();
		control.update(tracking(0), [pose()], 1);
		control.update(tracking(800, [2]), [pose(2)], 2);
		expect(control.update(tracking(1500, [2]), [pose(2)], 2).paused).toBe(
			false,
		);
		expect(control.update(tracking(2300, [2]), [pose(2)], 2).paused).toBe(true);
	});

	it("keeps a pause through missing, ambiguous and pointing observations until reset", () => {
		const control = createGestureControl();
		control.update(tracking(0), [pose()], 1);
		control.update(tracking(1500), [pose()], 1);
		control.update(tracking(1600, []), [], null);
		control.update({ ...tracking(1700, []), ambiguous: true }, [], null);
		expect(
			control.update(tracking(1800, [2]), [pose(2, "pointing")], 2).paused,
		).toBe(true);
		control.reset();
		expect(control.getState()).toEqual({
			paused: false,
			handId: null,
			holdProgress: 0,
			requiresRelease: false,
		});
	});

	it.each([15, 30, 60])("uses elapsed observation time at %s fps", (fps) => {
		const control = createGestureControl();
		let toggledAt = 0;
		for (let index = 0; index <= fps * 2; index++) {
			const timestamp = (index * 1000) / fps;
			if (control.update(tracking(timestamp), [pose()], 1).paused) {
				toggledAt = timestamp;
				break;
			}
		}
		expect(toggledAt).toBeGreaterThanOrEqual(1500);
		expect(toggledAt).toBeLessThan(1500 + 1000 / fps + 0.001);
	});
});
