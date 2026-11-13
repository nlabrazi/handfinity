import {
	computed,
	type InjectionKey,
	inject,
	onScopeDispose,
	provide,
	ref,
} from "vue";

const motionKey: InjectionKey<ReturnType<typeof createMotionPreferences>> =
	Symbol("handfinity-motion");

function createMotionPreferences() {
	const media = window.matchMedia("(prefers-reduced-motion: reduce)");
	const reducedMotion = ref(media.matches);
	const paused = ref(false);
	try {
		paused.value = localStorage.getItem("handfinity-motion-paused") === "true";
	} catch {
		/* Le réglage reste disponible sans stockage. */
	}
	const motionPaused = computed(() => reducedMotion.value || paused.value);
	function updateMotion(event: MediaQueryListEvent) {
		reducedMotion.value = event.matches;
	}
	media.addEventListener("change", updateMotion);
	onScopeDispose(() => media.removeEventListener("change", updateMotion));

	function toggleMotion() {
		paused.value = !paused.value;
		try {
			localStorage.setItem("handfinity-motion-paused", String(paused.value));
		} catch {
			/* Le réglage reste valable pour cette visite. */
		}
	}

	return { reducedMotion, paused, motionPaused, toggleMotion };
}

export function provideMotionPreferences() {
	const preferences = createMotionPreferences();
	provide(motionKey, preferences);
	return preferences;
}

export function useMotionPreferences() {
	const preferences = inject(motionKey);
	if (!preferences) throw new Error("Motion preferences provider is missing");
	return preferences;
}
