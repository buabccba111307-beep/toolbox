// @ts-check
import { defineConfig } from 'astro/config';

// site 는 배포 도메인이 정해지면 교체합니다.
// sitemap / canonical URL 생성에 쓰이므로 SEO 에 직접 영향이 있습니다.
export default defineConfig({
  site: 'https://example.com',
  build: {
    format: 'directory',
  },
  // 도구 사이트이므로 기본값(정적 출력 + 필요한 곳에만 JS)을 유지합니다.
});
