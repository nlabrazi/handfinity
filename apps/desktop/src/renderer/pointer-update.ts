import type { GestureEngineFrame } from "@handfinity/engine";
import type { PointerUpdate } from "../pointer-contract";

/** Une image répétée ne déplace ni ne suspend un pointeur encore actif. */
export function toPointerUpdate(
	frame: GestureEngineFrame,
	sessionId: number,
	timeOrigin: number,
): PointerUpdate | null {
	const command = frame.commands.at(-1);
	const actions = frame.actions ?? [];
	if (
		!frame.control.paused &&
		command === undefined &&
		actions.length === 0 &&
		(frame.pointers.pointers.some(
			(pointer) => pointer.isPrimary && pointer.active,
		) ||
			frame.actionState?.leftButtonDown)
	)
		return null;
	const base: PointerUpdate = {
		sessionId,
		capturedAt: timeOrigin + frame.tracking.timestamp,
		paused: frame.control.paused,
		command: frame.control.paused ? null : (command ?? null),
	};
	if (!frame.control.paused && actions.length > 0) {
		return { ...base, actions };
	}
	return base;
}
