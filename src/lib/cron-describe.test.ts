import { describe, it, expect } from 'vitest';
import { describeCron, CronParseError } from './cron-describe';

describe('describeCron - 정상 케이스', () => {
  it('이슈에 제시된 예시를 그대로 처리한다', () => {
    expect(describeCron('0 9 * * 1-5')).toBe('월요일부터 금요일까지, 매일 오전 9시 0분에 실행');
  });

  it('모든 필드가 * 이면 매분 실행으로 설명한다', () => {
    expect(describeCron('* * * * *')).toBe('매일 매분 실행');
  });

  it('분 목록을 처리한다', () => {
    expect(describeCron('0,15,30,45 * * * *')).toBe('매일 매시간 0분, 15분, 30분, 45분에 실행');
  });

  it('분 스텝(*/n)을 처리한다', () => {
    expect(describeCron('*/15 * * * *')).toBe('매일 15분마다 실행');
  });

  it('일 범위를 처리한다', () => {
    expect(describeCron('0 0 1-15 * *')).toBe('1일부터 15일까지 오전 12시 0분에 실행');
  });

  it('범위+스텝(a-b/n)을 처리한다', () => {
    expect(describeCron('0 0 1-31/5 * *')).toBe('1일부터 31일까지 5일마다 오전 12시 0분에 실행');
  });

  it('월 단일 값과 오후 시각을 처리한다', () => {
    expect(describeCron('30 14 * 6 *')).toBe('6월, 매일 오후 2시 30분에 실행');
  });

  it('자정(0시)을 오전 12시로 표기한다', () => {
    expect(describeCron('0 0 * * *')).toBe('매일 오전 12시 0분에 실행');
  });

  it('정오(12시)를 오후 12시로 표기한다', () => {
    expect(describeCron('0 12 * * *')).toBe('매일 오후 12시 0분에 실행');
  });

  it('요일 0 과 7 은 동일하게 일요일로 취급한다', () => {
    expect(describeCron('0 8 * * 0')).toBe(describeCron('0 8 * * 7'));
    expect(describeCron('0 8 * * 0')).toBe('일요일, 매일 오전 8시 0분에 실행');
  });

  it('앞뒤 공백과 중복 공백을 정규화해서 처리한다', () => {
    expect(describeCron('  0   9   *   *   1-5  ')).toBe('월요일부터 금요일까지, 매일 오전 9시 0분에 실행');
  });
});

describe('describeCron - 잘못된 입력', () => {
  it('빈 문자열을 거부한다', () => {
    expect(() => describeCron('')).toThrow(CronParseError);
    expect(() => describeCron('   ')).toThrow(CronParseError);
  });

  it('필드 개수가 5개가 아니면 거부한다', () => {
    expect(() => describeCron('0 9 * *')).toThrow(CronParseError);
    expect(() => describeCron('0 9 * * * *')).toThrow(CronParseError);
  });

  it('잘못된 문자를 거부한다', () => {
    expect(() => describeCron('a b c d e')).toThrow(CronParseError);
  });

  it('분 필드 범위(0-59)를 벗어나면 거부한다', () => {
    expect(() => describeCron('60 9 * * *')).toThrow(CronParseError);
  });

  it('시 필드 범위(0-23)를 벗어나면 거부한다', () => {
    expect(() => describeCron('0 24 * * *')).toThrow(CronParseError);
  });

  it('일 필드 범위(1-31)를 벗어나면 거부한다', () => {
    expect(() => describeCron('0 9 0 * *')).toThrow(CronParseError);
    expect(() => describeCron('0 9 32 * *')).toThrow(CronParseError);
  });

  it('월 필드 범위(1-12)를 벗어나면 거부한다', () => {
    expect(() => describeCron('0 9 * 0 *')).toThrow(CronParseError);
    expect(() => describeCron('0 9 * 13 *')).toThrow(CronParseError);
  });

  it('요일 필드 범위(0-7)를 벗어나면 거부한다', () => {
    expect(() => describeCron('0 9 * * 8')).toThrow(CronParseError);
  });

  it('범위가 거꾸로면 거부한다', () => {
    expect(() => describeCron('5-1 * * * *')).toThrow(CronParseError);
  });

  it('스텝 값이 0 이면 거부한다', () => {
    expect(() => describeCron('*/0 * * * *')).toThrow(CronParseError);
  });

  it('스텝 값이 음수면 거부한다', () => {
    expect(() => describeCron('*/-5 * * * *')).toThrow(CronParseError);
  });

  it('범위+스텝에서 스텝 값이 0 이면 거부한다', () => {
    expect(() => describeCron('1-30/0 * * * *')).toThrow(CronParseError);
  });
});
