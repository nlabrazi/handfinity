<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const props = defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  'press-key': [key: string]
  close: []
}>()

const layout = ref<'azerty' | 'qwerty'>('azerty')
const uppercase = ref(false)
const lastSentKey = ref<string | null>(null)

const opacityOptions = [
  {
    label: '20%',
    class: 'bg-slate-950/20 border-cyan-500/25 shadow-black/40 backdrop-blur-md',
  },
  {
    label: '40%',
    class: 'bg-slate-950/40 border-cyan-500/35 shadow-black/60 backdrop-blur-lg',
  },
  {
    label: '70%',
    class: 'bg-slate-900/70 border-cyan-500/45 shadow-black/80 backdrop-blur-xl',
  },
] as const

const opacityIndex = ref(0)
const currentOpacityClass = computed(
  () => opacityOptions[opacityIndex.value]?.class ?? opacityOptions[0].class,
)
const currentOpacityLabel = computed(() => opacityOptions[opacityIndex.value]?.label ?? '20%')

function cycleOpacity() {
  opacityIndex.value = (opacityIndex.value + 1) % opacityOptions.length
}

const isDragging = ref(false)
let isPointerDown = false
let isInteractiveTarget = false
let startX = 0
let startY = 0
let lastX = 0
let lastY = 0
let accumulatedDeltaX = 0
let accumulatedDeltaY = 0
let rafId: number | null = null
const DRAG_THRESHOLD = 4

function flushMove() {
  if (accumulatedDeltaX !== 0 || accumulatedDeltaY !== 0) {
    window.handfinityOverlay?.moveBy(accumulatedDeltaX, accumulatedDeltaY)
    accumulatedDeltaX = 0
    accumulatedDeltaY = 0
  }
  rafId = null
}

function queueMove(stepX: number, stepY: number) {
  accumulatedDeltaX += stepX
  accumulatedDeltaY += stepY
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    if (rafId === null) {
      rafId = window.requestAnimationFrame(flushMove)
    }
  } else {
    flushMove()
  }
}

function isInteractiveControl(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return !!target.closest('button')
}

function onMouseDown(event: MouseEvent) {
  if (event.button !== 0) return
  isPointerDown = true
  isDragging.value = false
  isInteractiveTarget = isInteractiveControl(event.target)
  startX = event.screenX
  startY = event.screenY
  lastX = event.screenX
  lastY = event.screenY
  accumulatedDeltaX = 0
  accumulatedDeltaY = 0

  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp, { capture: true })
}

function onMouseMove(event: MouseEvent) {
  if (!isPointerDown) return
  const totalDist = Math.hypot(event.screenX - startX, event.screenY - startY)
  const threshold = isInteractiveTarget ? DRAG_THRESHOLD : 1

  if (!isDragging.value && totalDist >= threshold) {
    isDragging.value = true
  }

  if (isDragging.value) {
    const stepX = event.screenX - lastX
    const stepY = event.screenY - lastY
    lastX = event.screenX
    lastY = event.screenY

    if (stepX !== 0 || stepY !== 0) {
      queueMove(stepX, stepY)
    }
  }
}

function onMouseUp() {
  if (!isPointerDown) return
  isPointerDown = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp, { capture: true })

  if (rafId !== null) {
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(rafId)
    }
    rafId = null
  }
  flushMove()

  if (isDragging.value) {
    isDragging.value = false
    const suppressClick = (e: MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener('click', suppressClick, {
      capture: true,
      once: true,
    })
    setTimeout(() => {
      window.removeEventListener('click', suppressClick, { capture: true })
    }, 50)
  }
}

function resetPosition() {
  window.handfinityOverlay?.resetPosition()
}

onBeforeUnmount(() => {
  isPointerDown = false
  isDragging.value = false
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp, { capture: true })
  if (rafId !== null) {
    if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(rafId)
    }
    rafId = null
  }
})

const rows = computed(() => {
  const base =
    layout.value === 'azerty'
      ? [
          ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
          ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
          ['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm'],
          ['w', 'x', 'c', 'v', 'b', 'n', ',', '.', '-', "'"],
        ]
      : [
          ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
          ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
          ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';'],
          ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '-'],
        ]
  return base.map((row) => row.map((ch) => (uppercase.value ? ch.toUpperCase() : ch)))
})

const specialKeys = [
  { label: '⌫ Backspace', value: 'Backspace' },
  { label: '⇥ Tab', value: 'Tab' },
  { label: '␣ Space', value: 'Space' },
  { label: '↵ Enter', value: 'Enter' },
  { label: '←', value: 'ArrowLeft' },
  { label: '↑', value: 'ArrowUp' },
  { label: '↓', value: 'ArrowDown' },
  { label: '→', value: 'ArrowRight' },
] as const

function send(key: string) {
  if (props.disabled) return
  lastSentKey.value = key
  emit('press-key', key)
}
</script>

<template>
	<section
		data-virtual-keyboard
		:data-dragging="isDragging ? 'true' : 'false'"
		aria-labelledby="virtual-keyboard-title"
		@mousedown="onMouseDown"
		@dragstart.prevent
		class="space-y-2 rounded-2xl border p-3 text-sm shadow-2xl transition-all duration-200 select-none cursor-grab active:cursor-grabbing"
		:class="[currentOpacityClass, { 'cursor-grabbing': isDragging }]"
	>
		<!-- Barre supérieure indicatrice de déplacement -->
		<div
			data-drag-handle
			class="flex w-full cursor-grab items-center justify-center rounded-lg border border-white/10 bg-white/5 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-cyan-400/40 hover:bg-white/10 select-none active:cursor-grabbing"
			title="Cliquer et glisser n'importe où sur le clavier pour le déplacer"
		>
			<span class="flex items-center gap-1.5 pointer-events-none">
				<span class="font-mono text-cyan-400">⠿</span>
				<span>Glisser n'importe quelle zone pour déplacer le clavier</span>
			</span>
		</div>

		<div
			class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2 cursor-grab active:cursor-grabbing"
		>
			<div class="flex items-center gap-2 pointer-events-none">
				<span
					class="rounded bg-cyan-950/60 px-2 py-0.5 text-xs font-semibold text-cyan-300 border border-cyan-800/50"
				>
					OVERLAY
				</span>
				<div>
					<h2
						id="virtual-keyboard-title"
						class="font-medium text-white/95 text-xs"
					>
						Clavier virtuel Windows
					</h2>
					<p class="text-[11px] text-slate-400">
						Sans perte de focus · Pointez et touchez ou glissez pour déplacer
					</p>
				</div>
			</div>
			<div class="flex items-center gap-1.5 text-xs">
				<span
					v-if="lastSentKey"
					class="rounded bg-slate-800/60 px-2 py-0.5 font-mono text-cyan-300 border border-cyan-700/40"
				>
					{{ lastSentKey }}
				</span>
				<button
					type="button"
					@click="resetPosition"
					title="Recentrer le clavier en bas de l'écran"
					class="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300 hover:bg-white/15 cursor-pointer active:cursor-grabbing"
				>
					↺ Recentrer
				</button>
				<button
					type="button"
					@click="cycleOpacity"
					title="Changer le niveau de transparence"
					class="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300 hover:bg-white/15 cursor-pointer active:cursor-grabbing"
				>
					Transparence : {{ currentOpacityLabel }}
				</button>
				<button
					type="button"
					@click="uppercase = !uppercase"
					:aria-pressed="uppercase"
					class="rounded border px-2 py-0.5 font-medium transition-colors cursor-pointer active:cursor-grabbing"
					:class="uppercase ? 'bg-cyan-600/50 text-white border-cyan-400/60' : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/15'"
				>
					⇧ Maj
				</button>
				<button
					type="button"
					@click="layout = layout === 'azerty' ? 'qwerty' : 'azerty'"
					class="rounded border border-white/15 bg-white/5 px-2 py-0.5 font-medium uppercase text-slate-300 hover:bg-white/15 cursor-pointer active:cursor-grabbing"
				>
					{{ layout }}
				</button>
				<button
					type="button"
					data-close-keyboard
					@click="emit('close')"
					aria-label="Fermer le clavier virtuel"
					class="rounded-lg border border-red-500/30 bg-red-950/30 px-2 py-0.5 font-medium text-red-300 hover:bg-red-900/50 hover:text-white cursor-pointer active:cursor-grabbing"
				>
					✕
				</button>
			</div>
		</div>

		<div class="space-y-1.5">
			<div
				v-for="(row, rowIndex) in rows"
				:key="rowIndex"
				class="grid grid-cols-10 gap-1.5"
			>
				<button
					v-for="key in row"
					:key="key"
					type="button"
					:disabled="disabled"
					:data-key="key"
					@click="send(key)"
					class="rounded-lg border border-white/10 bg-slate-900/30 py-2 font-mono text-sm font-semibold text-white/95 shadow-sm transition-all hover:border-cyan-400/60 hover:bg-cyan-950/40 active:bg-cyan-500/50 disabled:opacity-30 cursor-pointer active:cursor-grabbing"
				>
					{{ key }}
				</button>
			</div>

			<div class="grid grid-cols-4 gap-1.5 pt-0.5 sm:grid-cols-8">
				<button
					v-for="special in specialKeys"
					:key="special.value"
					type="button"
					:disabled="disabled"
					:data-key="special.value"
					@click="send(special.value)"
					class="rounded-lg border border-white/10 bg-slate-800/30 px-2 py-1.5 text-xs font-medium text-slate-200/90 shadow-sm transition-all hover:border-cyan-400/60 hover:bg-cyan-950/40 active:bg-cyan-500/50 disabled:opacity-30 cursor-pointer active:cursor-grabbing"
				>
					{{ special.label }}
				</button>
			</div>
		</div>
	</section>
</template>
