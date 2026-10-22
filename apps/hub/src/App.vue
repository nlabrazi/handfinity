<script setup lang="ts">
import { useId } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { provideMotionPreferences } from "./composables/useMotionPreferences";
import { usePageTransition } from "./composables/usePageTransition";

const route = useRoute();
const brandGradient = useId();
const { reducedMotion, paused, motionPaused, toggleMotion } =
	provideMotionPreferences();
const pageTransition = usePageTransition(motionPaused);

function focusPage(element: Element) {
	const heading = element.querySelector("h1");
	if (heading) {
		heading.setAttribute("tabindex", "-1");
		heading.focus({ preventScroll: true });
	}
}
</script>

<template>
	<div class="hub-app" :data-motion="motionPaused ? 'paused' : 'running'">
		<a class="skip-link" href="#experience">Aller au contenu</a>
		<header class="hub-header">
			<RouterLink to="/" class="brand" aria-label="Handfinity — Accueil">
				<svg viewBox="0 0 60 48" aria-hidden="true">
					<defs>
						<linearGradient :id="brandGradient" x1="0" y1="0" x2="1" y2="1">
							<stop stop-color="#29e7f5" />
							<stop offset=".5" stop-color="#4f9dff" />
							<stop offset="1" stop-color="#c267ff" />
						</linearGradient>
					</defs>
					<path
						d="M30 32C19 13 4 17 4 32s15 19 26 0C41 13 56 17 56 32s-15 19-26 0Z"
						fill="none"
						:stroke="`url(#${brandGradient})`"
						stroke-width="5.5"
					/>
					<path
						d="m27 15 1-8m6 5 3-10m3 12 5-10m0 15 7-9m-4 14 8-7"
						fill="none"
						:stroke="`url(#${brandGradient})`"
						stroke-width="3"
						stroke-linecap="round"
					/>
				</svg>
				<span
					>Hand<span class="brand-light">finity</span
					><small>AU-DELÀ DE L’ÉCRAN</small></span
				>
			</RouterLink>
			<nav class="hub-nav" aria-label="Navigation principale">
				<RouterLink to="/" exact-active-class="is-current">Accueil</RouterLink>
				<RouterLink to="/paint" exact-active-class="is-current"
					>Paint</RouterLink
				>
				<RouterLink to="/playground" exact-active-class="is-current"
					>Playground</RouterLink
				>
			</nav>
			<button
				class="motion-control"
				type="button"
				:disabled="reducedMotion"
				:aria-pressed="motionPaused"
				@click="toggleMotion"
			>
				<span aria-hidden="true">{{ motionPaused ? "▷" : "Ⅱ" }}</span>
				{{
					reducedMotion
						? "Animations réduites"
						: paused
							? "Reprendre l’ambiance"
							: "Pause de l’ambiance"
				}}
			</button>
		</header>

		<div
			v-if="route.name === 'paint' || route.name === 'playground'"
			class="workspace-bar"
		>
			<RouterLink to="/" class="back-link"
				><span aria-hidden="true">←</span>
				Retour aux expériences</RouterLink
			>
			<span class="eyebrow">{{
				route.name === "paint" ? "01 / CRÉATION" : "02 / EXPLORATION"
			}}</span>
		</div>

		<div id="experience" tabindex="-1">
			<RouterView v-slot="{ Component, route: currentRoute }">
				<Transition
					:css="false"
					mode="out-in"
					@enter="pageTransition.enter"
					@leave="pageTransition.leave"
					@enter-cancelled="pageTransition.cancel"
					@leave-cancelled="pageTransition.cancel"
					@after-enter="focusPage"
				>
					<KeepAlive include="PaintWorkspace">
						<component :is="Component" :key="currentRoute.name" />
					</KeepAlive>
				</Transition>
			</RouterView>
		</div>
	</div>
</template>
