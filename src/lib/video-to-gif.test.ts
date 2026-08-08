import { describe, expect, it } from 'vitest';
import {
  MAX_FPS,
  VideoToGifError,
  buildPalette,
  calcFrameTimestamps,
  calcGifDimensions,
  encodeGif,
  mapPixelsToPalette,
  resolveOptions,
  validateOptions,
} from './video-to-gif';

// GIF LZW を直接デコードしてencodeGifが作ったバイト列が実際に復元可能かまで
// 検証します。ヘッダー/寸法/色表/トレーラーだけ見るよりはるかに強い保証です。
function decodeGifLzw(codeStream: number[], minCodeSize: number, expectedLength: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  const resetDict = (): void => {
    dict = [];
    for (let i = 0; i < clearCode; i++) dict.push([i]);
    dict.push([]);
    dict.push([]);
    codeSize = minCodeSize + 1;
  };
  resetDict();

  const output: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let pos = 0;
  let prev: number[] | null = null;

  const readCode = (): number | null => {
    while (bitCount < codeSize) {
      if (pos >= codeStream.length) return null;
      bitBuffer |= codeStream[pos]! << bitCount;
      bitCount += 8;
      pos++;
    }
    const code = bitBuffer & ((1 << codeSize) - 1);
    bitBuffer >>= codeSize;
    bitCount -= codeSize;
    return code;
  };

  for (;;) {
    const code = readCode();
    if (code === null || code === endCode) break;

    if (code === clearCode) {
      resetDict();
      prev = null;
      continue;
    }

    let entry: number[];
    if (code < dict.length && dict[code]!.length > 0) {
      entry = dict[code]!;
    } else if (code === dict.length && prev) {
      entry = [...prev, prev[0]!];
    } else {
      throw new Error(`잘못된 GIF LZW 코드: ${code}`);
    }

    output.push(...entry);

    if (prev) {
      dict.push([...prev, entry[0]!]);
      if (dict.length === (1 << codeSize) - 1 && codeSize < 12) codeSize++;
    }
    prev = entry;
  }

  expect(output.length).toBe(expectedLength);
  return Uint8Array.from(output);
}

describe('calcFrameTimestamps', () => {
  it('시작부터 fps 간격으로 시각을 계산한다', () => {
    expect(calcFrameTimestamps(0, 1, 4)).toEqual([0, 0.25, 0.5, 0.75]);
  });

  it('startSec 이 0이 아니어도 정상 동작한다', () => {
    expect(calcFrameTimestamps(2, 3, 2)).toEqual([2, 2.5]);
  });

  it('구간이 fps 로 정확히 나눠지지 않으면 내림한다', () => {
    expect(calcFrameTimestamps(0, 1, 3)).toHaveLength(3);
  });

  it('구간이 너무 짧아 프레임이 없으면 빈 배열을 돌려준다', () => {
    expect(calcFrameTimestamps(0, 0.1, 1)).toEqual([]);
  });

  it('startSec >= endSec 이면 빈 배열을 돌려준다', () => {
    expect(calcFrameTimestamps(5, 3, 10)).toEqual([]);
  });
});

describe('calcGifDimensions', () => {
  it('원본이 maxWidth 보다 작으면 원본 크기를 유지한다', () => {
    expect(calcGifDimensions(320, 240, 480)).toEqual({ width: 320, height: 240 });
  });

  it('원본이 maxWidth 보다 크면 비율을 유지하며 축소한다', () => {
    expect(calcGifDimensions(1920, 1080, 480)).toEqual({ width: 480, height: 270 });
  });

  it('sourceWidth 가 0 이하이면 에러를 던진다', () => {
    expect(() => calcGifDimensions(0, 100, 480)).toThrow(VideoToGifError);
  });

  it('sourceHeight 가 유효하지 않으면 에러를 던진다', () => {
    expect(() => calcGifDimensions(100, NaN, 480)).toThrow(VideoToGifError);
  });

  it('maxWidth 가 0 이하이면 에러를 던진다', () => {
    expect(() => calcGifDimensions(100, 100, 0)).toThrow(VideoToGifError);
  });
});

describe('resolveOptions / validateOptions', () => {
  const base = { startSec: 0, endSec: 2, fps: 10, maxWidth: 480 };

  it('정상 옵션은 그대로(또는 clamp 되어) 반환된다', () => {
    expect(resolveOptions(base, 5)).toEqual(base);
  });

  it('startSec 이 음수면 에러', () => {
    expect(() => validateOptions({ ...base, startSec: -1 }, 5)).toThrow(VideoToGifError);
  });

  it('startSec 이 NaN 이면 에러', () => {
    expect(() => validateOptions({ ...base, startSec: NaN }, 5)).toThrow(VideoToGifError);
  });

  it('startSec 이 Infinity 면 에러', () => {
    expect(() => validateOptions({ ...base, startSec: Infinity }, 5)).toThrow(VideoToGifError);
  });

  it('startSec >= endSec 이면 에러', () => {
    expect(() => validateOptions({ ...base, startSec: 2, endSec: 2 }, 5)).toThrow(VideoToGifError);
  });

  it('endSec 이 durationSec 을 초과하면 에러 대신 clamp 된다', () => {
    const resolved = resolveOptions({ ...base, endSec: 100 }, 5);
    expect(resolved.endSec).toBe(5);
  });

  it('fps 가 0 이하면 에러', () => {
    expect(() => validateOptions({ ...base, fps: 0 }, 5)).toThrow(VideoToGifError);
  });

  it('fps 가 정수가 아니면 에러', () => {
    expect(() => validateOptions({ ...base, fps: 2.5 }, 5)).toThrow(VideoToGifError);
  });

  it('fps 가 NaN/Infinity 면 에러', () => {
    expect(() => validateOptions({ ...base, fps: NaN }, 5)).toThrow(VideoToGifError);
    expect(() => validateOptions({ ...base, fps: Infinity }, 5)).toThrow(VideoToGifError);
  });

  it('fps 가 MAX_FPS 를 초과하면 에러 대신 clamp 된다', () => {
    const resolved = resolveOptions({ ...base, fps: 60 }, 5);
    expect(resolved.fps).toBe(MAX_FPS);
  });

  it('maxWidth 가 0 이하면 에러', () => {
    expect(() => validateOptions({ ...base, maxWidth: 0 }, 5)).toThrow(VideoToGifError);
  });

  it('clamp 후 추출할 프레임이 없어지면 에러', () => {
    expect(() => validateOptions({ ...base, endSec: 100, fps: 1 }, 0.01)).toThrow(VideoToGifError);
  });
});

describe('buildPalette', () => {
  function makePixels(colors: [number, number, number][]): Uint8ClampedArray {
    const pixels = new Uint8ClampedArray(colors.length * 4);
    colors.forEach(([r, g, b], i) => {
      pixels[i * 4] = r;
      pixels[i * 4 + 1] = g;
      pixels[i * 4 + 2] = b;
      pixels[i * 4 + 3] = 255;
    });
    return pixels;
  }

  it('단색 이미지는 팔레트가 1색이다', () => {
    const pixels = makePixels([
      [10, 20, 30],
      [10, 20, 30],
      [10, 20, 30],
    ]);
    const palette = buildPalette(pixels, 256);
    expect(palette).toEqual([[10, 20, 30]]);
  });

  it('maxColors 이하의 색상 수를 돌려준다', () => {
    const colors: [number, number, number][] = [];
    for (let i = 0; i < 50; i++) colors.push([i * 5, 255 - i * 5, i]);
    const palette = buildPalette(makePixels(colors), 8);
    expect(palette.length).toBeLessThanOrEqual(8);
    expect(palette.length).toBeGreaterThan(1);
  });

  it('빈 pixels 는 에러', () => {
    expect(() => buildPalette(new Uint8ClampedArray(0), 8)).toThrow(VideoToGifError);
  });

  it('길이가 4의 배수가 아니면 에러', () => {
    expect(() => buildPalette(new Uint8ClampedArray(5), 8)).toThrow(VideoToGifError);
  });

  it('maxColors 가 0 이하면 에러', () => {
    expect(() => buildPalette(makePixels([[1, 2, 3]]), 0)).toThrow(VideoToGifError);
  });

  it('maxColors 가 256 초과면 에러', () => {
    expect(() => buildPalette(makePixels([[1, 2, 3]]), 257)).toThrow(VideoToGifError);
  });
});

describe('mapPixelsToPalette', () => {
  const palette: [number, number, number][] = [
    [0, 0, 0],
    [255, 255, 255],
  ];

  it('각 픽셀을 가장 가까운 팔레트 색 인덱스로 매핑한다', () => {
    const pixels = Uint8ClampedArray.from([10, 10, 10, 255, 240, 240, 240, 255]);
    expect(mapPixelsToPalette(pixels, palette)).toEqual(Uint8Array.from([0, 1]));
  });

  it('palette 가 빈 배열이면 에러', () => {
    const pixels = Uint8ClampedArray.from([1, 2, 3, 255]);
    expect(() => mapPixelsToPalette(pixels, [])).toThrow(VideoToGifError);
  });
});

describe('encodeGif', () => {
  const palette: [number, number, number][] = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
  ];

  it('frames 가 빈 배열이면 에러', () => {
    expect(() => encodeGif([], 2, 2, palette, 10)).toThrow(VideoToGifError);
  });

  it('프레임 길이가 width*height 와 다르면 에러', () => {
    const frame = Uint8Array.from([0, 1, 2]);
    expect(() => encodeGif([frame], 2, 2, palette, 10)).toThrow(VideoToGifError);
  });

  it('palette 가 256 초과면 에러', () => {
    const bigPalette: [number, number, number][] = Array.from({ length: 257 }, (_, i) => [i % 256, 0, 0]);
    const frame = Uint8Array.from([0, 0, 0, 0]);
    expect(() => encodeGif([frame], 2, 2, bigPalette, 10)).toThrow(VideoToGifError);
  });

  it('delayCs 가 0 이하면 에러', () => {
    const frame = Uint8Array.from([0, 1, 2, 3]);
    expect(() => encodeGif([frame], 2, 2, palette, 0)).toThrow(VideoToGifError);
  });

  it('GIF89a 헤더, 논리 화면 크기, 색상 테이블, 트레일러가 올바르다', () => {
    const width = 2;
    const height = 2;
    const frame = Uint8Array.from([0, 1, 2, 3]);
    const gif = encodeGif([frame], width, height, palette, 10);

    const header = String.fromCharCode(...gif.slice(0, 6));
    expect(header).toBe('GIF89a');

    const screenWidth = gif[6]! | (gif[7]! << 8);
    const screenHeight = gif[8]! | (gif[9]! << 8);
    expect(screenWidth).toBe(width);
    expect(screenHeight).toBe(height);

    const packed = gif[10]!;
    const gctFlag = (packed >> 7) & 1;
    const gctSizeField = packed & 0b111;
    expect(gctFlag).toBe(1);
    const tableSize = 1 << (gctSizeField + 1);
    expect(tableSize).toBe(4);

    const gctStart = 13;
    for (let i = 0; i < palette.length; i++) {
      const [r, g, b] = palette[i]!;
      expect(gif[gctStart + i * 3]).toBe(r);
      expect(gif[gctStart + i * 3 + 1]).toBe(g);
      expect(gif[gctStart + i * 3 + 2]).toBe(b);
    }

    expect(gif[gif.length - 1]).toBe(0x3b);
  });

  it('생성한 GIF LZW 스트림을 디코드하면 원본 인덱스와 일치한다', () => {
    const width = 4;
    const height = 3;
    const frame = Uint8Array.from([0, 1, 2, 3, 3, 2, 1, 0, 0, 0, 3, 3]);
    const gif = encodeGif([frame], width, height, palette, 10);

    const packed = gif[10]!;
    const gctSizeField = packed & 0b111;
    const tableSize = 1 << (gctSizeField + 1);
    const gctEnd = 13 + tableSize * 3;

    let pos = gctEnd;
    expect(gif[pos]).toBe(0x21);
    expect(gif[pos + 1]).toBe(0xff);
    pos += 2;
    const appBlockSize = gif[pos]!;
    pos += 1 + appBlockSize;
    const subBlockSize = gif[pos]!;
    pos += 1 + subBlockSize;
    expect(gif[pos]).toBe(0);
    pos += 1;

    expect(gif[pos]).toBe(0x21);
    expect(gif[pos + 1]).toBe(0xf9);
    pos += 2;
    const gceSize = gif[pos]!;
    pos += 1 + gceSize;
    expect(gif[pos]).toBe(0);
    pos += 1;

    expect(gif[pos]).toBe(0x2c);
    pos += 1;
    const left = gif[pos]! | (gif[pos + 1]! << 8);
    const top = gif[pos + 2]! | (gif[pos + 3]! << 8);
    const imgWidth = gif[pos + 4]! | (gif[pos + 5]! << 8);
    const imgHeight = gif[pos + 6]! | (gif[pos + 7]! << 8);
    expect(left).toBe(0);
    expect(top).toBe(0);
    expect(imgWidth).toBe(width);
    expect(imgHeight).toBe(height);
    pos += 8;
    const localFlags = gif[pos]!;
    expect(localFlags).toBe(0);
    pos += 1;

    const minCodeSize = gif[pos]!;
    pos += 1;

    const codeStream: number[] = [];
    for (;;) {
      const blockSize = gif[pos]!;
      pos += 1;
      if (blockSize === 0) break;
      for (let i = 0; i < blockSize; i++) codeStream.push(gif[pos + i]!);
      pos += blockSize;
    }

    const decoded = decodeGifLzw(codeStream, minCodeSize, frame.length);
    expect(Array.from(decoded)).toEqual(Array.from(frame));
  });
});
