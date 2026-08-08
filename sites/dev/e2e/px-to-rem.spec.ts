import { test, expect } from '@playwright/test';

// 빌드된 정적 산출물을 대상으로 검증합니다.
// "코드를 작성했다" 가 아니라 "배포될 결과물이 실제로 동작한다" 를 증명하는 게 목적입니다.

test.describe('px ↔ rem 변환기', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/px-to-rem/');
  });

  test('페이지가 제목과 함께 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('px ↔ rem 변환기');
  });

  test('px 를 입력하면 rem 이 계산된다', async ({ page }) => {
    await page.getByLabel('px', { exact: true }).fill('24');
    await expect(page.getByLabel('rem', { exact: true })).toHaveValue('1.5');
  });

  test('rem 을 입력하면 px 이 계산된다', async ({ page }) => {
    await page.getByLabel('rem', { exact: true }).fill('2');
    await expect(page.getByLabel('px', { exact: true })).toHaveValue('32');
  });

  test('root 를 바꾸면 결과가 다시 계산된다', async ({ page }) => {
    await page.getByLabel('px', { exact: true }).fill('20');
    await page.getByLabel('root 폰트 크기 (px)').fill('10');
    await expect(page.getByLabel('rem', { exact: true })).toHaveValue('2');
  });

  test('px 를 비우면 rem 도 비워진다', async ({ page }) => {
    await page.getByLabel('px', { exact: true }).fill('');
    await expect(page.getByLabel('rem', { exact: true })).toHaveValue('');
  });

  test('canonical 링크가 설정되어 있다', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/tools\/px-to-rem\/$/);
  });
});
