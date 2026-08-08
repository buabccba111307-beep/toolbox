import { test, expect, type Page } from '@playwright/test';
import { createSamplePng, readPngSize } from '../test/fixtures/sample-photo';

// 빌드된 정적 산출물을 대상으로 검증합니다.
// "코드를 작성했다" 가 아니라 "배포될 결과물이 실제로 동작한다" 를 증명하는 게 목적입니다.
//
// 다운로드된 PNG 를 직접 바이트 단위로 파싱하는 대신, 브라우저 자체의 신뢰할 수 있는
// PNG 디코더(Image + Canvas)를 빌려 픽셀을 읽습니다. 워터마크 위치 근방 사각형 안에서
// 픽셀별로 원본과 색이 뚜렷이 달라진 비율을 계산해, 평균색만 비교할 때 텍스트 글자
// 사이 여백 때문에 신호가 희석되는 문제 없이 "그 자리에 뭔가 그려졌다" 를 검증합니다.

const WIDTH = 800;
const HEIGHT = 1000;
const SAMPLE_PNG = createSamplePng(WIDTH, HEIGHT);

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 기본 옵션(position=bottom-right, marginRatio=0.05, fontSizeRatio=0.05)에서
// 텍스트가 그려질 것으로 예상되는 영역을 감싸는 사각형.
const WATERMARK_BOX: Box = { x: 540, y: 910, w: 230, h: 60 };
// 워터마크가 그려지지 않는, 이미지 좌측 상단 구석.
const UNTOUCHED_BOX: Box = { x: 20, y: 20, w: 100, h: 100 };

// box 안에서 두 PNG(base64) 사이에 픽셀별 색상 차이가 뚜렷한(> 30) 지점의 비율을 계산합니다.
async function changedPixelFraction(page: Page, base64Before: string, base64After: string, box: Box): Promise<number> {
  return page.evaluate(
    async ({ base64Before, base64After, box }) => {
      const decode = async (base64: string): Promise<Uint8ClampedArray> => {
        const img = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
        });
        img.src = `data:image/png;base64,${base64}`;
        await loaded;

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(box.x, box.y, box.w, box.h).data;
      };

      const before = await decode(base64Before);
      const after = await decode(base64After);

      let changed = 0;
      const total = box.w * box.h;
      for (let i = 0; i < before.length; i += 4) {
        const diff =
          Math.abs(before[i]! - after[i]!) + Math.abs(before[i + 1]! - after[i + 1]!) + Math.abs(before[i + 2]! - after[i + 2]!);
        if (diff > 30) changed++;
      }
      return changed / total;
    },
    { base64Before, base64After, box }
  );
}

async function downloadBuffer(page: Page, triggerDownload: () => Promise<void>): Promise<Buffer> {
  const [download] = await Promise.all([page.waitForEvent('download'), triggerDownload()]);
  const downloadedPath = await download.path();
  expect(downloadedPath).not.toBeNull();
  const fs = await import('node:fs');
  return fs.readFileSync(downloadedPath!);
}

test.describe('사진 워터마크 추가', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/watermark/');
  });

  test('페이지가 제목과 함께 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('사진 워터마크 추가');
  });

  test('canonical 링크가 설정되어 있다', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/tools\/watermark\/$/);
  });

  test('사진을 업로드하면 미리보기 캔버스가 원본 픽셀 크기로 맞춰지고 다운로드 버튼이 켜진다', async ({
    page,
  }) => {
    await page.getByLabel('사진 업로드 (JPEG/PNG)').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: SAMPLE_PNG,
    });

    const canvas = page.locator('#preview-canvas');
    await expect(async () => {
      expect(await canvas.getAttribute('width')).toBe(String(WIDTH));
      expect(await canvas.getAttribute('height')).toBe(String(HEIGHT));
    }).toPass();

    await expect(page.getByRole('button', { name: 'PNG 로 다운로드' })).toBeEnabled();
    await expect(page.locator('#watermark-error')).toBeEmpty();
  });

  test('워터마크 텍스트를 비우면 에러가 뜨고 다운로드 버튼이 꺼진다', async ({ page }) => {
    await page.getByLabel('사진 업로드 (JPEG/PNG)').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: SAMPLE_PNG,
    });
    await expect(page.getByRole('button', { name: 'PNG 로 다운로드' })).toBeEnabled();

    await page.getByLabel('워터마크 텍스트').fill('   ');

    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expect(page.getByRole('button', { name: 'PNG 로 다운로드' })).toBeDisabled();
  });

  test('불투명도가 0~1 범위를 벗어나면 에러가 뜨고 다운로드 버튼이 꺼진다', async ({ page }) => {
    await page.getByLabel('사진 업로드 (JPEG/PNG)').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: SAMPLE_PNG,
    });
    await expect(page.getByRole('button', { name: 'PNG 로 다운로드' })).toBeEnabled();

    await page.getByLabel('불투명도 (0~1)').fill('1.5');

    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expect(page.getByRole('button', { name: 'PNG 로 다운로드' })).toBeDisabled();
  });

  test('다운로드한 PNG 의 픽셀 크기는 원본과 같고, 워터마크 위치 색상은 원본과 달라진다', async ({
    page,
  }) => {
    await page.getByLabel('사진 업로드 (JPEG/PNG)').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: SAMPLE_PNG,
    });
    await expect(page.getByRole('button', { name: 'PNG 로 다운로드' })).toBeEnabled();

    const downloaded = await downloadBuffer(page, async () => {
      await page.getByRole('button', { name: 'PNG 로 다운로드' }).click();
    });

    expect(readPngSize(downloaded)).toEqual({ width: WIDTH, height: HEIGHT });

    const originalBase64 = SAMPLE_PNG.toString('base64');
    const downloadedBase64 = downloaded.toString('base64');

    const watermarkChangedFraction = await changedPixelFraction(page, originalBase64, downloadedBase64, WATERMARK_BOX);
    expect(watermarkChangedFraction).toBeGreaterThan(0.05);

    const untouchedChangedFraction = await changedPixelFraction(page, originalBase64, downloadedBase64, UNTOUCHED_BOX);
    expect(untouchedChangedFraction).toBeLessThan(0.02);
  });

  test('위치를 중앙으로 바꾸면 좌측 상단 구석은 그대로, 다운로드는 계속 동작한다', async ({ page }) => {
    await page.getByLabel('사진 업로드 (JPEG/PNG)').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: SAMPLE_PNG,
    });
    await page.getByLabel('위치').selectOption('center');
    await expect(page.getByRole('button', { name: 'PNG 로 다운로드' })).toBeEnabled();

    const downloaded = await downloadBuffer(page, async () => {
      await page.getByRole('button', { name: 'PNG 로 다운로드' }).click();
    });

    expect(readPngSize(downloaded)).toEqual({ width: WIDTH, height: HEIGHT });

    const untouchedChangedFraction = await changedPixelFraction(
      page,
      SAMPLE_PNG.toString('base64'),
      downloaded.toString('base64'),
      UNTOUCHED_BOX
    );
    expect(untouchedChangedFraction).toBeLessThan(0.02);
  });
});
