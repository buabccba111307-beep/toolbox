/**
 * 텍스트 워터마크 배치 좌표 계산 로직.
 *
 * DOM·Canvas 에 의존하지 않는 순수 함수만 둡니다. 실제 텍스트 측정(measureText)과
 * 합성(fillText)은 src/pages/tools/watermark.astro 의 <script> 에서 Canvas API 로 수행합니다.
 */

export type WatermarkPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'center'
  | 'tile';

export interface WatermarkOptions {
  position: WatermarkPosition;
  /** 이미지 짧은 변 대비 여백 비율. 0 이상. */
  marginRatio: number;
  /** 이미지 짧은 변 대비 폰트 크기 비율. 0보다 커야 함. */
  fontSizeRatio: number;
  /** 워터마크 불투명도. 0~1. */
  opacity: number;
}

export interface Point {
  x: number;
  y: number;
}

export class WatermarkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatermarkError';
  }
}

const ANCHOR_POSITIONS = new Set<Exclude<WatermarkPosition, 'tile'>>([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
]);

const ALL_POSITIONS = new Set<WatermarkPosition>([...ANCHOR_POSITIONS, 'tile']);

function assertPositiveDims(imageWidth: number, imageHeight: number): void {
  if (!Number.isFinite(imageWidth) || imageWidth <= 0) {
    throw new WatermarkError('imageWidth 값은 0보다 커야 합니다.');
  }
  if (!Number.isFinite(imageHeight) || imageHeight <= 0) {
    throw new WatermarkError('imageHeight 값은 0보다 커야 합니다.');
  }
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new WatermarkError(`${label} 값은 0 이상이어야 합니다.`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 텍스트가 빈 문자열/공백만인지 검증합니다. */
export function validateText(text: string): void {
  if (text.trim() === '') {
    throw new WatermarkError('워터마크 텍스트를 입력하세요.');
  }
}

/** 워터마크 옵션(위치·여백·폰트 비율·불투명도)의 유효성을 검증합니다. */
export function validateOptions(options: WatermarkOptions): void {
  if (!ALL_POSITIONS.has(options.position)) {
    throw new WatermarkError(`알 수 없는 위치입니다: ${options.position}`);
  }
  assertNonNegative(options.marginRatio, 'marginRatio');
  if (!Number.isFinite(options.fontSizeRatio) || options.fontSizeRatio <= 0) {
    throw new WatermarkError('fontSizeRatio 값은 0보다 커야 합니다.');
  }
  if (!Number.isFinite(options.opacity) || options.opacity < 0 || options.opacity > 1) {
    throw new WatermarkError('opacity 값은 0~1 사이여야 합니다.');
  }
}

/** 이미지 크기와 옵션으로부터 폰트 픽셀 크기를 계산합니다 (짧은 변 기준). */
export function calcFontSizePx(imageWidth: number, imageHeight: number, fontSizeRatio: number): number {
  assertPositiveDims(imageWidth, imageHeight);
  if (!Number.isFinite(fontSizeRatio) || fontSizeRatio <= 0) {
    throw new WatermarkError('fontSizeRatio 값은 0보다 커야 합니다.');
  }
  return Math.min(imageWidth, imageHeight) * fontSizeRatio;
}

/**
 * 단일 위치(모서리/중앙) 워터마크 기준점 좌표를 계산합니다.
 * 텍스트가 이미지보다 커서 좌표가 음수가 되는 경우 0으로 clamp 합니다.
 */
export function calcAnchorPoint(
  imageWidth: number,
  imageHeight: number,
  textWidth: number,
  textHeight: number,
  position: Exclude<WatermarkPosition, 'tile'>,
  marginRatio: number
): Point {
  assertPositiveDims(imageWidth, imageHeight);
  assertNonNegative(textWidth, 'textWidth');
  assertNonNegative(textHeight, 'textHeight');
  assertNonNegative(marginRatio, 'marginRatio');
  if (!ANCHOR_POSITIONS.has(position)) {
    throw new WatermarkError(`알 수 없는 위치입니다: ${position}`);
  }

  const margin = Math.min(imageWidth, imageHeight) * marginRatio;

  let x: number;
  let y: number;
  switch (position) {
    case 'top-left':
      x = margin;
      y = margin;
      break;
    case 'top-right':
      x = imageWidth - margin - textWidth;
      y = margin;
      break;
    case 'bottom-left':
      x = margin;
      y = imageHeight - margin - textHeight;
      break;
    case 'bottom-right':
      x = imageWidth - margin - textWidth;
      y = imageHeight - margin - textHeight;
      break;
    case 'center':
      x = (imageWidth - textWidth) / 2;
      y = (imageHeight - textHeight) / 2;
      break;
  }

  return {
    x: clamp(x, 0, Math.max(0, imageWidth - textWidth)),
    y: clamp(y, 0, Math.max(0, imageHeight - textHeight)),
  };
}

/**
 * 'tile' 모드일 때 반복 배치할 좌표 목록을 계산합니다 (이미지 전체를 격자로 채움).
 * 텍스트 크기가 이미지 전체보다 커서 한 칸도 들어가지 않으면, 빈 배열 대신
 * 중앙 좌표 1개를 반환합니다.
 */
export function calcTilePoints(
  imageWidth: number,
  imageHeight: number,
  textWidth: number,
  textHeight: number,
  marginRatio: number
): Point[] {
  assertPositiveDims(imageWidth, imageHeight);
  assertNonNegative(textWidth, 'textWidth');
  assertNonNegative(textHeight, 'textHeight');
  assertNonNegative(marginRatio, 'marginRatio');

  const margin = Math.min(imageWidth, imageHeight) * marginRatio;
  const stepX = textWidth + margin;
  const stepY = textHeight + margin;

  const fallback = (): Point[] => [
    calcAnchorPoint(imageWidth, imageHeight, textWidth, textHeight, 'center', marginRatio),
  ];

  if (stepX <= 0 || stepY <= 0 || textWidth >= imageWidth || textHeight >= imageHeight) {
    return fallback();
  }

  const points: Point[] = [];
  for (let y = margin; y + textHeight <= imageHeight; y += stepY) {
    for (let x = margin; x + textWidth <= imageWidth; x += stepX) {
      points.push({ x, y });
    }
  }

  return points.length > 0 ? points : fallback();
}
