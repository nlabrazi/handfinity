<script setup lang="ts">
import { useId } from "vue";

defineProps<{ project: "paint" | "playground" }>();
const id = useId();
const paintPath = "M28 133C100 203 247 89 171 69S70 157 169 123 261-5 314 44";
</script>

<template>
	<svg
		v-if="project === 'paint'"
		class="project-preview paint-preview"
		viewBox="0 0 340 180"
		fill="none"
		aria-hidden="true"
	>
		<defs>
			<linearGradient :id="`${id}-cool`" x1="0" y1="1" x2="1" y2="0">
				<stop stop-color="#336cff" />
				<stop offset=".45" stop-color="#31e4fa" />
				<stop offset=".7" stop-color="#8b5dff" />
				<stop offset="1" stop-color="#ec61e9" />
			</linearGradient>
			<linearGradient :id="`${id}-warm`" x1="0" y1="1" x2="1" y2="0">
				<stop stop-color="#ffcf70" />
				<stop offset=".35" stop-color="#ff826e" />
				<stop offset=".7" stop-color="#ed51c1" />
				<stop offset="1" stop-color="#9b66ff" />
			</linearGradient>
		</defs>
		<path
			class="preview-grid"
			d="M0 45H340M0 90H340M0 135H340M55 0V180M110 0V180M165 0V180M220 0V180M275 0V180"
		/>
		<g class="paint-ribbons">
			<path
				:fill="`url(#${id}-warm)`"
				d="M23 155C77 73 128 169 205 98S285-5 322 39C279 10 260 99 207 130S80 107 23 155Z"
			/>
			<path
				:fill="`url(#${id}-cool)`"
				d="M21 121C84 197 246 97 179 69C219 112 112 105 108 78C94 137 240 113 187 141S56 187 21 121Z"
			/>
			<path
				:fill="`url(#${id}-cool)`"
				d="M63 47C108 12 158 105 222 62S278 15 311 23C269 9 267 55 224 76S118 40 63 47Z"
				opacity=".8"
			/>
		</g>
		<path class="paint-guide" :d="paintPath" :stroke="`url(#${id}-cool)`" />
		<path
			class="paint-line paint-line-main"
			:d="paintPath"
			:stroke="`url(#${id}-cool)`"
		/>
		<path
			class="paint-line paint-line-accent"
			d="M36 157C115 96 166 178 249 93S294 28 321 39"
			:stroke="`url(#${id}-warm)`"
		/>
		<g class="paint-sparks" fill="#f6afdd">
			<circle
				v-for="dot in 22"
				:key="dot"
				:cx="22 + (dot * 47) % 290"
				:cy="18 + (dot * 31) % 145"
				:r="dot % 3 === 0 ? 1.8 : .9"
			/>
		</g>
		<circle class="paint-tip" cx="28" cy="133" r="4" fill="#e9fcff" />
	</svg>
	<svg
		v-else
		class="project-preview tracking-preview"
		viewBox="0 0 340 180"
		fill="none"
		aria-hidden="true"
	>
		<path
			class="preview-grid"
			d="M0 45H340M0 90H340M0 135H340M55 0V180M110 0V180M165 0V180M220 0V180M275 0V180"
		/>
		<g stroke="currentColor" stroke-width="1.2" class="tracking-skeleton">
			<path
				d="m171 155-45-44-26-18-17-20m88 82-26-67-7-35-2-27m35 129 5-71 1-43 1-29m-7 143 32-66 9-37 6-26m-47 129 57-44 17-30 9-20M126 111l19-23 31-4 27 5 25 22"
			/>
			<circle cx="171" cy="155" r="4" />
			<circle cx="126" cy="111" r="3" />
			<circle cx="100" cy="93" r="3" />
			<circle cx="83" cy="73" r="4" />
			<circle cx="145" cy="88" r="3" />
			<circle cx="138" cy="53" r="3" />
			<circle cx="136" cy="26" r="4" />
			<circle cx="176" cy="84" r="3" />
			<circle cx="177" cy="41" r="3" />
			<circle cx="178" cy="12" r="4" />
			<circle cx="203" cy="89" r="3" />
			<circle cx="212" cy="52" r="3" />
			<circle cx="218" cy="26" r="4" />
			<circle cx="228" cy="111" r="3" />
			<circle cx="245" cy="81" r="3" />
			<circle cx="254" cy="61" r="4" />
		</g>
		<path
			class="tracking-brackets"
			d="M58 54V30H82M260 30H284V54M58 131V155H82M260 155H284V131"
		/>
		<path class="tracking-scan" d="M60 85H280" />
	</svg>
</template>
