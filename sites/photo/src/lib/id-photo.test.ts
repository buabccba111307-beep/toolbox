import { describe, expect, it } from 'vitest';
import {
  PRESETS,
  PhotoSpecError,
  calcCropRect,
  calcTargetPixelSize,
  mmToPx,
  willUpscale,
} from './id-photo';

describe('mmToPx', () => {
  it('mm 를 DPI 기준 px 로 변환한다', () => {
    expect(mmToPx(25.4, 300)).toBeCloseTo(300, 6);
    expect(mmToPx(25.4, 96)).toBeCloseTo(96, 6);
  });

  it('mm 이 0 이하면 에러', () => {
    expect(() => mmToPx(0, 300)).toThrow(PhotoSpecError);
    expect(() => mmToPx(-1, 300)).toThrow(PhotoSpecError);
  });

  it('dpi 가 0 이하면 에러', () => {
    expect(() => mmToPx(35, 0)).toThrow(PhotoSpecError);
    expect(() => mmToPx(35, -300)).toThrow(PhotoSpecError);
  });
});

describe('calcTargetPixelSize', () => {
  it('여권 사진 프리셋(35x45mm, 300dpi)의 목표 픽셀 크기를 계산한다', () => {
    expect(calcTargetPixelSize(PRESETS['passport']!)).toEqual({ widthPx: 413, heightPx: 531 });
  });

  it('이력서 사진 프리셋(30x40mm, 300dpi)의 목표 픽셀 크기를 계산한다', () => {
    expect(calcTargetPixelSize(PRESETS['resume']!)).toEqual({ widthPx: 354, heightPx: 472 });
  });

  it('widthMm 이 0 이하면 에러', () => {
    expect(() => calcTargetPixelSize({ widthMm: 0, heightMm: 45, dpi: 300 })).toThrow(PhotoSpecError);
    expect(() => calcTargetPixelSize({ widthMm: -35, heightMm: 45, dpi: 300 })).toThrow(PhotoSpecError);
  });

  it('heightMm 이 0 이하면 에러', () => {
    expect(() => calcTargetPixelSize({ widthMm: 35, heightMm: 0, dpi: 300 })).toThrow(PhotoSpecError);
  });

  it('dpi 가 0 이하면 에러', () => {
    expect(() => calcTargetPixelSize({ widthMm: 35, heightMm: 45, dpi: 0 })).toThrow(PhotoSpecError);
  });
});

describe('calcCropRect', () => {
  it('가로로 넓은 원본에서 정사각형으로 자르면 세로 기준으로 폭이 줄어든다', () => {
    // source 200x100 (aspect 2), target aspect 1
    const rect = calcCropRect(200, 100, 1, 0.5, 0.5, 1);
    expect(rect).toEqual({ x: 50, y: 0, width: 100, height: 100 });
  });

  it('세로로 긴 원본에서 정사각형으로 자르면 가로 기준으로 높이가 줄어든다', () => {
    // source 100x200 (aspect 0.5), target aspect 1
    const rect = calcCropRect(100, 200, 1, 0.5, 0.5, 1);
    expect(rect).toEqual({ x: 0, y: 50, width: 100, height: 100 });
  });

  it('zoom > 1 이면 더 좁은 영역을 자른다', () => {
    // source 200x100, target aspect 1, zoom 2 -> base 100x100 절반으로 축소
    const rect = calcCropRect(200, 100, 1, 0.5, 0.5, 2);
    expect(rect).toEqual({ x: 75, y: 25, width: 50, height: 50 });
  });

  it('offsetX/offsetY 로 크롭 위치를 이동할 수 있다', () => {
    expect(calcCropRect(200, 100, 1, 0, 0, 1)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(calcCropRect(200, 100, 1, 1, 0, 1)).toEqual({ x: 100, y: 0, width: 100, height: 100 });
  });

  it('offsetX/offsetY 가 0~1 범위를 벗어나면 clamp 한다 (에러 아님)', () => {
    expect(calcCropRect(200, 100, 1, -1, 0, 1)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(calcCropRect(200, 100, 1, 2, 0, 1)).toEqual({ x: 100, y: 0, width: 100, height: 100 });
  });

  it('zoom 이 1 미만이면 에러', () => {
    expect(() => calcCropRect(200, 100, 1, 0.5, 0.5, 0.9)).toThrow(PhotoSpecError);
  });

  it('sourceWidthPx 가 0 이하면 에러', () => {
    expect(() => calcCropRect(0, 100, 1, 0.5, 0.5, 1)).toThrow(PhotoSpecError);
    expect(() => calcCropRect(-10, 100, 1, 0.5, 0.5, 1)).toThrow(PhotoSpecError);
  });

  it('sourceHeightPx 가 0 이하면 에러', () => {
    expect(() => calcCropRect(200, 0, 1, 0.5, 0.5, 1)).toThrow(PhotoSpecError);
  });

  it('targetAspect 가 0 이하면 에러', () => {
    expect(() => calcCropRect(200, 100, 0, 0.5, 0.5, 1)).toThrow(PhotoSpecError);
    expect(() => calcCropRect(200, 100, -1, 0.5, 0.5, 1)).toThrow(PhotoSpecError);
  });
});

describe('willUpscale', () => {
  it('크롭 사각형이 목표 픽셀 크기보다 작으면 true', () => {
    expect(willUpscale({ x: 0, y: 0, width: 200, height: 200 }, { widthPx: 413, heightPx: 413 })).toBe(true);
  });

  it('크롭 사각형이 목표 픽셀 크기 이상이면 false', () => {
    expect(willUpscale({ x: 0, y: 0, width: 600, height: 600 }, { widthPx: 413, heightPx: 413 })).toBe(false);
  });

  it('크롭 사각형이 목표 픽셀 크기와 정확히 같으면 false', () => {
    expect(willUpscale({ x: 0, y: 0, width: 413, height: 531 }, { widthPx: 413, heightPx: 531 })).toBe(false);
  });
});
