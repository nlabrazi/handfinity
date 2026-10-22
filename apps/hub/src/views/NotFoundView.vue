<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>

<template>
	<main class="lost-space">
		<p class="eyebrow">404 / HORS DU CHAMP</p>
		<h1>Cet espace reste à découvrir.</h1>
		<p>Cette adresse ne correspond à aucun projet.</p>
		<RouterLink to="/" class="text-link"
			>Revenir à l’accueil <span aria-hidden="true">↗</span></RouterLink
		>
	</main>
</template>
