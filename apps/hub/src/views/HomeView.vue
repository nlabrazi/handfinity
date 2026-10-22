<script setup lang="ts">
import { RouterLink } from "vue-router";
import HolographicHand from "../components/HolographicHand.vue";
import ProjectPreview from "../components/ProjectPreview.vue";

function moveLight(event: PointerEvent) {
	if (event.pointerType !== "mouse") return;
	const scene = event.currentTarget as HTMLElement;
	if (scene.closest('[data-motion="paused"]')) return;
	const rect = scene.getBoundingClientRect();
	scene.style.setProperty(
		"--look-x",
		String((event.clientX - rect.left) / rect.width - 0.5),
	);
	scene.style.setProperty(
		"--look-y",
		String((event.clientY - rect.top) / rect.height - 0.5),
	);
}

function resetLight(event: PointerEvent) {
	const scene = event.currentTarget as HTMLElement;
	scene.style.setProperty("--look-x", "0");
	scene.style.setProperty("--look-y", "0");
}
</script>

<template>
	<main
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
						L’ESPACE PREND VIE
					</p>
					<h1>Que souhaitez-vous<br><em>faire ?</em></h1>
				</div>
				<p class="welcome-note">
					Un mouvement. <br>Un monde de possibilités.<br>
					<span>Choisissez votre prochaine expérience.</span>
				</p>
			</header>

			<section
				class="project-constellation"
				aria-label="Choisir une expérience"
			>
				<RouterLink
					to="/paint"
					class="project-portal portal-paint"
					aria-label="Ouvrir Paint"
				>
					<div class="portal-topline">
						<span>01 / CRÉATION</span
						><span class="availability"
							><i aria-hidden="true" />
							Disponible</span
						>
					</div>
					<ProjectPreview project="paint" />
					<div class="portal-copy">
						<p class="portal-kicker">IMAGINEZ. TRACEZ. RECOMMENCEZ.</p>
						<h2>Paint<span aria-hidden="true">.</span></h2>
						<p>Vos idées prennent forme.<br>Dessinez directement dans l’air.</p>
					</div>
					<div class="portal-action">
						<span>Entrer dans l’atelier</span
						><span class="portal-arrow" aria-hidden="true">↗</span>
					</div>
				</RouterLink>

				<div class="hologram" aria-hidden="true">
					<div class="orbital orbital-outer" />
					<div class="orbital orbital-inner" />
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
					class="project-portal portal-playground"
					aria-label="Ouvrir Playground"
				>
					<div class="portal-topline">
						<span>02 / EXPLORATION</span
						><span class="availability"
							><i aria-hidden="true" />
							Disponible</span
						>
					</div>
					<ProjectPreview project="playground" />
					<div class="portal-copy">
						<p class="portal-kicker">CHAQUE GESTE EST UN DÉBUT.</p>
						<h2>Playground<span aria-hidden="true">.</span></h2>
						<p>
							Explorez le langage de vos mains.<br>Observez, bougez,
							expérimentez.
						</p>
					</div>
					<div class="portal-action">
						<span>Explorer le laboratoire</span
						><span class="portal-arrow" aria-hidden="true">↗</span>
					</div>
				</RouterLink>
			</section>

			<section class="future-spaces" aria-labelledby="future-title">
				<div class="future-heading">
					<span class="eyebrow">ET ENSUITE ?</span>
					<h2 id="future-title">L’univers s’agrandit.</h2>
				</div>
				<div class="future-project">
					<span class="future-number" aria-hidden="true">03</span>
					<div>
						<h3>Un nouvel horizon</h3>
						<p>La prochaine expérience se prépare.</p>
					</div>
					<span class="coming-soon">À venir</span>
				</div>
				<div class="future-project">
					<span class="future-number" aria-hidden="true">04</span>
					<div>
						<h3>L’inconnu vous attend</h3>
						<p>Encore tout à imaginer.</p>
					</div>
					<span class="coming-soon">À venir</span>
				</div>
			</section>

			<footer class="universe-footer">
				<span>CONÇU POUR LE MOUVEMENT.</span>
				<p>Une webcam. Vos mains. Le reste vous appartient.</p>
				<span class="footer-coordinate" aria-hidden="true">[ H / ∞ ]</span>
			</footer>
		</div>
	</main>
</template>
