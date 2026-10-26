import type { SystemPointerBridge } from "../pointer-contract";

declare global {
	interface Window {
		readonly handfinityPointer?: SystemPointerBridge;
	}
}
