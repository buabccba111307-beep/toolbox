import { defineConfig, devices } from '@playwright/test';

// 사이트마다 포트를 다르게 둬서 모노레포에서 동시에 e2e 를 돌릴 수 있게 한다.
const PORT = 4321;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: process.env['CI'] ? [['html'], ['list']] : 'list',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // dev 서버가 아니라 빌드 산출물을 검증한다.
  //
  // reuseExistingServer 는 false 로 둔다. true 로 두면 예전에 띄워둔 프리뷰 서버가
  // 살아 있을 때 그 낡은 산출물을 그대로 검사한다. 실제로 몇 시간 전 빌드를 검사해
  // SEO 테스트가 거짓 통과한 적이 있다. 매번 새로 빌드하는 10초가 훨씬 싸다.
  webServer: {
    command: `npm run build && node ../../scripts/serve-dist.mjs --dir dist --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
