import { test, expect } from '@playwright/test';
import { createSampleWav, readWavDurationSec } from '../test/fixtures/sample-audio';

// 빌드된 정적 산출물을 대상으로 검증합니다.
// "코드를 작성했다" 가 아니라 "배포될 결과물이 실제로 동작한다" 를 증명하는 게 목적입니다.

test.describe('오디오 자르기', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/audio-trim/');
  });

  test('페이지가 제목과 함께 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('오디오 자르기');
  });

  test('canonical 링크가 설정되어 있다', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/tools\/audio-trim\/$/);
  });

  test('오디오를 업로드하면 길이 정보와 구간 입력이 나타난다', async ({ page }) => {
    const wav = createSampleWav(3);
    await page.getByLabel('오디오 파일 선택').setInputFiles({
      name: 'sample.wav',
      mimeType: 'audio/wav',
      buffer: wav,
    });

    await expect(page.locator('#duration-info')).toContainText('3.00초');
    await expect(page.getByLabel('시작 시각 (초)')).toBeVisible();
    await expect(page.getByLabel('끝 시각 (초)')).toBeVisible();
    await expect(page.getByRole('button', { name: '자르기 & WAV 다운로드' })).toBeVisible();
  });

  test('구간을 지정해 자르면 지정한 길이만큼의 WAV 파일이 다운로드된다', async ({ page }) => {
    const wav = createSampleWav(3);
    await page.getByLabel('오디오 파일 선택').setInputFiles({
      name: 'sample.wav',
      mimeType: 'audio/wav',
      buffer: wav,
    });
    await expect(page.locator('#duration-info')).toContainText('3.00초');

    await page.getByLabel('시작 시각 (초)').fill('1');
    await page.getByLabel('끝 시각 (초)').fill('2');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '자르기 & WAV 다운로드' }).click(),
    ]);

    expect(download.suggestedFilename()).toBe('sample-trimmed.wav');

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const fileBuffer = Buffer.concat(chunks);

    expect(fileBuffer.toString('ascii', 0, 4)).toBe('RIFF');
    expect(fileBuffer.toString('ascii', 8, 12)).toBe('WAVE');

    const durationSec = readWavDurationSec(fileBuffer);
    expect(durationSec).toBeCloseTo(1, 1);
  });

  test('끝 시각이 전체 길이를 초과해도 clamp 되어 끝까지 잘린다', async ({ page }) => {
    const wav = createSampleWav(2);
    await page.getByLabel('오디오 파일 선택').setInputFiles({
      name: 'sample.wav',
      mimeType: 'audio/wav',
      buffer: wav,
    });
    await expect(page.locator('#duration-info')).toContainText('2.00초');

    await page.getByLabel('시작 시각 (초)').fill('0');
    await page.getByLabel('끝 시각 (초)').fill('999');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '자르기 & WAV 다운로드' }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const durationSec = readWavDurationSec(Buffer.concat(chunks));
    expect(durationSec).toBeCloseTo(2, 1);
  });

  test('시작 시각이 끝 시각보다 크거나 같으면 에러 메시지를 보여준다', async ({ page }) => {
    const wav = createSampleWav(3);
    await page.getByLabel('오디오 파일 선택').setInputFiles({
      name: 'sample.wav',
      mimeType: 'audio/wav',
      buffer: wav,
    });
    await expect(page.locator('#duration-info')).toContainText('3.00초');

    await page.getByLabel('시작 시각 (초)').fill('2');
    await page.getByLabel('끝 시각 (초)').fill('1');
    await page.getByRole('button', { name: '자르기 & WAV 다운로드' }).click();

    await expect(page.getByRole('alert')).not.toBeEmpty();
  });
});
