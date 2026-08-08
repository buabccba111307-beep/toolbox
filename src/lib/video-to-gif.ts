/**
 * 동영상 구간 → GIF 변환 계산 로직.
 *
 * DOM·<video>·Canvas 에 의존하지 않는 순수 함수만 둡니다. 프레임 시각 계산,
 * 팔레트 생성, GIF89a 바이트열 인코딩(LZW 압축 포함)까지 전부 숫자와
 * Uint8Array/Uint8ClampedArray 만으로 동작해서 Vitest 로 즉시 검증할 수 있습니다.
 * 실제 프레임 캡처(<video> seek + canvas.getImageData)는
 * src/pages/tools/video-to-gif.astro 의 <script> 에서 수행합니다.
 */

export class VideoToGifError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoToGifError';
  }
}

export interface FrameCaptureOptions {
  startSec: number;
  endSec: number;
  fps: number; // 캡처할 초당 프레임 수
  maxWidth: number; // 출력 GIF 최대 가로 픽셀, 원본이 더 작으면 원본 유지
}

export interface ResolvedOptions {
  startSec: number;
  endSec: number;
  fps: number;
  maxWidth: number;
}

export interface GifDimensions {
  width: number;
  height: number;
}

/** 용량 폭증을 막기 위한 fps 상한. 이 값을 넘으면 에러 대신 이 값으로 clamp 합니다. */
export const MAX_FPS = 30;

/** startSec/endSec/fps 로부터 프레임을 캡처할 시각(초) 목록을 계산합니다. */
export function calcFrameTimestamps(startSec: number, endSec: number, fps: number): number[] {
  const duration = endSec - startSec;
  const frameCount = Math.floor(duration * fps);
  if (!Number.isFinite(frameCount) || frameCount <= 0) return [];

  const timestamps: number[] = [];
  for (let i = 0; i < frameCount; i++) {
    timestamps.push(startSec + i / fps);
  }
  return timestamps;
}

/** 원본 비디오 크기와 maxWidth 로부터 GIF 출력 크기를 계산합니다 (비율 유지, 정수 픽셀로 반올림). */
export function calcGifDimensions(sourceWidth: number, sourceHeight: number, maxWidth: number): GifDimensions {
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) {
    throw new VideoToGifError('sourceWidth 값은 0보다 커야 합니다.');
  }
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    throw new VideoToGifError('sourceHeight 값은 0보다 커야 합니다.');
  }
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    throw new VideoToGifError('maxWidth 값은 0보다 커야 합니다.');
  }

  if (sourceWidth <= maxWidth) {
    return { width: Math.round(sourceWidth), height: Math.round(sourceHeight) };
  }

  const ratio = maxWidth / sourceWidth;
  return {
    width: Math.round(maxWidth),
    height: Math.max(1, Math.round(sourceHeight * ratio)),
  };
}

/** 옵션 유효성을 검증하고, clamp 규칙(endSec/fps)을 적용한 최종 값을 돌려줍니다. */
export function resolveOptions(options: FrameCaptureOptions, durationSec: number): ResolvedOptions {
  const { startSec, endSec, fps, maxWidth } = options;

  if (!Number.isFinite(startSec) || startSec < 0) {
    throw new VideoToGifError('시작 시각은 0 이상의 유효한 숫자여야 합니다.');
  }
  if (!Number.isFinite(endSec)) {
    throw new VideoToGifError('끝 시각이 유효한 숫자가 아닙니다.');
  }
  if (startSec >= endSec) {
    throw new VideoToGifError('시작 시각은 끝 시각보다 작아야 합니다.');
  }
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isInteger(fps)) {
    throw new VideoToGifError('fps 는 0보다 큰 정수여야 합니다.');
  }
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
    throw new VideoToGifError('maxWidth 값은 0보다 커야 합니다.');
  }

  const clampedEnd = Math.min(endSec, durationSec);
  const clampedFps = Math.min(fps, MAX_FPS);

  const timestamps = calcFrameTimestamps(startSec, clampedEnd, clampedFps);
  if (timestamps.length === 0) {
    throw new VideoToGifError('추출할 프레임이 없습니다.');
  }

  return { startSec, endSec: clampedEnd, fps: clampedFps, maxWidth };
}

/** 옵션 유효성을 검증합니다. 문제가 있으면 예외를 던집니다. */
export function validateOptions(options: FrameCaptureOptions, durationSec: number): void {
  resolveOptions(options, durationSec);
}

interface ColorBox {
  colors: [number, number, number][];
}

function boxChannelRange(colors: [number, number, number][]): [number, number, number] {
  let minR = 255,
    maxR = 0,
    minG = 255,
    maxG = 0,
    minB = 255,
    maxB = 0;
  for (const [r, g, b] of colors) {
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (g < minG) minG = g;
    if (g > maxG) maxG = g;
    if (b < minB) minB = b;
    if (b > maxB) maxB = b;
  }
  return [maxR - minR, maxG - minG, maxB - minB];
}

function averageColor(colors: [number, number, number][]): [number, number, number] {
  let r = 0,
    g = 0,
    b = 0;
  for (const c of colors) {
    r += c[0];
    g += c[1];
    b += c[2];
  }
  const n = colors.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** RGBA 픽셀로부터 최대 maxColors 색 팔레트를 median-cut 으로 생성합니다. */
export function buildPalette(pixels: Uint8ClampedArray, maxColors: number): [number, number, number][] {
  if (pixels.length === 0 || pixels.length % 4 !== 0) {
    throw new VideoToGifError('pixels 길이는 0보다 크고 4의 배수여야 합니다.');
  }
  if (!Number.isInteger(maxColors) || maxColors <= 0 || maxColors > 256) {
    throw new VideoToGifError('maxColors 값은 1~256 사이의 정수여야 합니다.');
  }

  const colors: [number, number, number][] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    colors.push([pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]);
  }

  let boxes: ColorBox[] = [{ colors }];

  while (boxes.length < maxColors) {
    let targetIdx = -1;
    let targetRange = 0;
    let targetChannel: 0 | 1 | 2 = 0;

    boxes.forEach((box, idx) => {
      if (box.colors.length < 2) return;
      const [rRange, gRange, bRange] = boxChannelRange(box.colors);
      const maxRange = Math.max(rRange, gRange, bRange);
      if (maxRange > targetRange) {
        targetRange = maxRange;
        targetIdx = idx;
        targetChannel = rRange >= gRange && rRange >= bRange ? 0 : gRange >= bRange ? 1 : 2;
      }
    });

    if (targetIdx === -1 || targetRange === 0) break;

    const box = boxes[targetIdx]!;
    const sorted = [...box.colors].sort((a, b) => a[targetChannel] - b[targetChannel]);
    const mid = Math.ceil(sorted.length / 2);
    boxes.splice(targetIdx, 1, { colors: sorted.slice(0, mid) }, { colors: sorted.slice(mid) });
  }

  return boxes.map((box) => averageColor(box.colors));
}

/** RGBA 픽셀을 팔레트에서 가장 가까운 색의 인덱스 배열로 변환합니다. */
export function mapPixelsToPalette(pixels: Uint8ClampedArray, palette: [number, number, number][]): Uint8Array {
  if (palette.length === 0) {
    throw new VideoToGifError('palette 가 비어 있습니다.');
  }
  if (pixels.length === 0 || pixels.length % 4 !== 0) {
    throw new VideoToGifError('pixels 길이는 0보다 크고 4의 배수여야 합니다.');
  }

  const pixelCount = pixels.length / 4;
  const result = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i++) {
    const r = pixels[i * 4]!;
    const g = pixels[i * 4 + 1]!;
    const b = pixels[i * 4 + 2]!;

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const [pr, pg, pb] = palette[p]!;
      const dr = r - pr;
      const dg = g - pg;
      const db = b - pb;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = p;
      }
    }
    result[i] = bestIdx;
  }

  return result;
}

/**
 * GIF LZW 압축(가변 코드 크기, GIF89a Appendix F 알고리즘). 팔레트 인덱스 배열을
 * 코드 스트림으로 바꾸고, LSB-first 로 비트를 패킹한 바이트 배열을 돌려줍니다.
 */
function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  let dict = new Map<string, number>();

  const bytes: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;

  const emit = (code: number): void => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      bytes.push(bitBuffer & 0xff);
      bitBuffer >>= 8;
      bitCount -= 8;
    }
  };

  const resetDict = (): void => {
    dict = new Map();
    for (let i = 0; i < clearCode; i++) dict.set(String(i), i);
    nextCode = endCode + 1;
    codeSize = minCodeSize + 1;
  };

  resetDict();
  emit(clearCode);

  let w = '';
  for (let i = 0; i < indices.length; i++) {
    const k = indices[i]!;
    const wk = w === '' ? String(k) : `${w},${k}`;

    if (dict.has(wk)) {
      w = wk;
      continue;
    }

    emit(dict.get(w)!);

    if (nextCode < 4096) {
      dict.set(wk, nextCode);
      nextCode++;
      if (nextCode === 1 << codeSize && codeSize < 12) {
        codeSize++;
      }
    } else {
      emit(clearCode);
      resetDict();
    }

    w = String(k);
  }

  if (w !== '') emit(dict.get(w)!);
  emit(endCode);
  if (bitCount > 0) bytes.push(bitBuffer & 0xff);

  return bytes;
}

/** 프레임들(팔레트 인덱스 배열)과 공통 팔레트로 GIF89a 애니메이션 바이트열을 생성합니다. */
export function encodeGif(
  frames: Uint8Array[],
  width: number,
  height: number,
  palette: [number, number, number][],
  delayCs: number // 프레임 간 지연, 1/100초 단위
): Uint8Array {
  if (frames.length === 0) {
    throw new VideoToGifError('frames 가 비어 있습니다.');
  }
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new VideoToGifError('width/height 값은 0보다 큰 정수여야 합니다.');
  }
  if (palette.length === 0 || palette.length > 256) {
    throw new VideoToGifError('palette 색상 수는 1~256 사이여야 합니다.');
  }
  if (!Number.isFinite(delayCs) || delayCs <= 0) {
    throw new VideoToGifError('delayCs 값은 0보다 커야 합니다.');
  }

  const frameSize = width * height;
  for (const frame of frames) {
    if (frame.length !== frameSize) {
      throw new VideoToGifError('프레임 길이가 width * height 와 일치하지 않습니다.');
    }
  }

  const colorBits = Math.max(1, Math.ceil(Math.log2(Math.max(palette.length, 2))));
  const tableSize = 1 << colorBits;
  const lzwMinCodeSize = Math.max(2, colorBits);

  const bytes: number[] = [];
  const pushByte = (b: number): void => {
    bytes.push(b & 0xff);
  };
  const pushString = (s: string): void => {
    for (let i = 0; i < s.length; i++) pushByte(s.charCodeAt(i));
  };
  const pushUint16LE = (v: number): void => {
    pushByte(v & 0xff);
    pushByte((v >> 8) & 0xff);
  };

  // Header
  pushString('GIF89a');

  // Logical Screen Descriptor
  pushUint16LE(width);
  pushUint16LE(height);
  const gctFlag = 1;
  const colorResolution = colorBits - 1;
  const sortFlag = 0;
  const gctSizeField = colorBits - 1;
  pushByte((gctFlag << 7) | (colorResolution << 4) | (sortFlag << 3) | gctSizeField);
  pushByte(0); // background color index
  pushByte(0); // pixel aspect ratio

  // Global Color Table (maxColors 보다 작으면 검정으로 패딩)
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] ?? [0, 0, 0];
    pushByte(c[0]);
    pushByte(c[1]);
    pushByte(c[2]);
  }

  // Application Extension (NETSCAPE2.0) — 무한 반복
  pushByte(0x21);
  pushByte(0xff);
  pushByte(11);
  pushString('NETSCAPE2.0');
  pushByte(3);
  pushByte(1);
  pushUint16LE(0);
  pushByte(0);

  for (const frame of frames) {
    // Graphic Control Extension
    pushByte(0x21);
    pushByte(0xf9);
    pushByte(4);
    pushByte(0); // disposal method: none, no transparency
    pushUint16LE(delayCs);
    pushByte(0); // transparent color index (미사용)
    pushByte(0);

    // Image Descriptor
    pushByte(0x2c);
    pushUint16LE(0);
    pushUint16LE(0);
    pushUint16LE(width);
    pushUint16LE(height);
    pushByte(0); // no local color table

    // LZW-compressed image data
    pushByte(lzwMinCodeSize);
    const compressed = lzwEncode(frame, lzwMinCodeSize);
    let offset = 0;
    while (offset < compressed.length) {
      const chunkSize = Math.min(255, compressed.length - offset);
      pushByte(chunkSize);
      for (let i = 0; i < chunkSize; i++) pushByte(compressed[offset + i]!);
      offset += chunkSize;
    }
    pushByte(0); // block terminator
  }

  // Trailer
  pushByte(0x3b);

  return new Uint8Array(bytes);
}
