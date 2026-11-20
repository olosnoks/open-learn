import { defineConfig } from '@playwright/test';

// PORT lets parallel runs use separate dev servers, e.g. `$env:PORT='5174'; npx playwright test`.
const port = Number(process.env.PORT ?? 5173);

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
