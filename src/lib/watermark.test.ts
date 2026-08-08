import { describe, expect, it } from 'vitest';
import {
  WatermarkError,
  calcAnchorPoint,
  calcFontSizePx,
  calcTilePoints,
  validateOptions,
  validateText,
} from './watermark';

describe('validateText', () => {
  it('정상 텍스트는 통과한다', () => {
    expect(() => validateText('© my-shop')).not.toThrow();
  });

  it('빈 문자열이면 에러', () => {
    expect(() => validateText('')).toThrow(WatermarkError);
  });

  it('공백만 있으면 에러', () => {
    expect(() => validateText('   ')).toThrow(WatermarkError);
  });
});

describe('validateOptions', () => {
  const base = { position: 'center' as const, marginRatio: 0.05, fontSizeRatio: 0.05, opacity: 0.5 };

  it('정상 옵션은 통과한다', () => {
    expect(() => validateOptions(base)).not.toThrow();
  });

  it('알 수 없는 position 이면 에러', () => {
    expect(() => validateOptions({ ...base, position: 'middle' as never })).toThrow(WatermarkError);
  });

  it('marginRatio 가 음수면 에러', () => {
    expect(() => validateOptions({ ...base, marginRatio: -0.01 })).toThrow(WatermarkError);
  });

  it('marginRatio 가 0이면 통과한다', () => {
    expect(() => validateOptions({ ...base, marginRatio: 0 })).not.toThrow();
  });

  it('fontSizeRatio 가 0 이하면 에러', () => {
    expect(() => validateOptions({ ...base, fontSizeRatio: 0 })).toThrow(WatermarkError);
    expect(() => validateOptions({ ...base, fontSizeRatio: -0.1 })).toThrow(WatermarkError);
  });

  it('opacity 가 0~1 범위를 벗어나면 에러', () => {
    expect(() => validateOptions({ ...base, opacity: -0.1 })).toThrow(WatermarkError);
    expect(() => validateOptions({ ...base, opacity: 1.1 })).toThrow(WatermarkError);
  });

  it('opacity 가 0 또는 1이면 통과한다', () => {
    expect(() => validateOptions({ ...base, opacity: 0 })).not.toThrow();
    expect(() => validateOptions({ ...base, opacity: 1 })).not.toThrow();
  });
});

describe('calcFontSizePx', () => {
  it('이미지 짧은 변 대비 폰트 비율로 픽셀 크기를 계산한다', () => {
    expect(calcFontSizePx(1000, 500, 0.1)).toBeCloseTo(50, 6);
    expect(calcFontSizePx(500, 1000, 0.1)).toBeCloseTo(50, 6);
  });

  it('imageWidth/imageHeight 가 0 이하면 에러', () => {
    expect(() => calcFontSizePx(0, 500, 0.1)).toThrow(WatermarkError);
    expect(() => calcFontSizePx(1000, -1, 0.1)).toThrow(WatermarkError);
  });

  it('fontSizeRatio 가 0 이하면 에러', () => {
    expect(() => calcFontSizePx(1000, 500, 0)).toThrow(WatermarkError);
    expect(() => calcFontSizePx(1000, 500, -0.1)).toThrow(WatermarkError);
  });
});

describe('calcAnchorPoint', () => {
  const W = 1000;
  const H = 800;
  const TW = 100;
  const TH = 30;
  const MARGIN_RATIO = 0.05; // margin = min(1000, 800) * 0.05 = 40

  it('top-left', () => {
    expect(calcAnchorPoint(W, H, TW, TH, 'top-left', MARGIN_RATIO)).toEqual({ x: 40, y: 40 });
  });

  it('top-right', () => {
    expect(calcAnchorPoint(W, H, TW, TH, 'top-right', MARGIN_RATIO)).toEqual({ x: 860, y: 40 });
  });

  it('bottom-left', () => {
    expect(calcAnchorPoint(W, H, TW, TH, 'bottom-left', MARGIN_RATIO)).toEqual({ x: 40, y: 730 });
  });

  it('bottom-right', () => {
    expect(calcAnchorPoint(W, H, TW, TH, 'bottom-right', MARGIN_RATIO)).toEqual({ x: 860, y: 730 });
  });

  it('center', () => {
    expect(calcAnchorPoint(W, H, TW, TH, 'center', MARGIN_RATIO)).toEqual({ x: 450, y: 385 });
  });

  it('marginRatio 가 0이면 모서리에 딱 붙는다', () => {
    expect(calcAnchorPoint(W, H, TW, TH, 'top-left', 0)).toEqual({ x: 0, y: 0 });
    expect(calcAnchorPoint(W, H, TW, TH, 'bottom-right', 0)).toEqual({ x: 900, y: 770 });
  });

  it('텍스트가 이미지보다 커서 좌표가 음수가 되면 0으로 clamp 한다', () => {
    expect(calcAnchorPoint(100, 100, 200, 200, 'top-right', 0)).toEqual({ x: 0, y: 0 });
    expect(calcAnchorPoint(100, 100, 200, 200, 'bottom-right', 0)).toEqual({ x: 0, y: 0 });
    expect(calcAnchorPoint(100, 100, 200, 200, 'bottom-left', 0)).toEqual({ x: 0, y: 0 });
  });

  it('imageWidth/imageHeight 가 0 이하면 에러', () => {
    expect(() => calcAnchorPoint(0, H, TW, TH, 'center', MARGIN_RATIO)).toThrow(WatermarkError);
    expect(() => calcAnchorPoint(W, 0, TW, TH, 'center', MARGIN_RATIO)).toThrow(WatermarkError);
  });

  it('marginRatio 가 음수면 에러', () => {
    expect(() => calcAnchorPoint(W, H, TW, TH, 'center', -0.1)).toThrow(WatermarkError);
  });

  it('알 수 없는 position 이면 에러', () => {
    expect(() => calcAnchorPoint(W, H, TW, TH, 'middle' as never, MARGIN_RATIO)).toThrow(WatermarkError);
  });
});

describe('calcTilePoints', () => {
  it('격자로 여러 좌표를 채운다', () => {
    // image 220x220, text 50x50, marginRatio 0 -> step 50, cells fit 4x4 (0,50,100,150 -> +50 <=220)
    const points = calcTilePoints(220, 220, 50, 50, 0);
    expect(points.length).toBe(16);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points).toContainEqual({ x: 150, y: 150 });
  });

  it('빈 배열이 되지 않는다', () => {
    const points = calcTilePoints(220, 220, 50, 50, 0);
    expect(points.length).toBeGreaterThan(0);
  });

  it('텍스트 크기가 이미지 전체보다 크면 좌표 1개(중앙)만 반환한다', () => {
    const points = calcTilePoints(100, 100, 200, 200, 0.05);
    expect(points).toHaveLength(1);
    expect(points[0]).toEqual({ x: 0, y: 0 });
  });

  it('텍스트가 이미지와 거의 같은 크기라도 최소 1개는 반환한다', () => {
    const points = calcTilePoints(100, 100, 90, 90, 0);
    expect(points.length).toBeGreaterThanOrEqual(1);
  });

  it('imageWidth/imageHeight 가 0 이하면 에러', () => {
    expect(() => calcTilePoints(0, 100, 10, 10, 0)).toThrow(WatermarkError);
    expect(() => calcTilePoints(100, -1, 10, 10, 0)).toThrow(WatermarkError);
  });

  it('marginRatio 가 음수면 에러', () => {
    expect(() => calcTilePoints(100, 100, 10, 10, -0.1)).toThrow(WatermarkError);
  });
});
