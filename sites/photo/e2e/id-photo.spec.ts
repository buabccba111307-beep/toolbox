import { test, expect } from '@playwright/test';
import { createSamplePng, readPngSize } from '../test/fixtures/sample-photo';

// 빌드된 정적 산출물을 대상으로 검증합니다.
// "코드를 작성했다" 가 아니라 "배포될 결과물이 실제로 동작한다" 를 증명하는 게 목적입니다.
// 여권사진 프리셋(35x45mm, 300dpi) 목표 픽셀 크기는 src/lib/id-photo.test.ts 에서
// 이미 413x531 로 검증되어 있으므로, 여기서는 다운로드된 파일이 그 크기와 실제로
// 일치하는지를 PNG 헤더를 직접 읽어 확인합니다.
const PASSPORT_TARGET = { width: 413, height: 531 };

test.describe('증명사진 규격 맞추기', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/id-photo/');
  });

  test('페이지가 제목과 함께 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('증명사진 규격 맞추기');
  });

  test('canonical 링크가 설정되어 있다', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/tools\/id-photo\/$/);
  });

  test('사진을 업로드하면 미리보기 캔버스가 여권 규격 픽셀 크기로 맞춰진다', async ({ page }) => {
    const png = createSamplePng(800, 1000);
    await page.getByLabel('사진 업로드 (JPEG/PNG)').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: png,
    });

    const canvas = page.locator('#preview-canvas');
    await expect(async () => {
      expect(await canvas.getAttribute('width')).toBe(String(PASSPORT_TARGET.width));
      expect(await canvas.getAttribute('height')).toBe(String(PASSPORT_TARGET.height));
    }).toPass();

    await expect(page.getByRole('button', { name: 'PNG 로 다운로드' })).toBeEnabled();
  });

  test('다운로드한 PNG 파일의 픽셀 크기가 여권 규격과 일치한다', async ({ page }) => {
    const png = createSamplePng(800, 1000);
    await page.getByLabel('사진 업로드 (JPEG/PNG)').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: png,
    });

    await expect(page.getByRole('button', { name: 'PNG 로 다운로드' })).toBeEnabled();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'PNG 로 다운로드' }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const fileBuffer = Buffer.concat(chunks);
    const size = readPngSize(fileBuffer);

    expect(size).toEqual(PASSPORT_TARGET);
  });

  test('규격을 이력서 사진으로 바꾸면 다운로드 크기도 바뀐다', async ({ page }) => {
    const png = createSamplePng(800, 1000);
    await page.getByLabel('사진 업로드 (JPEG/PNG)').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: png,
    });
    await page.getByLabel('규격').selectOption('resume');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'PNG 로 다운로드' }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const size = readPngSize(Buffer.concat(chunks));

    expect(size).toEqual({ width: 354, height: 472 });
  });

  test('원본보다 넓게 자르려는 zoom 값(1 미만)은 에러 메시지를 보여준다', async ({ page }) => {
    const png = createSamplePng(800, 1000);
    await page.getByLabel('사진 업로드 (JPEG/PNG)').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: png,
    });

    await page.getByLabel('확대 배율 (1 이상)').fill('0.5');
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expect(page.getByRole('button', { name: 'PNG 로 다운로드' })).toBeDisabled();
  });
});
