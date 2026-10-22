import { gsap } from "gsap";
import { onBeforeUnmount, onMounted, type Ref } from "vue";

/** Limite les sélecteurs à la vue et restaure ses styles lors du démontage. */
export function useGsapContext(
	root: Readonly<Ref<HTMLElement | null>>,
	setup: (context: gsap.Context) => undefined | (() => void),
) {
	let context: gsap.Context | undefined;
	onMounted(() => {
		if (root.value) context = gsap.context(setup, root.value);
	});
	onBeforeUnmount(() => context?.revert());
}
