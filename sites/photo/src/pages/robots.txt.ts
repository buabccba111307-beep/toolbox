import type { APIRoute } from 'astro';

// robots.txt 를 라우트로 생성한다.
// sitemap 주소에 실제 배포 도메인이 들어가야 해서 정적 파일로 두면 안 된다.
export const GET: APIRoute = ({ site }) => {
  const sitemapUrl = new URL('sitemap-index.xml', site).href;

  return new Response(
    `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
};
