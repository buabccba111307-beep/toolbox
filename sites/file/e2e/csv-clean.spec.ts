import { test, expect } from '@playwright/test';
import { createSampleCsv } from '../test/fixtures/sample-csv';

// 빌드된 정적 산출물을 대상으로 검증합니다.
// "코드를 작성했다" 가 아니라 "배포될 결과물이 실제로 동작한다" 를 증명하는 게 목적입니다.

test.describe('CSV 중복 행 정리', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/csv-clean/');
  });

  test('페이지가 제목과 함께 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('CSV 중복 행 정리');
  });

  test('CSV 파일을 올리고 정리하면 중복·빈 행이 제거된 결과가 표시된다', async ({ page }) => {
    await page.getByLabel('CSV 파일 선택').setInputFiles({
      name: 'sample.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(createSampleCsv(), 'utf-8'),
    });

    await expect(page.getByLabel('또는 CSV 텍스트를 직접 붙여넣기')).not.toBeEmpty();

    await page.getByRole('button', { name: '정리하기' }).click();

    await expect(page.locator('#error')).toBeEmpty();
    await expect(page.locator('#status')).toContainText('총 4행');
    await expect(page.locator('#status')).toContainText('빈 행 1개');
    await expect(page.locator('#status')).toContainText('중복 행 1개');

    const table = page.locator('#preview-table');
    await expect(table.locator('thead th')).toHaveText(['이름', '이메일']);
    await expect(table.locator('tbody tr')).toHaveCount(3);
    await expect(table.locator('tbody tr').nth(1).locator('td').first()).toHaveText('김철수');
  });

  test('정리하기를 누르면 다운로드된 CSV 내용이 기대대로다', async ({ page }) => {
    await page.getByLabel('CSV 파일 선택').setInputFiles({
      name: 'sample.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(createSampleCsv(), 'utf-8'),
    });
    await page.getByRole('button', { name: '정리하기' }).click();
    await expect(page.locator('#status')).toContainText('총 4행');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV 다운로드' }).click(),
    ]);

    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();

    const fs = await import('node:fs');
    const content = fs.readFileSync(downloadedPath!, 'utf-8');

    expect(content).toBe(
      '이름,이메일\r\n홍길동,hong@example.com\r\n김철수,kim@example.com\r\n이영희,lee@example.com'
    );
  });

  test('공백/중복/빈 행 제거 옵션을 모두 끄면 원본 행 수가 그대로 유지된다', async ({ page }) => {
    await page.getByLabel('CSV 파일 선택').setInputFiles({
      name: 'sample.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(createSampleCsv(), 'utf-8'),
    });

    await page.getByLabel('앞뒤 공백 제거').uncheck();
    await page.getByLabel('빈 행 제거').uncheck();
    await page.getByLabel('중복 행 제거').uncheck();

    await page.getByRole('button', { name: '정리하기' }).click();

    await expect(page.locator('#status')).toContainText('총 6행');
    await expect(page.locator('#preview-table').locator('tbody tr')).toHaveCount(5);
  });

  test('빈 CSV 텍스트를 정리하려 하면 에러 메시지가 뜬다', async ({ page }) => {
    await page.getByRole('button', { name: '정리하기' }).click();
    await expect(page.getByRole('alert')).not.toBeEmpty();
  });

  test('canonical 링크가 설정되어 있다', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/tools\/csv-clean\/$/);
  });
});
