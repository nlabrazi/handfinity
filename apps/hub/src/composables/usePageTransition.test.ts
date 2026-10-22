import { gsap } from "gsap";
import { effectScope, nextTick, ref, type EffectScope } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePageTransition } from "./usePageTransition";

const scopes: EffectScope[] = [];
function setup(initiallyPaused = false) {
	const scope = effectScope();
	scopes.push(scope);
	const paused = ref(initiallyPaused);
	const transition = scope.run(() => usePageTransition(paused));
	if (!transition) throw new Error("Missing transition scope");
	// GSAP sait animer des objets : on vérifie le cycle de vie sans émuler le DOM.
	const target = { opacity: 1, y: 0 };
	return {
		transition,
		paused,
		scope,
		target,
		element: target as unknown as Element,
	};
}

afterEach(() => {
	for (const scope of scopes.splice(0)) scope.stop();
});

describe("page transition lifecycle", () => {
	it("waits for Vue's patch without creating a tween when motion is paused", async () => {
		const { transition, element, target } = setup(true);
		const done = vi.fn();
		transition.enter(element, done);
		expect(done).not.toHaveBeenCalled();
		await nextTick();
		expect(done).toHaveBeenCalledOnce();
		expect(gsap.getTweensOf(target)).toHaveLength(0);
		expect(target.opacity).toBe(1);
	});

	it("cancels a queued completion when navigation changes before Vue's next tick", async () => {
		const { transition, element } = setup(true);
		const done = vi.fn();
		transition.enter(element, done);
		transition.cancel(element);
		await nextTick();
		expect(done).not.toHaveBeenCalled();
	});

	it("restores the element after completion so cached views can reappear", () => {
		const { transition, element, target } = setup();
		const done = vi.fn();
		transition.leave(element, done);
		const tween = gsap.getTweensOf(target)[0];
		if (!tween) throw new Error("Missing transition tween");
		tween.progress(1);
		expect(done).toHaveBeenCalledOnce();
		expect(target.opacity).toBe(1);
		expect(target.y).toBe(0);
		expect(gsap.getTweensOf(target)).toHaveLength(0);
	});

	it("finishes an in-flight transition if motion is disabled", async () => {
		const { transition, element, target, paused } = setup();
		const done = vi.fn();
		transition.enter(element, done);
		paused.value = true;
		await nextTick();
		expect(done).toHaveBeenCalledOnce();
		expect(target.opacity).toBe(1);
		expect(gsap.getTweensOf(target)).toHaveLength(0);
	});

	it("cancels an interrupted transition without calling its completion callback", () => {
		const { transition, element, target } = setup();
		const done = vi.fn();
		transition.enter(element, done);
		transition.cancel(element);
		expect(done).not.toHaveBeenCalled();
		expect(target.opacity).toBe(1);
		expect(gsap.getTweensOf(target)).toHaveLength(0);
	});

	it("replaces the previous tween on rapid navigation and cleans up on disposal", () => {
		const { transition, element, target, scope } = setup();
		const entered = vi.fn();
		const left = vi.fn();
		transition.enter(element, entered);
		transition.leave(element, left);
		expect(gsap.getTweensOf(target)).toHaveLength(1);
		scope.stop();
		expect(entered).not.toHaveBeenCalled();
		expect(left).not.toHaveBeenCalled();
		expect(gsap.getTweensOf(target)).toHaveLength(0);
		expect(target.opacity).toBe(1);
	});
});
