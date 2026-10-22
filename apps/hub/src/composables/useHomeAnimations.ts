import { gsap } from "gsap";
import { watch, type Ref } from "vue";
import { createHomeAmbience } from "../animations/homeAmbience";
import { useGsapContext } from "./useGsapContext";
import { useMotionPreferences } from "./useMotionPreferences";

export function useHomeAnimations(root: Readonly<Ref<HTMLElement | null>>) {
	const { motionPaused } = useMotionPreferences();
	let moveLight = (_event: PointerEvent) => {};
	let resetLight = () => {};

	useGsapContext(root, () => {
		const scene = root.value;
		if (!scene) return;
		const ambience = createHomeAmbience();
		const layers = [
			{ selector: ".world-glow", x: 45, y: 30, duration: 0.6 },
			{ selector: ".hand-projection", x: 16, y: 10, duration: 0.8 },
		].map(({ selector, x, y, duration }) => {
			const element = scene.querySelector(selector);
			return {
				element,
				x,
				y,
				moveX: gsap.quickTo(element, "x", { duration, ease: "power2.out" }),
				moveY: gsap.quickTo(element, "y", { duration, ease: "power2.out" }),
			};
		});

		moveLight = (event) => {
			if (motionPaused.value || event.pointerType !== "mouse") return;
			const rect = scene.getBoundingClientRect();
			const x = (event.clientX - rect.left) / rect.width - 0.5;
			const y = (event.clientY - rect.top) / rect.height - 0.5;
			for (const layer of layers) {
				layer.moveX(x * layer.x);
				layer.moveY(y * layer.y);
			}
		};
		resetLight = () => {
			if (motionPaused.value) return;
			for (const layer of layers) {
				layer.moveX(0);
				layer.moveY(0);
			}
		};

		// Les quickTo réutilisent leurs tweens, sans en créer un à chaque mouvement.
		const stopWatching = watch(
			motionPaused,
			(paused) => {
				ambience.paused(paused);
				if (paused) {
					for (const layer of layers) {
						layer.moveX(0);
						layer.moveY(0);
						layer.moveX.tween.progress(1).pause();
						layer.moveY.tween.progress(1).pause();
					}
				}
			},
			{ immediate: true },
		);

		return () => {
			stopWatching();
			moveLight = () => {};
			resetLight = () => {};
		};
	});

	return {
		moveLight: (event: PointerEvent) => moveLight(event),
		resetLight: () => resetLight(),
	};
}
