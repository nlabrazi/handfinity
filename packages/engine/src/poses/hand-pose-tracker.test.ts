import { describe, expect, it } from "vitest";
import type { HandObservation, HandPoint } from "../hand-observation";
import {
	createHandIdentityTracker,
	type HandTrackingFrame,
	type TrackedHand,
} from "../tracking/hand-identity-tracker";
import { createHandPoseTracker, type HandPoseKind } from "./hand-pose-tracker";

function hand(kind: HandPoseKind, timestamp: number): HandObservation {
	const landmarks = [
		[0.5, 0.85],
		[0.4, 0.76],
		[0.3, 0.69],
		[0.24, 0.62],
		[0.18, 0.55],
		[0.42, 0.6],
		[0.42, 0.46],
		[0.42, 0.36],
		[0.42, 0.28],
		[0.5, 0.6],
		[0.5, 0.43],
		[0.5, 0.32],
		[0.5, 0.23],
		[0.58, 0.61],
		[0.58, 0.46],
		[0.58, 0.36],
		[0.58, 0.28],
		[0.65, 0.65],
		[0.65, 0.53],
		[0.65, 0.44],
		[0.65, 0.36],
	].map(([x = 0, y = 0]) => ({ x, y, z: 0 }));
	if (kind === "pointing" || kind === "unknown") {
		for (const base of kind === "pointing" ? [9, 13, 17] : [5, 9, 13, 17]) {
			const root = landmarks[base];
			if (!root) throw new Error("Missing fixture landmark");
			landmarks[base + 1] = { x: root.x, y: root.y - 0.14, z: 0 };
			landmarks[base + 2] = { x: root.x + 0.01, y: root.y, z: 0 };
			landmarks[base + 3] = { x: root.x + 0.01, y: root.y + 0.08, z: 0 };
		}
	}
	if (kind === "pinch") landmarks[4] = { x: 0.43, y: 0.28, z: 0 };
	return {
		landmarks,
		timestamp,
		handedness: "unknown",
		handednessConfidence: null,
	};
}

function track(
	observation: HandObservation,
	id = 1,
	status: TrackedHand["status"] = "tracked",
): TrackedHand {
	return { id, status, observation };
}

function frame(
	timestamp: number,
	hands: readonly TrackedHand[],
	ambiguous = false,
): HandTrackingFrame {
	return { timestamp, hands, events: [], ambiguous };
}

function withRatio(ratio: number, timestamp: number): HandObservation {
	const observation = hand("pinch", timestamp);
	return {
		...observation,
		landmarks: observation.landmarks.map((point, index) =>
			index === 4 ? { x: 0.42 + ratio * 0.25, y: 0.28, z: 0 } : point,
		),
	};
}

describe("Hand pose recognition", () => {
	it.each(["pointing", "open-palm"] as const)(
		"confirms %s only after 80 ms of matching observations",
		(kind) => {
			const tracker = createHandPoseTracker();
			expect(tracker.update(frame(0, [track(hand(kind, 0))]))[0]).toMatchObject(
				{ pose: "unknown", candidate: kind, pending: true },
			);
			expect(tracker.update(frame(79, [track(hand(kind, 79))]))[0]?.pose).toBe(
				"unknown",
			);
			expect(
				tracker.update(frame(80, [track(hand(kind, 80))]))[0],
			).toMatchObject({ pose: kind, pending: false, since: 80 });
		},
	);

	it("reports extended and folded fingers with a normalized pinch measurement", () => {
		const state = createHandPoseTracker().update(
			frame(0, [track(hand("pointing", 0))]),
		)[0];
		expect(state?.measurements?.fingers).toEqual({
			thumb: "extended",
			index: "extended",
			middle: "folded",
			ring: "folded",
			pinky: "folded",
		});
		expect(state?.measurements?.pinchRatio).toBeGreaterThan(0.46);
	});

	it("keeps a fist and a two-finger sign unrecognized", () => {
		const pointing = hand("pointing", 0);
		const open = hand("open-palm", 0);
		const twoFingers = {
			...pointing,
			landmarks: pointing.landmarks.map((point, index) =>
				index >= 9 && index <= 12 ? (open.landmarks[index] ?? point) : point,
			),
		};
		for (const observation of [hand("unknown", 0), twoFingers]) {
			const tracker = createHandPoseTracker();
			tracker.update(frame(0, [track(observation)]));
			expect(
				tracker.update(frame(80, [track({ ...observation, timestamp: 80 })]))[0]
					?.pose,
			).toBe("unknown");
		}
	});

	it("leaves a partly bent index uncertain instead of treating it as pointing", () => {
		const observation = hand("pointing", 0);
		const landmarks = [...observation.landmarks];
		landmarks[7] = { x: 0.4843, y: 0.3834, z: 0 };
		landmarks[8] = { x: 0.5357, y: 0.3221, z: 0 };
		const state = createHandPoseTracker().update(
			frame(0, [track({ ...observation, landmarks })]),
		)[0];
		expect(state).toMatchObject({
			candidate: "unknown",
			measurements: { fingers: { index: "uncertain" } },
		});
	});

	it("does not call a palm open when the straight thumb rests against it", () => {
		const observation = hand("open-palm", 0);
		const landmarks = [...observation.landmarks];
		for (let index = 1; index <= 4; index++)
			landmarks[index] = { x: 0.42, y: 0.91 - index * 0.06, z: 0 };
		const tracker = createHandPoseTracker();
		tracker.update(frame(0, [track({ ...observation, landmarks })]));
		expect(
			tracker.update(
				frame(80, [track({ ...observation, landmarks, timestamp: 80 })]),
			)[0],
		).toMatchObject({
			pose: "unknown",
			measurements: { fingers: { thumb: "uncertain" } },
		});
	});

	it("requires the thumb to be extended for an open palm", () => {
		const observation = hand("open-palm", 0);
		const points = [...observation.landmarks];
		points[3] = { x: 0.4, y: 0.72, z: 0 };
		points[4] = { x: 0.46, y: 0.7, z: 0 };
		const tracker = createHandPoseTracker();
		tracker.update(frame(0, [track({ ...observation, landmarks: points })]));
		expect(
			tracker.update(
				frame(80, [
					track({ ...observation, landmarks: points, timestamp: 80 }),
				]),
			)[0]?.pose,
		).toBe("unknown");
	});

	it("confirms a pinch at 40 ms, retains it between thresholds, and releases after 60 ms", () => {
		const tracker = createHandPoseTracker();
		expect(tracker.update(frame(0, [track(withRatio(0.2, 0))]))[0]?.pose).toBe(
			"unknown",
		);
		expect(
			tracker.update(frame(39, [track(withRatio(0.2, 39))]))[0]?.pose,
		).toBe("unknown");
		expect(
			tracker.update(frame(40, [track(withRatio(0.2, 40))]))[0],
		).toMatchObject({ pose: "pinch", since: 40 });
		expect(
			tracker.update(frame(60, [track(withRatio(0.4, 60))]))[0],
		).toMatchObject({ pose: "pinch", candidate: "pinch", pending: false });
		expect(
			tracker.update(frame(80, [track(withRatio(0.6, 80))]))[0]?.pose,
		).toBe("pinch");
		expect(
			tracker.update(frame(139, [track(withRatio(0.6, 139))]))[0]?.pose,
		).toBe("pinch");
		expect(
			tracker.update(frame(140, [track(withRatio(0.6, 140))]))[0]?.pose,
		).not.toBe("pinch");
	});

	it("gives a confirmed pinch priority over the finger configuration", () => {
		const tracker = createHandPoseTracker();
		tracker.update(frame(0, [track(hand("open-palm", 0))]));
		expect(
			tracker.update(frame(80, [track(hand("open-palm", 80))]))[0]?.pose,
		).toBe("open-palm");
		tracker.update(frame(100, [track(hand("pinch", 100))]));
		expect(
			tracker.update(frame(140, [track(hand("pinch", 140))]))[0]?.pose,
		).toBe("pinch");
	});

	it("discards an interrupted candidate and keeps a confirmed pose during brief noise", () => {
		const tracker = createHandPoseTracker();
		tracker.update(frame(0, [track(hand("pointing", 0))]));
		tracker.update(frame(40, [track(hand("open-palm", 40))]));
		expect(
			tracker.update(frame(119, [track(hand("open-palm", 119))]))[0]?.pose,
		).toBe("unknown");
		expect(
			tracker.update(frame(120, [track(hand("open-palm", 120))]))[0]?.pose,
		).toBe("open-palm");
		tracker.update(frame(140, [track(hand("pointing", 140))]));
		expect(
			tracker.update(frame(160, [track(hand("open-palm", 160))]))[0],
		).toMatchObject({ pose: "open-palm", since: 120, pending: false });
	});

	it("returns to unknown when an unsupported configuration persists", () => {
		const tracker = createHandPoseTracker();
		tracker.update(frame(0, [track(hand("pointing", 0))]));
		tracker.update(frame(80, [track(hand("pointing", 80))]));
		tracker.update(frame(100, [track(hand("unknown", 100))]));
		expect(
			tracker.update(frame(180, [track(hand("unknown", 180))]))[0],
		).toMatchObject({ pose: "unknown", since: null });
	});

	it.each([0.5, 1, 1.5])(
		"recognizes poses at relative hand size %s",
		(scale) => {
			for (const kind of ["pointing", "open-palm", "pinch"] as const) {
				const tracker = createHandPoseTracker();
				for (const timestamp of [0, 80]) {
					const observation = hand(kind, timestamp);
					const landmarks = observation.landmarks.map((point) => ({
						x: 0.5 + (point.x - 0.5) * scale,
						y: 0.5 + (point.y - 0.5) * scale,
						z: point.z * scale,
					}));
					const result = tracker.update(
						frame(timestamp, [track({ ...observation, landmarks })]),
					);
					if (timestamp === 80) expect(result[0]?.pose).toBe(kind);
				}
			}
		},
	);

	it.each([0, Math.PI / 2, Math.PI, -Math.PI / 3])(
		"recognizes rotated or mirrored pointing and open palm (angle %s)",
		(rotation) => {
			for (const kind of ["pointing", "open-palm"] as const) {
				for (const mirror of [1, -1]) {
					const tracker = createHandPoseTracker();
					for (const timestamp of [0, 80]) {
						const observation = hand(kind, timestamp);
						const landmarks = observation.landmarks.map((point) => {
							const x = (point.x - 0.5) * mirror;
							const y = point.y - 0.5;
							return {
								x: 0.5 + x * Math.cos(rotation) - y * Math.sin(rotation),
								y: 0.5 + x * Math.sin(rotation) + y * Math.cos(rotation),
								z: 0,
							};
						});
						const result = tracker.update(
							frame(timestamp, [track({ ...observation, landmarks })]),
						);
						if (timestamp === 80) expect(result[0]?.pose).toBe(kind);
					}
				}
			}
		},
	);

	it("uses relative depth when a straight finger points out of the image plane", () => {
		const tracker = createHandPoseTracker();
		for (const timestamp of [0, 80]) {
			const observation = hand("pointing", timestamp);
			const landmarks = observation.landmarks.map((point, index) =>
				index >= 6 && index <= 8
					? {
							x: point.x,
							y: 0.6 + (point.y - 0.6) * 0.5,
							z: (point.y - 0.6) * Math.sin(Math.PI / 3),
						}
					: point,
			);
			const result = tracker.update(
				frame(timestamp, [track({ ...observation, landmarks })]),
			);
			if (timestamp === 80) expect(result[0]?.pose).toBe("pointing");
		}
	});

	it.each([0.75, 1, 16 / 9, 2])(
		"preserves poses through a rigid depth tilt and scale at image aspect %s",
		(aspectRatio) => {
			const tilt = (85 * Math.PI) / 180;
			for (const kind of ["pointing", "open-palm", "pinch"] as const) {
				const original = hand(kind, 0);
				const baseline = createHandPoseTracker().update(
					frame(0, [track(original)]),
				)[0]?.measurements?.pinchRatio;
				const thumb = original.landmarks[4];
				const index = original.landmarks[8];
				if (!thumb || !index) throw new Error("Missing fixture fingertip");
				const gap = Math.hypot(index.x - thumb.x, index.y - thumb.y);
				const axisX = -(index.y - thumb.y) / gap;
				const axisY = (index.x - thumb.x) / gap;
				for (const scale of [0.5, 1, 1.5]) {
					const tracker = createHandPoseTracker();
					for (const timestamp of [0, 80]) {
						const observation = hand(kind, timestamp);
						const landmarks = observation.landmarks.map((point) => {
							const x = point.x - 0.5;
							const y = point.y - 0.5;
							const dot = axisX * x + axisY * y;
							return {
								x:
									0.5 +
									(scale *
										(x * Math.cos(tilt) + axisX * dot * (1 - Math.cos(tilt)))) /
										aspectRatio,
								y:
									0.5 +
									scale *
										(y * Math.cos(tilt) + axisY * dot * (1 - Math.cos(tilt))),
								z:
									(scale * (axisX * y - axisY * x) * Math.sin(tilt)) /
									aspectRatio,
							};
						});
						const result = tracker.update(
							frame(timestamp, [track({ ...observation, landmarks })]),
							aspectRatio,
						)[0];
						expect(result?.measurements?.pinchRatio).toBeCloseTo(
							baseline ?? -1,
						);
						if (timestamp === 80) expect(result?.pose).toBe(kind);
					}
				}
			}
		},
	);

	it.each([0.75, 16 / 9, 2])(
		"corrects distances and angles for image aspect ratio %s",
		(aspectRatio) => {
			for (const kind of ["pointing", "open-palm", "pinch"] as const) {
				const tracker = createHandPoseTracker();
				for (const timestamp of [0, 80]) {
					const observation = hand(kind, timestamp);
					const landmarks = observation.landmarks.map((point) => ({
						...point,
						x: point.x / aspectRatio,
						z: point.z / aspectRatio,
					}));
					const result = tracker.update(
						frame(timestamp, [track({ ...observation, landmarks })]),
						aspectRatio,
					);
					if (timestamp === 80) expect(result[0]?.pose).toBe(kind);
				}
			}
		},
	);
});

describe("Pose lifecycle per hand identity", () => {
	it("keeps both hands independent when their order changes", () => {
		const tracker = createHandPoseTracker();
		tracker.update(
			frame(0, [track(hand("pointing", 0), 1), track(hand("open-palm", 0), 2)]),
		);
		const result = tracker.update(
			frame(80, [
				track(hand("open-palm", 80), 2),
				track(hand("pointing", 80), 1),
			]),
		);
		expect(result).toMatchObject([
			{ handId: 2, pose: "open-palm" },
			{ handId: 1, pose: "pointing" },
		]);
	});

	it("suspends one missing hand without resetting the pose of the other", () => {
		const tracker = createHandPoseTracker();
		tracker.update(
			frame(0, [track(hand("pinch", 0), 1), track(hand("open-palm", 0), 2)]),
		);
		tracker.update(
			frame(80, [track(hand("pinch", 80), 1), track(hand("open-palm", 80), 2)]),
		);
		const result = tracker.update(
			frame(100, [
				track(hand("pinch", 80), 1, "missing"),
				track(hand("open-palm", 100), 2),
			]),
		);
		expect(result).toMatchObject([
			{ handId: 1, pose: "unknown", measurements: null },
			{ handId: 2, pose: "open-palm", since: 80 },
		]);
	});

	it("does not confirm poses by replaying the same video observation", () => {
		const tracker = createHandPoseTracker();
		const observation = hand("pointing", 0);
		tracker.update(frame(0, [track(observation)]));
		for (const timestamp of [16, 40, 80, 100]) {
			expect(
				tracker.update(frame(timestamp, [track(observation)]))[0]?.pose,
			).toBe("unknown");
		}
	});

	it("requires fresh confirmation after a missing observation, including for a pinch", () => {
		for (const kind of ["pointing", "pinch"] as const) {
			const tracker = createHandPoseTracker();
			tracker.update(frame(0, [track(hand(kind, 0))]));
			tracker.update(frame(40, [track(hand(kind, 0), 1, "missing")]));
			expect(
				tracker.update(frame(80, [track(hand(kind, 80))]))[0],
			).toMatchObject({ pose: "unknown", candidate: kind });
			expect(
				tracker.update(frame(160, [track(hand(kind, 160))]))[0]?.pose,
			).toBe(kind);
		}
	});

	it("immediately suspends a confirmed pose when a hand is missing", () => {
		const tracker = createHandPoseTracker();
		tracker.update(frame(0, [track(hand("pointing", 0))]));
		const confirmed = tracker.update(frame(80, [track(hand("pointing", 80))]));
		expect(
			tracker.update(
				frame(100, [track(hand("pointing", 80), 1, "missing")]),
			)[0],
		).toMatchObject({ pose: "unknown", measurements: null, pending: false });
		expect(confirmed[0]?.pose).toBe("pointing");
	});

	it("discards old pose state when the identity disappears or becomes ambiguous", () => {
		for (const ambiguous of [false, true]) {
			const tracker = createHandPoseTracker();
			tracker.update(frame(0, [track(hand("pointing", 0))]));
			tracker.update(frame(80, [track(hand("pointing", 80))]));
			expect(tracker.update(frame(100, [], ambiguous))).toEqual([]);
			expect(
				tracker.update(frame(120, [track(hand("pointing", 120), 2)]))[0]?.pose,
			).toBe("unknown");
		}
	});

	it("expires a confirmed pose through the identity tracker when video freezes", () => {
		const identities = createHandIdentityTracker();
		const poses = createHandPoseTracker();
		poses.update(identities.update([hand("pointing", 0)], 0));
		expect(
			poses.update(identities.update([hand("pointing", 80)], 80))[0]?.pose,
		).toBe("pointing");
		expect(poses.update(identities.advance(201))).toEqual([]);
		expect(
			poses.update(identities.update([hand("pointing", 240)], 240))[0],
		).toMatchObject({ handId: 2, pose: "unknown" });
	});

	it.each(["missing", "non-finite", "flat"])(
		"clears a pose for %s landmarks",
		(invalid) => {
			const tracker = createHandPoseTracker();
			tracker.update(frame(0, [track(hand("pointing", 0))]));
			tracker.update(frame(80, [track(hand("pointing", 80))]));
			const observation = hand("pointing", 100);
			const landmarks: readonly HandPoint[] =
				invalid === "missing"
					? []
					: observation.landmarks.map((point) =>
							invalid === "flat"
								? { x: 0.5, y: 0.5, z: 0 }
								: { ...point, z: Number.NaN },
						);
			expect(
				tracker.update(frame(100, [track({ ...observation, landmarks })]))[0],
			).toMatchObject({
				pose: "unknown",
				candidate: "unknown",
				measurements: null,
			});
		},
	);

	it("resets all pose state when a session stops", () => {
		const tracker = createHandPoseTracker();
		tracker.update(frame(100, [track(hand("pinch", 100))]));
		tracker.update(frame(140, [track(hand("pinch", 140))]));
		tracker.reset();
		expect(tracker.update(frame(0, [track(hand("pinch", 0))]))[0]?.pose).toBe(
			"unknown",
		);
	});

	it.each([15, 30, 60])("uses elapsed confirmation time at %s fps", (fps) => {
		const tracker = createHandPoseTracker();
		const interval = 1000 / fps;
		let firstConfirmation: number | null = null;
		for (let index = 0; index <= fps; index++) {
			const timestamp = index * interval;
			if (
				tracker.update(
					frame(timestamp, [track(hand("pointing", timestamp))]),
				)[0]?.pose === "pointing"
			)
				firstConfirmation ??= timestamp;
		}
		expect(firstConfirmation).toBeGreaterThanOrEqual(80);
		expect(firstConfirmation).toBeLessThanOrEqual(80 + interval);
	});

	it("rejects invalid time and aspect ratios without erasing a confirmed pose", () => {
		const tracker = createHandPoseTracker();
		tracker.update(frame(0, [track(hand("pointing", 0))]));
		const current = frame(80, [track(hand("pointing", 80))]);
		tracker.update(current);
		expect(() => tracker.update(frame(70, []))).toThrow(RangeError);
		expect(() => tracker.update(frame(Number.NaN, []))).toThrow(RangeError);
		expect(() => tracker.update(current, 0)).toThrow(RangeError);
		expect(tracker.update(current)[0]?.pose).toBe("pointing");
	});
});
