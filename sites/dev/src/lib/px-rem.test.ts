import { describe, it, expect } from 'vitest';
import {
  pxToRem,
  remToPx,
  formatValue,
  parseInput,
  ConversionError,
  DEFAULT_ROOT_PX,
} from './px-rem';

describe('pxToRem', () => {
  it('기본 root 16px 기준으로 변환한다', () => {
    expect(pxToRem(16)).toBe(1);
    expect(pxToRem(24)).toBe(1.5);
    expect(pxToRem(8)).toBe(0.5);
  });

  it('root 를 바꾸면 결과가 달라진다', () => {
    expect(pxToRem(20, 10)).toBe(2);
    expect(pxToRem(21, 14)).toBe(1.5);
  });

  it('0 과 음수도 처리한다', () => {
    expect(pxToRem(0)).toBe(0);
    expect(pxToRem(-16)).toBe(-1);
  });

  it('root 가 0 이하면 거부한다', () => {
    expect(() => pxToRem(16, 0)).toThrow(ConversionError);
    expect(() => pxToRem(16, -1)).toThrow(ConversionError);
  });

  it('유한하지 않은 값을 거부한다', () => {
    expect(() => pxToRem(Number.NaN)).toThrow(ConversionError);
    expect(() => pxToRem(Number.POSITIVE_INFINITY)).toThrow(ConversionError);
    expect(() => pxToRem(16, Number.NaN)).toThrow(ConversionError);
  });
});

describe('remToPx', () => {
  it('기본 root 기준으로 변환한다', () => {
    expect(remToPx(1)).toBe(16);
    expect(remToPx(1.5)).toBe(24);
  });

  it('pxToRem 과 왕복 변환이 일치한다', () => {
    for (const px of [1, 12, 16, 24, 37.5]) {
      expect(remToPx(pxToRem(px))).toBeCloseTo(px, 10);
    }
  });

  it('root 가 0 이하면 거부한다', () => {
    expect(() => remToPx(1, 0)).toThrow(ConversionError);
  });
});

describe('formatValue', () => {
  it('불필요한 소수점 0 을 제거한다', () => {
    expect(formatValue(16)).toBe('16');
    expect(formatValue(1.5)).toBe('1.5');
    expect(formatValue(0.5)).toBe('0.5');
  });

  it('반복 소수를 자른다', () => {
    expect(formatValue(1 / 3)).toBe('0.3333');
  });

  it('유한하지 않으면 빈 문자열', () => {
    expect(formatValue(Number.NaN)).toBe('');
  });
});

describe('parseInput', () => {
  it('정상 입력을 숫자로 바꾼다', () => {
    expect(parseInput('16')).toBe(16);
    expect(parseInput('  1.5  ')).toBe(1.5);
    expect(parseInput('-8')).toBe(-8);
  });

  it('빈 입력과 잘못된 입력은 null', () => {
    expect(parseInput('')).toBeNull();
    expect(parseInput('   ')).toBeNull();
    expect(parseInput('abc')).toBeNull();
    expect(parseInput('1px')).toBeNull();
  });
});

describe('DEFAULT_ROOT_PX', () => {
  it('브라우저 기본값 16 이다', () => {
    expect(DEFAULT_ROOT_PX).toBe(16);
  });
});
