<script setup lang="ts">
import { useId } from "vue";

const id = useId();
const points = [
	[200, 395],
	[143, 310],
	[116, 285],
	[82, 235],
	[67, 222],
	[166, 270],
	[157, 217],
	[145, 155],
	[136, 111],
	[191, 258],
	[196, 185],
	[188, 115],
	[188, 62],
	[222, 265],
	[225, 185],
	[237, 115],
	[237, 55],
	[248, 285],
	[270, 235],
	[294, 200],
	[307, 183],
];
const connections: [number, number][] = [
	[0, 1],
	[1, 2],
	[2, 3],
	[3, 4],
	[0, 5],
	[5, 6],
	[6, 7],
	[7, 8],
	[5, 9],
	[9, 10],
	[10, 11],
	[11, 12],
	[9, 13],
	[13, 14],
	[14, 15],
	[15, 16],
	[13, 17],
	[0, 17],
	[17, 18],
	[18, 19],
	[19, 20],
	[0, 9],
	[0, 13],
	[1, 5],
];
const outline =
	"M157 409C151 376 128 348 111 318L61 235C48 215 63 199 79 211L122 253 121 120Q119 97 133 96Q147 95 149 115L159 225 173 66Q175 43 189 47Q204 48 201 70L194 219 222 55Q226 35 240 40Q255 44 249 65L238 251 292 178Q301 158 315 168Q328 177 317 198L284 280C278 322 264 366 248 403Z";
</script>

<template>
	<svg
		class="holographic-hand"
		viewBox="0 0 400 460"
		fill="none"
		aria-hidden="true"
	>
		<defs>
			<linearGradient
				:id="`${id}-fill`"
				x1="90"
				y1="50"
				x2="280"
				y2="420"
				gradientUnits="userSpaceOnUse"
			>
				<stop stop-color="#36dfff" stop-opacity=".22" />
				<stop offset=".55" stop-color="#448bff" stop-opacity=".09" />
				<stop offset="1" stop-color="#b368ff" stop-opacity=".18" />
			</linearGradient>
			<clipPath :id="`${id}-clip`"><path :d="outline" /></clipPath>
		</defs>
		<path
			:d="outline"
			:fill="`url(#${id}-fill)`"
			stroke="currentColor"
			stroke-opacity=".8"
			stroke-width="1.5"
		/>
		<g
			:clip-path="`url(#${id}-clip)`"
			stroke="currentColor"
			stroke-opacity=".09"
			stroke-width=".7"
		>
			<path v-for="line in 31" :key="line" :d="`M40 ${line * 14} H340`" />
			<path
				v-for="line in 23"
				:key="`vertical-${line}`"
				:d="`M${line * 14 + 30} 30 V430`"
			/>
			<path
				class="hand-scan"
				d="M40 210 H340"
				stroke-opacity=".8"
				stroke-width="2"
			/>
		</g>
		<path
			d="m143 310 48-52 57 27-48 110Z"
			fill="currentColor"
			fill-opacity=".04"
		/>
		<g stroke="currentColor" stroke-width="1.4" stroke-opacity=".85">
			<line
				v-for="([ from, to ], index) in connections"
				:key="index"
				:x1="points[from]?.[0]"
				:y1="points[from]?.[1]"
				:x2="points[to]?.[0]"
				:y2="points[to]?.[1]"
			/>
		</g>
		<g v-for="([ x, y ], index) in points" :key="index">
			<circle
				:cx="x"
				:cy="y"
				r="3.8"
				fill="#a8efff"
				stroke="currentColor"
				stroke-width="1.2"
			/>
			<circle :cx="x" :cy="y" r="1.6" fill="#ffffff" />
		</g>
		<g
			class="hand-beacons"
			stroke="currentColor"
			stroke-width=".8"
			stroke-opacity=".6"
		>
			<circle cx="188" cy="62" r="10" />
			<circle cx="136" cy="111" r="10" />
			<circle cx="200" cy="395" r="12" />
		</g>
	</svg>
</template>
