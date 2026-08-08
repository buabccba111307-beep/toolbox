/**
 * 증명사진 규격 계산 로직.
 *
 * DOM·Canvas 에 의존하지 않는 순수 함수만 둡니다. 실제 크롭·리사이즈는
 * src/pages/tools/id-photo.astro 의 <script> 에서 Canvas API 로 수행합니다.
 */

export interface PhotoSpec {
  widthMm: number;
  heightMm: number;
  dpi: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelSize {
  widthPx: number;
  heightPx: number;
}

export class PhotoSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoSpecError';
  }
}

const MM_PER_INCH = 25.4;

// 실제 여권/이력서 사진 규격 (한국 기준).
// 여권: 외교부 여권 사진 규격 35mm x 45mm.
// 이력서/증명사진(주민등록증 등): 통상 규격 30mm x 40mm.
export const PRESETS: Record<string, PhotoSpec> = {
  passport: { widthMm: 35, heightMm: 45, dpi: 300 },
  resume: { widthMm: 30, heightMm: 40, dpi: 300 },
};

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PhotoSpecError(`${label} 값은 0보다 커야 합니다.`);
  }
}

/** mm 를 지정한 DPI 기준 픽셀 수로 변환합니다. */
export function mmToPx(mm: number, dpi: number): number {
  assertPositive(mm, 'mm');
  assertPositive(dpi, 'dpi');
  return (mm * dpi) / MM_PER_INCH;
}

/** 규격(mm, DPI)으로부터 목표 픽셀 크기를 계산합니다. 정수 픽셀로 반올림합니다. */
export function calcTargetPixelSize(spec: PhotoSpec): PixelSize {
  assertPositive(spec.widthMm, 'widthMm');
  assertPositive(spec.heightMm, 'heightMm');
  assertPositive(spec.dpi, 'dpi');
  return {
    widthPx: Math.round(mmToPx(spec.widthMm, spec.dpi)),
    heightPx: Math.round(mmToPx(spec.heightMm, spec.dpi)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 원본 이미지 안에서 목표 비율(targetAspect = width/height)에 맞는 크롭 사각형을 계산합니다.
 *
 * - zoom 은 1 이상이어야 합니다 (1 = 원본에 꽉 맞는 최대 크기, 클수록 더 좁게 확대해서 자릅니다).
 *   1 미만은 원본보다 넓게 자르는 것이라 에러로 막습니다.
 * - offsetX, offsetY 는 크롭 사각형이 움직일 수 있는 범위(0~1) 안에서의 위치입니다.
 *   범위를 벗어나면 에러 대신 0~1 로 clamp 합니다 (드래그/슬라이더 입력이 살짝 벗어나도 동작하도록).
 */
export function calcCropRect(
  sourceWidthPx: number,
  sourceHeightPx: number,
  targetAspect: number,
  offsetX: number,
  offsetY: number,
  zoom: number
): CropRect {
  assertPositive(sourceWidthPx, 'sourceWidthPx');
  assertPositive(sourceHeightPx, 'sourceHeightPx');
  assertPositive(targetAspect, 'targetAspect');
  if (!Number.isFinite(zoom) || zoom < 1) {
    throw new PhotoSpecError('zoom 값은 1 이상이어야 합니다.');
  }

  const sourceAspect = sourceWidthPx / sourceHeightPx;
  const baseWidth = sourceAspect > targetAspect ? sourceHeightPx * targetAspect : sourceWidthPx;
  const baseHeight = sourceAspect > targetAspect ? sourceHeightPx : sourceWidthPx / targetAspect;

  const width = baseWidth / zoom;
  const height = baseHeight / zoom;

  const maxX = sourceWidthPx - width;
  const maxY = sourceHeightPx - height;
  const clampedOffsetX = clamp(offsetX, 0, 1);
  const clampedOffsetY = clamp(offsetY, 0, 1);

  return {
    x: clampedOffsetX * maxX,
    y: clampedOffsetY * maxY,
    width,
    height,
  };
}

/**
 * 크롭 사각형이 목표 픽셀 크기보다 작아서 업스케일(화질 저하)이 필요한지 판단합니다.
 * 업스케일 자체는 막지 않고 UI 에서 경고를 보여주는 용도로만 씁니다 —
 * 저해상도 원본이라도 사용자가 원하면 결과물을 받을 수 있어야 하기 때문입니다.
 */
export function willUpscale(cropRect: CropRect, target: PixelSize): boolean {
  return cropRect.width < target.widthPx || cropRect.height < target.heightPx;
}
