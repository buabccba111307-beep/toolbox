/**
 * px ↔ rem 변환 로직.
 *
 * UI 와 분리된 순수 함수로 둡니다. 이 형태여야 DOM 없이 즉시 검증 가능하고,
 * 에이전트가 자기 코드를 자기가 채점하지 않고 테스트로 증명할 수 있습니다.
 */

export const DEFAULT_ROOT_PX = 16;

export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversionError';
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new ConversionError(`${label} 값이 유효한 숫자가 아닙니다.`);
  }
}

function assertValidRoot(rootPx: number): void {
  assertFinite(rootPx, 'root');
  if (rootPx <= 0) {
    throw new ConversionError('root 폰트 크기는 0보다 커야 합니다.');
  }
}

/** px 를 rem 으로 변환합니다. */
export function pxToRem(px: number, rootPx: number = DEFAULT_ROOT_PX): number {
  assertValidRoot(rootPx);
  assertFinite(px, 'px');
  return px / rootPx;
}

/** rem 을 px 로 변환합니다. */
export function remToPx(rem: number, rootPx: number = DEFAULT_ROOT_PX): number {
  assertValidRoot(rootPx);
  assertFinite(rem, 'rem');
  return rem * rootPx;
}

/**
 * 표시용 포맷. 불필요한 소수점 0 을 제거합니다.
 * 16 -> "16", 1.5 -> "1.5", 1/3 -> "0.3333"
 */
export function formatValue(value: number, maxDecimals = 4): string {
  if (!Number.isFinite(value)) return '';
  const fixed = value.toFixed(maxDecimals);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/**
 * 사용자 입력 문자열을 숫자로 해석합니다.
 * 빈 문자열과 잘못된 입력은 null 을 돌려줍니다 (예외를 던지지 않음).
 */
export function parseInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
