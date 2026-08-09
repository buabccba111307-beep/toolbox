// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 배포 URL. canonical, og:url, sitemap, robots.txt 가 전부 이 값을 쓴다.
//
// 주의: 기본값을 localhost 로 두면 안 된다. Cloudflare Workers 배포에는
// CF_PAGES_URL(Pages 전용)이 없어서 localhost 가 그대로 나갔고,
// canonical 이 http://localhost:4321 을 가리켜 색인이 거부될 뻔했다.
//
// 커스텀 도메인을 붙이면 Cloudflare 빌드 환경변수에 SITE_URL 을 넣어 덮어쓴다.
const site = process.env.SITE_URL ?? 'https://dev-tools.buabccba111307.workers.dev';

export default defineConfig({
  site,
  build: { format: 'directory' },
  integrations: [sitemap()],
});
