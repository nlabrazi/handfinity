import type { HandObservation } from "../hand-observation";

export type TrackedHand = {
	readonly id: number;
	/** Une observation manquante conserve la dernière position connue. */
	readonly status: "tracked" | "missing";
	readonly observation: HandObservation;
};

export type HandTrackingEvent =
	| {
			readonly type: "hand:found";
			readonly handId: number;
			readonly timestamp: number;
	  }
	| {
			readonly type: "hand:lost";
			readonly handId: number;
			readonly timestamp: number;
			readonly reason: "timeout" | "ambiguous" | "replaced";
	  };

export type HandTrackingFrame = {
	readonly timestamp: number;
	readonly hands: readonly TrackedHand[];
	readonly events: readonly HandTrackingEvent[];
	/** Aucun identifiant n'est attribué aux observations ambiguës. */
	readonly ambiguous: boolean;
};

const LOST_AFTER_MS = 120;
const MAX_MATCH_DISTANCE = 1.5;
const MAX_RECOVERY_DISTANCE = 0.5;
const MIN_SEPARATION = 0.75;
const AMBIGUITY_MARGIN = 0.2;

type Palm = { x: number; y: number; size: number };
type Candidate = { observation: HandObservation; palm: Palm };
type Assignment = { indices: (number | null)[]; count: number; cost: number };

function palmOf(
	observation: HandObservation,
	aspectRatio: number,
): Palm | null {
	const points = observation.landmarks;
	if (
		points.length !== 21 ||
		points.some((point) => ![point.x, point.y, point.z].every(Number.isFinite))
	)
		return null;
	const wrist = points[0];
	const middleBase = points[9];
	if (!wrist || !middleBase) return null;
	const size = Math.hypot(
		(wrist.x - middleBase.x) * aspectRatio,
		wrist.y - middleBase.y,
	);
	if (size < 0.00001) return null;
	return {
		x: ((wrist.x + middleBase.x) / 2) * aspectRatio,
		y: (wrist.y + middleBase.y) / 2,
		size,
	};
}

function distance(a: Palm, b: Palm): number {
	return Math.hypot(a.x - b.x, a.y - b.y) / ((a.size + b.size) / 2);
}

function matchCost(
	track: TrackedHand,
	candidate: Candidate,
	aspectRatio: number,
): number {
	const previous = palmOf(track.observation, aspectRatio);
	if (!previous) return Infinity;
	const movement = distance(previous, candidate.palm);
	const limit =
		track.status === "missing" ? MAX_RECOVERY_DISTANCE : MAX_MATCH_DISTANCE;
	if (movement > limit) return Infinity;

	const before = track.observation;
	const after = candidate.observation;
	// La latéralité est un indice secondaire, jamais un identifiant.
	const handednessPenalty =
		before.handedness !== "unknown" &&
		after.handedness !== "unknown" &&
		before.handedness !== after.handedness &&
		(before.handednessConfidence ?? 0) >= 0.8 &&
		(after.handednessConfidence ?? 0) >= 0.8
			? 0.25
			: 0;
	return movement + handednessPenalty;
}

/** Énumération exacte des associations possibles, bornée à deux mains. */
function assignmentsFor(costs: number[][]): Assignment[] {
	const assignments: Assignment[] = [];
	function visit(indices: (number | null)[], count: number, cost: number) {
		const row = costs[indices.length];
		if (!row) {
			assignments.push({ indices, count, cost });
			return;
		}
		visit([...indices, null], count, cost);
		row.forEach((value, index) => {
			if (Number.isFinite(value) && !indices.includes(index)) {
				visit([...indices, index], count + 1, cost + value);
			}
		});
	}
	visit([], 0, 0);
	return assignments.sort((a, b) => b.count - a.count || a.cost - b.cost);
}

/**
 * Suit au plus deux mains dans le repère source. Les identifiants sont locaux
 * à cette instance et ne sont pas réutilisés, même après reset().
 * Une proximité excessive ou deux associations presque équivalentes mettent
 * fin aux identités : aucune continuité physique n'est supposée dans ce cas.
 */
export function createHandIdentityTracker() {
	let tracks: TrackedHand[] = [];
	let nextId = 1;
	let lastTimestamp: number | null = null;
	let ambiguous = false;

	function checkTimestamp(timestamp: number) {
		if (
			!Number.isFinite(timestamp) ||
			(lastTimestamp !== null && timestamp < lastTimestamp)
		) {
			throw new RangeError("Tracking timestamps must be finite and monotonic");
		}
	}

	function lost(
		track: TrackedHand,
		timestamp: number,
		reason: "timeout" | "ambiguous" | "replaced",
	): HandTrackingEvent {
		return { type: "hand:lost", handId: track.id, timestamp, reason };
	}

	function expire(timestamp: number): HandTrackingEvent[] {
		lastTimestamp = timestamp;
		const events: HandTrackingEvent[] = [];
		tracks = tracks.filter((track) => {
			if (timestamp - track.observation.timestamp <= LOST_AFTER_MS) return true;
			events.push(lost(track, timestamp, "timeout"));
			return false;
		});
		return events;
	}

	function frame(
		timestamp: number,
		events: HandTrackingEvent[],
	): HandTrackingFrame {
		return { timestamp, hands: [...tracks], events, ambiguous };
	}

	/** Expire les identités même quand la vidéo ne fournit plus d'image. */
	function advance(timestamp: number): HandTrackingFrame {
		checkTimestamp(timestamp);
		return frame(timestamp, expire(timestamp));
	}

	function update(
		observations: readonly HandObservation[],
		timestamp: number,
		aspectRatio = 1,
	): HandTrackingFrame {
		checkTimestamp(timestamp);
		if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
			throw new RangeError(
				"The image aspect ratio must be positive and finite",
			);
		}
		if (observations.length > 2)
			throw new RangeError("At most two hands can be tracked");
		if (
			observations.some((observation) => observation.timestamp !== timestamp)
		) {
			throw new RangeError("Observations must belong to the current frame");
		}
		const events = expire(timestamp);
		const candidates: Candidate[] = [];
		for (const observation of observations) {
			const palm = palmOf(observation, aspectRatio);
			if (palm) candidates.push({ observation, palm });
		}
		const [best, alternative] = assignmentsFor(
			tracks.map((track) =>
				candidates.map((candidate) => matchCost(track, candidate, aspectRatio)),
			),
		);
		const [first, second] = candidates;
		ambiguous = !!(
			(first && second && distance(first.palm, second.palm) < MIN_SEPARATION) ||
			(best &&
				alternative &&
				best.count === alternative.count &&
				alternative.cost - best.cost < AMBIGUITY_MARGIN)
		);
		if (ambiguous) {
			events.push(
				...tracks.map((track) => lost(track, timestamp, "ambiguous")),
			);
			tracks = [];
			return frame(timestamp, events);
		}

		const matched: TrackedHand[] = [];
		const missing: TrackedHand[] = [];
		tracks.forEach((track, index) => {
			const candidateIndex = best?.indices[index];
			const candidate =
				candidateIndex == null ? undefined : candidates[candidateIndex];
			if (candidate) {
				matched.push({
					id: track.id,
					status: "tracked",
					observation: candidate.observation,
				});
			} else {
				missing.push({ ...track, status: "missing" });
			}
		});
		candidates.forEach((candidate, index) => {
			if (best?.indices.includes(index)) return;
			const id = nextId++;
			matched.push({
				id,
				status: "tracked",
				observation: candidate.observation,
			});
			events.push({ type: "hand:found", handId: id, timestamp });
		});

		// Une nouvelle main visible peut remplacer une ancienne piste manquante.
		missing.sort((a, b) => b.observation.timestamp - a.observation.timestamp);
		const available = 2 - matched.length;
		events.push(
			...missing
				.slice(available)
				.map((track) => lost(track, timestamp, "replaced")),
		);
		tracks = [...matched, ...missing.slice(0, available)].sort(
			(a, b) => a.id - b.id,
		);
		return frame(timestamp, events);
	}

	function reset() {
		tracks = [];
		lastTimestamp = null;
		ambiguous = false;
	}

	return { update, advance, reset };
}
