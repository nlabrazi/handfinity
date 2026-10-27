<script setup lang="ts">
import { useTemplateRef } from "vue";
import { RouterLink } from "vue-router";
import HolographicHand from "../components/HolographicHand.vue";
import TrackingPreview from "../components/TrackingPreview.vue";
import { useHomeAnimations } from "../composables/useHomeAnimations";

const scene = useTemplateRef<HTMLElement>("scene");
const { moveLight, resetLight } = useHomeAnimations(scene);
</script>

<template>
	<main
		ref="scene"
		class="home-universe"
		@pointermove="moveLight"
		@pointerleave="resetLight"
	>
		<div class="world" aria-hidden="true">
			<div class="world-glow" />
			<svg
				class="world-streams"
				aria-hidden="true"
				viewBox="0 0 1440 800"
				fill="none"
				preserveAspectRatio="xMidYMid slice"
			>
				<path d="M-180 530C80 20 340 780 730 410S1190-80 1650 190" />
				<path d="M-180 560C100 40 360 810 750 440S1210-50 1650 220" />
				<path d="M-180 590C120 60 380 840 770 470S1230-20 1650 250" />
			</svg>
			<div class="world-grid" />
			<div class="world-dust" />
			<div class="world-horizon" />
		</div>

		<div class="universe-content">
			<header class="welcome">
				<div>
					<p class="eyebrow welcome-label">
						<span aria-hidden="true" />
						HANDFINITY / INTERFACE GESTUELLE
					</p>
					<h1>Vos mains.<br><em>Votre interface.</em></h1>
				</div>
				<p class="welcome-note">
					Contrôlez votre PC<br>avec vos mains.
					<span
						>Souris gestuelle (pointage, clic, glisser-déposer, défilement) et
						clavier virtuel sur Windows, ou test direct dans le
						laboratoire.</span
					>
				</p>
			</header>

			<section class="home-overview" aria-label="Découvrir le laboratoire">
				<div class="hologram" aria-hidden="true">
					<div class="orbital orbital-outer">
						<span class="orbital-track" />
					</div>
					<div class="orbital orbital-inner">
						<span class="orbital-track" />
					</div>
					<div class="hand-projection"><HolographicHand /></div>
					<div class="projection-base"><span /><span /><span /></div>
					<div class="hologram-label">
						<span>LE MOUVEMENT<br>DEVIENT POSSIBLE</span><i /><span>∞</span>
					</div>
					<span class="spatial-mark mark-top">+ 01</span
					><span class="spatial-mark mark-bottom">+ 02</span>
				</div>

				<RouterLink
					to="/playground"
					class="laboratory-link"
					aria-label="Ouvrir Playground"
				>
					<div class="portal-topline">
						<span>PLAYGROUND / DIAGNOSTICS</span
						><span class="availability"
							><i aria-hidden="true" />
							Disponible</span
						>
					</div>
					<TrackingPreview />
					<div class="portal-copy">
						<p class="portal-kicker">OBSERVER. COMPRENDRE. VÉRIFIER.</p>
						<h2>Playground<span aria-hidden="true">.</span></h2>
						<p>
							Observez vos mains, les postures reconnues et le pointeur. Activez
							la caméra à votre demande.
						</p>
					</div>
					<div class="portal-action">
						<span>Explorer le laboratoire</span
						><span class="portal-arrow" aria-hidden="true">↗</span>
					</div>
				</RouterLink>
			</section>

			<footer class="universe-footer">
				<span>CONÇU POUR LE MOUVEMENT.</span>
				<p>Une webcam. Vos mains. Le reste vous appartient.</p>
				<span class="footer-coordinate" aria-hidden="true">[ H / ∞ ]</span>
			</footer>
		</div>
	</main>
</template>
