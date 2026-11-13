import type {
	SystemOverlayBridge,
	SystemPointerBridge,
} from "../pointer-contract";

declare global {
	interface Window {
		readonly handfinityPointer?: SystemPointerBridge;
		readonly handfinityOverlay?: SystemOverlayBridge;
	}
}
