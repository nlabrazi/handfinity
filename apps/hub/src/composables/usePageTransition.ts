import { gsap } from "gsap";
import { nextTick, onScopeDispose, watch, type Ref } from "vue";

/** Les transitions finissent immédiatement si les mouvements sont désactivés. */
export function usePageTransition(paused: Readonly<Ref<boolean>>) {
	const active = new Map<
		Element,
		{ context?: gsap.Context; finish: () => void }
	>();

	function cancel(element: Element) {
		const transition = active.get(element);
		active.delete(element);
		transition?.context?.revert();
	}

	function animate(element: Element, done: () => void, entering: boolean) {
		cancel(element);
		const finish = () => {
			cancel(element);
			done();
		};
		if (paused.value) {
			// Laisser Vue terminer son patch avant de poursuivre le mode out-in,
			// même sans animation visuelle.
			active.set(element, { finish });
			nextTick(() => {
				if (active.get(element)?.finish === finish) finish();
			});
			return;
		}
		const context = gsap.context(() => {
			gsap.fromTo(
				element,
				{ opacity: entering ? 0 : 1, y: entering ? 12 : 0 },
				{
					opacity: entering ? 1 : 0,
					y: entering ? 0 : -8,
					duration: 0.24,
					ease: "power1.inOut",
					onComplete: finish,
				},
			);
		});
		active.set(element, { context, finish });
	}

	watch(
		paused,
		(value) => {
			if (value)
				for (const transition of [...active.values()]) transition.finish();
		},
		{ flush: "post" },
	);
	onScopeDispose(() => {
		for (const element of active.keys()) cancel(element);
	});

	return {
		enter: (element: Element, done: () => void) => animate(element, done, true),
		leave: (element: Element, done: () => void) =>
			animate(element, done, false),
		cancel,
	};
}
