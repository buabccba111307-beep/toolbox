import { test, expect } from '@playwright/test';
import { createSampleWebm } from '../test/fixtures/sample-video';

function countGifFrames(buf: Buffer): number {
  const packed = buf[10]!;
  const gctFlag = (packed >> 7) & 1;
  const gctSize = gctFlag ? 2 ** ((packed & 0b111) + 1) * 3 : 0;
  let pos = 13 + gctSize;
  let frames = 0;

  while (pos < buf.length) {
    const introducer = buf[pos];
    if (introducer === 0x21) {
      pos += 2;
      for (;;) {
        const size = buf[pos]!;
        pos += 1;
        if (size === 0) break;
        pos += size;
      }
    } else if (introducer === 0x2c) {
      frames++;
      pos += 1 + 8;
      const localFlags = buf[pos]!;
      pos += 1;
      if (localFlags & 0x80) {
        pos += 2 ** ((localFlags & 0b111) + 1) * 3;
      }
      pos += 1;
      for (;;) {
        const size = buf[pos]!;
        pos += 1;
        if (size === 0) break;
        pos += size;
      }
    } else {
      break;
    }
  }

  return frames;
}

test.describe('동영상 GIF 변환', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/video-to-gif/');
  });

  test('페이지가 제목과 함께 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('동영상 GIF 변환');
  });

  test('canonical 링크가 설정되어 있다', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/tools\/video-to-gif\/$/);
  });

  test('동영상을 업로드하면 길이/크기 정보가 표시되고 변환 버튼이 켜진다', async ({ page }) => {
    const webm = await createSampleWebm(page, { width: 160, height: 90, durationMs: 1200 });

    await page.getByLabel('동영상 업로드 (mp4/webm 등)').setInputFiles({
      name: 'sample.webm',
      mimeType: 'video/webm',
      buffer: webm,
    });

    await expect(page.locator('#video-meta')).not.toBeEmpty({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'GIF 만들기' })).toBeEnabled();
  });

  test('구간·fps·최대 가로폭을 지정해 변환하면 유효한 GIF 가 다운로드된다', async ({ page }) => {
    const webm = await createSampleWebm(page, { width: 160, height: 90, durationMs: 1200 });

    await page.getByLabel('동영상 업로드 (mp4/webm 등)').setInputFiles({
      name: 'sample.webm',
      mimeType: 'video/webm',
      buffer: webm,
    });
    await expect(page.getByRole('button', { name: 'GIF 만들기' })).toBeEnabled({ timeout: 10_000 });

    await page.getByLabel('시작 시각 (초)').fill('0');
    await page.getByLabel('끝 시각 (초)').fill('1');
    await page.getByLabel('fps (초당 프레임 수, 최대 30)').fill('5');
    await page.getByLabel('출력 최대 가로 픽셀').fill('80');

    await page.getByRole('button', { name: 'GIF 만들기' }).click();

    const downloadLink = page.getByRole('link', { name: 'GIF 다운로드' });
    await expect(downloadLink).toBeVisible({ timeout: 30_000 });

    const [download] = await Promise.all([page.waitForEvent('download'), downloadLink.click()]);
    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();

    const fs = await import('node:fs');
    const buffer = fs.readFileSync(downloadedPath!);

    expect(buffer.subarray(0, 6).toString('ascii')).toBe('GIF89a');
    expect(buffer[buffer.length - 1]).toBe(0x3b);

    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    expect(width).toBeLessThanOrEqual(80);
    expect(height).toBeGreaterThan(0);

    expect(countGifFrames(buffer)).toBeGreaterThanOrEqual(1);
  });

  test('시작 시각이 끝 시각보다 크면 에러가 뜨고 다운로드 링크가 뜨지 않는다', async ({ page }) => {
    const webm = await createSampleWebm(page, { width: 160, height: 90, durationMs: 1200 });

    await page.getByLabel('동영상 업로드 (mp4/webm 등)').setInputFiles({
      name: 'sample.webm',
      mimeType: 'video/webm',
      buffer: webm,
    });
    await expect(page.getByRole('button', { name: 'GIF 만들기' })).toBeEnabled({ timeout: 10_000 });

    await page.getByLabel('시작 시각 (초)').fill('1');
    await page.getByLabel('끝 시각 (초)').fill('0.5');

    await page.getByRole('button', { name: 'GIF 만들기' }).click();

    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expect(page.getByRole('link', { name: 'GIF 다운로드' })).toBeHidden();
  });
});
