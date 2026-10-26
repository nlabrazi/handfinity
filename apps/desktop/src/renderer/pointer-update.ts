import type { GestureEngineFrame } from "@handfinity/interactions";
import type { PointerUpdate } from "../pointer-contract";

/** Une image répétée ne déplace ni ne suspend un pointeur encore actif. */
export function toPointerUpdate(
	frame: GestureEngineFrame,
	sessionId: number,
	timeOrigin: number,
): PointerUpdate | null {
	const command = frame.commands.at(-1);
	if (
		command === undefined &&
		frame.pointers.pointers.some(
			(pointer) => pointer.isPrimary && pointer.active,
		)
	)
		return null;
	return {
		sessionId,
		capturedAt: timeOrigin + frame.tracking.timestamp,
		command: command ?? null,
	};
}
