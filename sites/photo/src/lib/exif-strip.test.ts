import { describe, expect, it } from 'vitest';
import { ExifParseError, parseExif, stripExif } from './exif-strip';

/** TIFF/EXIF 바이트열을 순서대로 조립하기 위한 최소 빌더. */
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

  /** 자리만 예약해두고 나중에 patchU32 로 실제 값을 채웁니다. */
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

  toBytes(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

const MAKE_STR = 'TestCam\0';
const MODEL_STR = 'ModelX\0';
const DATETIME_STR = '2024:01:02 03:04:05\0';

/** 리틀 엔디안 TIFF/EXIF 블록을 만듭니다. Make/Model/DateTime 은 항상 포함합니다. */
function buildTiff(opts: { withGps?: boolean; corruptGps?: boolean } = {}): Uint8Array {
  const w = new TiffBuilder();

  w.u8(0x49);
  w.u8(0x49); // 'II' little endian
  w.u16(42); // TIFF magic
  w.u32(8); // IFD0 offset (헤더 바로 뒤)

  const hasGps = opts.withGps === true;
  const numEntries = hasGps ? 4 : 3;
  w.u16(numEntries);

  w.u16(0x010f); // Make
  w.u16(2); // ASCII
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

  let gpsPtrPos = -1;
  if (hasGps) {
    w.u16(0x8825); // GPSInfo IFD pointer
    w.u16(4); // LONG
    w.u32(1);
    gpsPtrPos = w.reserveU32();
  }

  w.u32(0); // next IFD offset (없음)

  const makeOffset = w.length;
  w.ascii(MAKE_STR);
  const modelOffset = w.length;
  w.ascii(MODEL_STR);
  const dtOffset = w.length;
  w.ascii(DATETIME_STR);

  w.patchU32(makeOffsetPos, makeOffset);
  w.patchU32(modelOffsetPos, modelOffset);
  w.patchU32(dtOffsetPos, dtOffset);

  if (hasGps) {
    const gpsIfdOffset = w.length;
    w.u16(4); // GPS IFD entry 개수

    // GPSLatitudeRef (tag 1, ASCII count 2) - inline
    w.u16(1);
    w.u16(2);
    w.u32(2);
    w.u8(0x4e); // 'N'
    w.u8(0x00);
    w.u8(0x00);
    w.u8(0x00);

    // GPSLatitude (tag 2, RATIONAL count 3) - offset 기반
    w.u16(2);
    w.u16(5);
    w.u32(3);
    const latPatch = w.reserveU32();

    // GPSLongitudeRef (tag 3, ASCII count 2) - inline
    w.u16(3);
    w.u16(2);
    w.u32(2);
    w.u8(0x45); // 'E'
    w.u8(0x00);
    w.u8(0x00);
    w.u8(0x00);

    // GPSLongitude (tag 4, RATIONAL count 3) - offset 기반
    w.u16(4);
    w.u16(5);
    w.u32(3);
    const lonPatch = w.reserveU32();

    w.u32(0); // next IFD offset

    const latOffset = w.length;
    if (opts.corruptGps) {
      w.u32(37);
      w.u32(0); // 분모 0 -> NaN (손상된 값)
      w.u32(33);
      w.u32(1);
      w.u32(0);
      w.u32(1);
    } else {
      w.u32(37);
      w.u32(1);
      w.u32(33);
      w.u32(1);
      w.u32(0);
      w.u32(1);
    }
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
  }

  return w.toBytes();
}

/** SOI + (선택) APP1 세그먼트들 + 최소 SOS/EOI 꼬리로 JPEG 바이트열을 만듭니다. */
function wrapJpeg(app1Payloads: Uint8Array[]): ArrayBuffer {
  const bytes: number[] = [0xff, 0xd8]; // SOI

  for (const payload of app1Payloads) {
    const length = payload.length + 2; // 길이 필드 자신을 포함
    bytes.push(0xff, 0xe1, (length >> 8) & 0xff, length & 0xff);
    bytes.push(...Array.from(payload));
  }

  // SOS(내용 없음) + 가짜 엔트로피 데이터 + EOI. stripExif/parseExif 는 SOS 를 만나면
  // 내부를 해석하지 않고 그대로 복사하므로 여기 내용은 임의여도 됩니다.
  bytes.push(0xff, 0xda, 0x00, 0x01, 0x02, 0xff, 0xd9);

  return new Uint8Array(bytes).buffer;
}

function exifApp1Payload(tiff: Uint8Array): Uint8Array {
  const sig = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
  return new Uint8Array([...sig, ...Array.from(tiff)]);
}

describe('parseExif', () => {
  it('EXIF 가 없는 정상 JPEG 는 hasExif: false 를 돌려준다', () => {
    const buffer = wrapJpeg([]);
    expect(parseExif(buffer)).toEqual({ hasExif: false, hasGps: false });
  });

  it('GPS 가 있는 EXIF 를 파싱해 요약 정보를 돌려준다', () => {
    const buffer = wrapJpeg([exifApp1Payload(buildTiff({ withGps: true }))]);
    const summary = parseExif(buffer);

    expect(summary.hasExif).toBe(true);
    expect(summary.hasGps).toBe(true);
    expect(summary.make).toBe('TestCam');
    expect(summary.model).toBe('ModelX');
    expect(summary.dateTime).toBe('2024:01:02 03:04:05');
    expect(summary.gps?.lat).toBeCloseTo(37 + 33 / 60, 5);
    expect(summary.gps?.lon).toBeCloseTo(126 + 58 / 60, 5);
  });

  it('GPS IFD 가 없는 EXIF 는 hasGps: false 를 돌려준다', () => {
    const buffer = wrapJpeg([exifApp1Payload(buildTiff({ withGps: false }))]);
    const summary = parseExif(buffer);

    expect(summary.hasExif).toBe(true);
    expect(summary.hasGps).toBe(false);
    expect(summary.gps).toBeUndefined();
    expect(summary.make).toBe('TestCam');
  });

  it('GPS 값이 손상된 경우 예외 없이 hasGps: false 로 처리한다', () => {
    const buffer = wrapJpeg([exifApp1Payload(buildTiff({ withGps: true, corruptGps: true }))]);
    const summary = parseExif(buffer);

    expect(summary.hasExif).toBe(true);
    expect(summary.hasGps).toBe(false);
    expect(summary.gps).toBeUndefined();
  });

  it('JPEG SOI 마커가 없는 파일은 ExifParseError 를 던진다', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
    expect(() => parseExif(png)).toThrow(ExifParseError);
  });

  it('빈 버퍼는 ExifParseError 를 던진다', () => {
    expect(() => parseExif(new ArrayBuffer(0))).toThrow(ExifParseError);
  });

  it('세그먼트 길이가 파일 끝을 넘어가면 ExifParseError 를 던진다', () => {
    // APP1 길이를 0x00ff(255) 라고 선언했지만 실제로는 몇 바이트뿐인 손상된 파일.
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0xff, 0x45, 0x78, 0x69, 0x66]);
    expect(() => parseExif(bytes.buffer)).toThrow(ExifParseError);
  });

  it('Exif 가 아닌 APP1(XMP 등)은 무시하고 hasExif: false 를 돌려준다', () => {
    const xmpPayload = new Uint8Array([
      ...'http://ns.adobe.com/xap/1.0/\0'.split('').map((c) => c.charCodeAt(0)),
      0x00,
      0x01,
    ]);
    const buffer = wrapJpeg([xmpPayload]);
    expect(parseExif(buffer)).toEqual({ hasExif: false, hasGps: false });
  });
});

describe('stripExif', () => {
  it('EXIF 가 없는 JPEG 는 원본과 동일한 바이트열을 돌려준다', () => {
    const buffer = wrapJpeg([]);
    const stripped = stripExif(buffer);
    expect(new Uint8Array(stripped)).toEqual(new Uint8Array(buffer));
  });

  it('EXIF(GPS 포함) 세그먼트를 제거하면 더 짧아지고 재파싱 시 hasExif: false 가 된다', () => {
    const buffer = wrapJpeg([exifApp1Payload(buildTiff({ withGps: true }))]);
    const stripped = stripExif(buffer);

    expect(stripped.byteLength).toBeLessThan(buffer.byteLength);
    expect(parseExif(stripped)).toEqual({ hasExif: false, hasGps: false });
  });

  it('Exif 가 아닌 APP1(XMP 등)은 보존하고 Exif APP1 만 제거한다', () => {
    const xmpPayload = new Uint8Array([
      ...'http://ns.adobe.com/xap/1.0/\0'.split('').map((c) => c.charCodeAt(0)),
      0x00,
      0x01,
    ]);
    const buffer = wrapJpeg([xmpPayload, exifApp1Payload(buildTiff({ withGps: false }))]);
    const stripped = stripExif(buffer);

    expect(parseExif(stripped)).toEqual({ hasExif: false, hasGps: false });
    // XMP APP1 세그먼트(마커 2 + 길이 2 + payload)는 그대로 남아 있어야 한다.
    expect(stripped.byteLength).toBeGreaterThanOrEqual(4 + xmpPayload.length);
  });

  it('손상된 세그먼트 길이의 파일은 ExifParseError 를 던진다', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0xff, 0x45, 0x78, 0x69, 0x66]);
    expect(() => stripExif(bytes.buffer)).toThrow(ExifParseError);
  });
});
