import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const chrome = existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined;
const deployed = process.env.DEPLOYED_BASE_URL;
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: deployed || 'http://localhost:5174',
    launchOptions: chrome ? { executablePath: chrome } : {},
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: deployed ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5174/api/config',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { WEB_PORT: '5174', API_PORT: '8788', LLM_BASE_URL: '', LLM_MODEL: '', LLM_API_KEY: '', LLM_ALLOW_NO_KEY: 'false' },
  },
});
