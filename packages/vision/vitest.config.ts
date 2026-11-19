import { defineSharedVitestConfig } from '@nlabrazi/config-vitest'

export default defineSharedVitestConfig({
  rootDir: import.meta.url,
  include: ['src/**/*.test.ts'],
  coverage: {
    include: ['src/**/*.ts'],
    thresholds: {
      lines: 90,
    },
  },
})
