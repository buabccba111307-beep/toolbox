import { test, expect } from '@playwright/test';

// 빌드된 정적 산출물을 대상으로 검증합니다.
// "코드를 작성했다" 가 아니라 "배포될 결과물이 실제로 동작한다" 를 증명하는 게 목적입니다.
//
// 실제 카메라로 찍은 JPEG 를 리포지토리에 바이너리로 커밋하는 대신,
// src/lib/exif-strip.test.ts 와 같은 방식으로 GPS EXIF 를 포함한 최소 JPEG 바이트열을
// 테스트 실행 시점에 직접 조립합니다 (Playwright 의 setInputFiles 는 버퍼를 직접 받습니다).

class TiffBuilder {
  private buf: number[] = [];

  get length(): number {
    return this.buf.length;
  }

  u8(v: number): void {
    this.buf.push(v & 0xff);
  }

  u16(v: number): void {
    this.u8(v);
    this.u8(v >> 8);
  }

  u32(v: number): void {
    this.u8(v);
    this.u8(v >> 8);
    this.u8(v >> 16);
    this.u8(v >> 24);
  }

  ascii(s: string): void {
    for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i));
  }

  reserveU32(): number {
    const pos = this.buf.length;
    this.u32(0);
    return pos;
  }

  patchU32(pos: number, value: number): void {
    this.buf[pos] = value & 0xff;
    this.buf[pos + 1] = (value >> 8) & 0xff;
    this.buf[pos + 2] = (value >> 16) & 0xff;
    this.buf[pos + 3] = (value >> 24) & 0xff;
  }

  toBuffer(): Buffer {
    return Buffer.from(this.buf);
  }
}

const MAKE_STR = 'TestCam\0';
const MODEL_STR = 'ModelX\0';
const DATETIME_STR = '2024:01:02 03:04:05\0';

function buildTiffWithGps(): Buffer {
  const w = new TiffBuilder();
  w.u8(0x49);
  w.u8(0x49); // 'II' little endian
  w.u16(42);
  w.u32(8);

  w.u16(4); // IFD0 entry 개수

  w.u16(0x010f); // Make
  w.u16(2);
  w.u32(MAKE_STR.length);
  const makeOffsetPos = w.reserveU32();

  w.u16(0x0110); // Model
  w.u16(2);
  w.u32(MODEL_STR.length);
  const modelOffsetPos = w.reserveU32();

  w.u16(0x0132); // DateTime
  w.u16(2);
  w.u32(DATETIME_STR.length);
  const dtOffsetPos = w.reserveU32();

  w.u16(0x8825); // GPSInfo IFD pointer
  w.u16(4);
  w.u32(1);
  const gpsPtrPos = w.reserveU32();

  w.u32(0); // next IFD offset

  const makeOffset = w.length;
  w.ascii(MAKE_STR);
  const modelOffset = w.length;
  w.ascii(MODEL_STR);
  const dtOffset = w.length;
  w.ascii(DATETIME_STR);

  w.patchU32(makeOffsetPos, makeOffset);
  w.patchU32(modelOffsetPos, modelOffset);
  w.patchU32(dtOffsetPos, dtOffset);

  const gpsIfdOffset = w.length;
  w.u16(4);

  w.u16(1); // GPSLatitudeRef
  w.u16(2);
  w.u32(2);
  w.u8(0x4e); // 'N'
  w.u8(0x00);
  w.u8(0x00);
  w.u8(0x00);

  w.u16(2); // GPSLatitude
  w.u16(5);
  w.u32(3);
  const latPatch = w.reserveU32();

  w.u16(3); // GPSLongitudeRef
  w.u16(2);
  w.u32(2);
  w.u8(0x45); // 'E'
  w.u8(0x00);
  w.u8(0x00);
  w.u8(0x00);

  w.u16(4); // GPSLongitude
  w.u16(5);
  w.u32(3);
  const lonPatch = w.reserveU32();

  w.u32(0);

  const latOffset = w.length;
  w.u32(37);
  w.u32(1);
  w.u32(33);
  w.u32(1);
  w.u32(0);
  w.u32(1);
  w.patchU32(latPatch, latOffset);

  const lonOffset = w.length;
  w.u32(126);
  w.u32(1);
  w.u32(58);
  w.u32(1);
  w.u32(0);
  w.u32(1);
  w.patchU32(lonPatch, lonOffset);

  w.patchU32(gpsPtrPos, gpsIfdOffset);

  return w.toBuffer();
}

function wrapJpeg(tiff: Buffer | null): Buffer {
  const parts: number[] = [0xff, 0xd8]; // SOI

  if (tiff) {
    const sig = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
    const app1Data = Buffer.concat([Buffer.from(sig), tiff]);
    const length = app1Data.length + 2;
    parts.push(0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...app1Data);
  }

  // SOS + 임의의 짧은 엔트로피 데이터 + EOI. 우리 파서는 SOS 를 만나면 내부를
  // 해석하지 않고 그대로 복사하므로 실제 픽셀 데이터가 아니어도 됩니다.
  parts.push(0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xd2, 0xcf, 0x20, 0xff, 0xd9);

  return Buffer.from(parts);
}

const JPEG_WITH_GPS = wrapJpeg(buildTiffWithGps());
const JPEG_WITHOUT_EXIF = wrapJpeg(null);

test.describe('사진 GPS/EXIF 제거', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/exif-strip/');
  });

  test('페이지가 제목과 함께 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('사진 GPS/EXIF 제거');
  });

  test('GPS EXIF 가 있는 JPEG 를 올리면 경고와 요약이 뜬다', async ({ page }) => {
    await page.getByLabel('JPEG 파일 선택').setInputFiles({
      name: 'sample-with-gps.jpg',
      mimeType: 'image/jpeg',
      buffer: JPEG_WITH_GPS,
    });

    await expect(page.locator('#error')).toBeEmpty();
    await expect(page.locator('#gps-warning')).toBeVisible();
    await expect(page.locator('#summary-list')).toContainText('TestCam');
    await expect(page.locator('#summary-list')).toContainText('37.');
    await expect(page.getByRole('button', { name: '메타데이터 제거하고 다운로드' })).toBeVisible();
  });

  test('메타데이터 제거 버튼을 누르면 EXIF 가 없는 파일이 다운로드된다', async ({ page }) => {
    await page.getByLabel('JPEG 파일 선택').setInputFiles({
      name: 'sample-with-gps.jpg',
      mimeType: 'image/jpeg',
      buffer: JPEG_WITH_GPS,
    });
    await expect(page.locator('#gps-warning')).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '메타데이터 제거하고 다운로드' }).click(),
    ]);

    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();

    const fs = await import('node:fs');
    const stripped = fs.readFileSync(downloadedPath!);

    expect(stripped.byteLength).toBeLessThan(JPEG_WITH_GPS.byteLength);

    const strippedText = stripped.toString('latin1');
    expect(strippedText.includes('Exif')).toBe(false);
    expect(strippedText.includes('TestCam')).toBe(false);
  });

  test('EXIF 가 없는 JPEG 를 올리면 GPS 경고 없이 "없음" 으로 표시된다', async ({ page }) => {
    await page.getByLabel('JPEG 파일 선택').setInputFiles({
      name: 'no-exif.jpg',
      mimeType: 'image/jpeg',
      buffer: JPEG_WITHOUT_EXIF,
    });

    await expect(page.locator('#summary-list')).toContainText('없음');
    await expect(page.locator('#gps-warning')).toBeHidden();
  });

  test('canonical 링크가 설정되어 있다', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/tools\/exif-strip\/$/);
  });
});
