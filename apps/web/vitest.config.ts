/**
 * vitest.config.ts
 * Vitest configuration for running utils/vehicleCost.test.ts and future unit tests.
 * Run: npx vitest  or  pnpm vitest
 */
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
