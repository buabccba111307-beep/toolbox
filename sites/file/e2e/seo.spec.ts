import { test, expect } from '@playwright/test';

// SEO 기본 요소 회귀 방지.
//
// 실제로 겪은 사고: astro.config 의 site 기본값이 localhost 였는데
// Cloudflare Workers 배포에는 CF_PAGES_URL 이 없어서 그 값이 그대로 나갔다.
// canonical 이 http://localhost:4321 을 가리키는 채로 배포됐고,
// 사람이 눈으로 확인하지 않았으면 색인이 거부될 때까지 몰랐을 것이다.
//
// 빌드 산출물을 검사하므로 로컬에서 돌려도 배포될 값을 그대로 본다.

test.describe('SEO 기본 요소', () => {
  // 플레이스홀더로 남으면 안 되는 값들.
  // example.com 은 최초 설정 그대로라는 뜻이고, localhost 는 배포 URL 이 안 잡힌 것이다.
  // 둘 다 실제로 배포까지 흘러간 전례가 있다.
  const FORBIDDEN = ['localhost', 'example.com', '127.0.0.1'];

  test('canonical 이 실제 도메인을 가리킨다', async ({ page }) => {
    await page.goto('/');
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');

    expect(canonical, 'canonical 이 없습니다').toBeTruthy();
    for (const bad of FORBIDDEN) {
      expect(canonical, `canonical 이 ${bad} 를 가리킵니다`).not.toContain(bad);
    }
    expect(canonical).toMatch(/^https:\/\//);
  });

  test('robots.txt 의 sitemap 주소가 실제 도메인이다', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.status()).toBe(200);

    const body = await res.text();
    expect(body).toContain('Sitemap:');
    for (const bad of FORBIDDEN) {
      expect(body, `sitemap 주소가 ${bad} 입니다`).not.toContain(bad);
    }
  });

  test('sitemap 이 생성되어 있다', async ({ request }) => {
    const res = await request.get('/sitemap-index.xml');
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain('sitemap');
  });

  test('홈에 h1 이 하나만 있고 description 이 있다', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);

    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc, 'meta description 이 없습니다').toBeTruthy();
    expect(desc!.length).toBeGreaterThan(30);
  });

  test('구조화 데이터가 유효한 JSON 이고 url 이 실제 도메인이다', async ({ page }) => {
    await page.goto('/');
    const raw = await page.locator('script[type="application/ld+json"]').textContent();
    expect(raw).toBeTruthy();

    const data = JSON.parse(raw!);
    expect(data['@context']).toBe('https://schema.org');
    expect(String(data.url)).not.toContain('localhost');
  });
});
