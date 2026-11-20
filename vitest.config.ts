import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so unit tests don't boot workerd, and so the
// Playwright spec in tests/e2e isn't picked up by Vitest.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'] },
});
