import { test, expect } from '@playwright/test';

// 빌드된 정적 산출물을 대상으로 검증합니다.

test.describe('cron 표현식 설명기', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/cron-describe/');
  });

  test('페이지가 제목과 함께 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('cron 표현식 설명기');
  });

  test('기본값이 로드되면 바로 설명 문장이 표시된다', async ({ page }) => {
    await expect(page.locator('#result')).toHaveText('월요일부터 금요일까지, 매일 오전 9시 0분에 실행');
  });

  test('입력을 바꾸면 설명 문장이 갱신된다', async ({ page }) => {
    await page.getByLabel('cron 표현식 (분 시 일 월 요일)').fill('*/15 * * * *');
    await expect(page.locator('#result')).toHaveText('매일 15분마다 실행');
  });

  test('잘못된 입력은 에러 메시지를 보여준다', async ({ page }) => {
    const input = page.getByLabel('cron 표현식 (분 시 일 월 요일)');
    await input.fill('a b c d e');
    const result = page.locator('#result');
    await expect(result).toHaveClass(/error/);
    await expect(result).not.toHaveText('');
  });

  test('필드 개수가 5개가 아니면 에러 메시지를 보여준다', async ({ page }) => {
    const input = page.getByLabel('cron 표현식 (분 시 일 월 요일)');
    await input.fill('0 9 * *');
    await expect(page.locator('#result')).toHaveClass(/error/);
  });

  test('canonical 링크가 설정되어 있다', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/tools\/cron-describe\/$/);
  });
});
