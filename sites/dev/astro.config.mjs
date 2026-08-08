// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 배포 URL 은 환경변수로 받는다.
// Cloudflare Pages 는 CF_PAGES_URL 을 자동으로 넣어주므로,
// 커스텀 도메인을 붙이기 전까지는 별도 설정 없이도 canonical 과 sitemap 이 맞는다.
const site =
  process.env.SITE_URL ?? process.env.CF_PAGES_URL ?? 'http://localhost:4321';

export default defineConfig({
  site,
  build: { format: 'directory' },
  integrations: [sitemap()],
});
