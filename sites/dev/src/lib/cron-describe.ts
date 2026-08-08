/**
 * 표준 5필드 cron 표현식(분 시 일 월 요일)을 한국어 설명 문장으로 바꾸는 로직.
 *
 * UI 와 분리된 순수 함수로 둡니다. DOM 의존이 없어야 테스트로 즉시 검증됩니다.
 * 다음 실행 시각 계산은 범위 밖입니다 — 표현식을 해석해 설명 문장만 만듭니다.
 */

export class CronParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronParseError';
  }
}

type Segment =
  | { kind: 'all' }
  | { kind: 'allStep'; step: number }
  | { kind: 'value'; value: number }
  | { kind: 'range'; start: number; end: number }
  | { kind: 'rangeStep'; start: number; end: number; step: number };

type FieldKind = 'minute' | 'hour' | 'dom' | 'month' | 'dow';

const UNIT: Record<Exclude<FieldKind, 'dow'>, string> = {
  minute: '분',
  hour: '시',
  dom: '일',
  month: '월',
};

const WEEKDAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

const CHAR_RE = /^[0-9*,\-/]+$/;
const PART_RE = /^(\*|\d+|\d+-\d+)(\/(\d+))?$/;

function validateInRange(value: number, min: number, max: number, label: string, original: string): void {
  if (value < min || value > max) {
    throw new CronParseError(`${label} 필드 값이 범위를 벗어났습니다: "${original}" (허용 범위 ${min}-${max})`);
  }
}

function parsePart(part: string, min: number, max: number, label: string): Segment {
  const match = PART_RE.exec(part);
  if (!match) {
    throw new CronParseError(`${label} 필드 값이 올바르지 않습니다: "${part}"`);
  }

  const base = match[1] as string;
  const stepStr = match[3];
  let step: number | undefined;
  if (stepStr !== undefined) {
    step = Number(stepStr);
    if (step <= 0) {
      throw new CronParseError(`${label} 필드의 스텝 값은 1 이상이어야 합니다: "${part}"`);
    }
  }

  if (base === '*') {
    return step === undefined ? { kind: 'all' } : { kind: 'allStep', step };
  }

  if (base.includes('-')) {
    const [startStr, endStr] = base.split('-');
    const start = Number(startStr);
    const end = Number(endStr);
    validateInRange(start, min, max, label, part);
    validateInRange(end, min, max, label, part);
    if (start > end) {
      throw new CronParseError(`${label} 필드의 범위가 거꾸로 되어 있습니다: "${part}"`);
    }
    return step === undefined ? { kind: 'range', start, end } : { kind: 'rangeStep', start, end, step };
  }

  const value = Number(base);
  validateInRange(value, min, max, label, part);
  if (step !== undefined) {
    throw new CronParseError(`${label} 필드 값이 올바르지 않습니다: "${part}"`);
  }
  return { kind: 'value', value };
}

function parseField(raw: string, min: number, max: number, label: string): Segment[] {
  if (!CHAR_RE.test(raw)) {
    throw new CronParseError(`${label} 필드에 허용되지 않은 문자가 있습니다: "${raw}"`);
  }

  const parts = raw.split(',');
  if (parts.some((p) => p === '')) {
    throw new CronParseError(`${label} 필드 형식이 올바르지 않습니다: "${raw}"`);
  }

  return parts.map((part) => parsePart(part, min, max, label));
}

function isUnrestricted(segments: Segment[]): boolean {
  return segments.length === 1 && segments[0]?.kind === 'all';
}

function isSingleValue(segments: Segment[]): segments is [{ kind: 'value'; value: number }] {
  return segments.length === 1 && segments[0]?.kind === 'value';
}

function describeSegment(segment: Segment, kind: FieldKind): string {
  if (kind === 'dow') {
    const name = (v: number): string => WEEKDAY_NAMES[v % 7] as string;
    switch (segment.kind) {
      case 'all':
        return '매일';
      case 'allStep':
        return `${segment.step}일마다`;
      case 'value':
        return name(segment.value);
      case 'range':
        return `${name(segment.start)}부터 ${name(segment.end)}까지`;
      case 'rangeStep':
        return `${name(segment.start)}부터 ${name(segment.end)}까지 ${segment.step}일마다`;
    }
  }

  const unit = UNIT[kind];
  switch (segment.kind) {
    case 'all':
      return `매${unit}`;
    case 'allStep':
      return `${segment.step}${unit}마다`;
    case 'value':
      return `${segment.value}${unit}`;
    case 'range':
      return `${segment.start}${unit}부터 ${segment.end}${unit}까지`;
    case 'rangeStep':
      return `${segment.start}${unit}부터 ${segment.end}${unit}까지 ${segment.step}${unit}마다`;
  }
}

function describeField(segments: Segment[], kind: FieldKind): string {
  return segments.map((segment) => describeSegment(segment, kind)).join(', ');
}

function to12Hour(hour24: number): { period: '오전' | '오후'; hour12: number } {
  if (hour24 === 0) return { period: '오전', hour12: 12 };
  if (hour24 < 12) return { period: '오전', hour12: hour24 };
  if (hour24 === 12) return { period: '오후', hour12: 12 };
  return { period: '오후', hour12: hour24 - 12 };
}

function describeHourOnly(hourSegments: Segment[]): string {
  if (isSingleValue(hourSegments)) {
    const { period, hour12 } = to12Hour(hourSegments[0].value);
    return `${period} ${hour12}시`;
  }
  return describeField(hourSegments, 'hour');
}

function buildTimePhrase(
  hourSegments: Segment[],
  hourUnrestricted: boolean,
  minuteSegments: Segment[],
  minuteUnrestricted: boolean,
): string {
  if (hourUnrestricted && minuteUnrestricted) {
    return '매분';
  }

  if (hourUnrestricted) {
    if (minuteSegments.length === 1 && minuteSegments[0]?.kind === 'allStep') {
      return describeField(minuteSegments, 'minute');
    }
    return `매시간 ${describeField(minuteSegments, 'minute')}`;
  }

  if (minuteUnrestricted) {
    return `${describeHourOnly(hourSegments)} 매분`;
  }

  if (isSingleValue(hourSegments) && isSingleValue(minuteSegments)) {
    const { period, hour12 } = to12Hour(hourSegments[0].value);
    return `${period} ${hour12}시 ${minuteSegments[0].value}분`;
  }

  return `${describeField(hourSegments, 'hour')} ${describeField(minuteSegments, 'minute')}`;
}

function buildDayPhrase(
  domSegments: Segment[],
  domUnrestricted: boolean,
  monthSegments: Segment[],
  monthUnrestricted: boolean,
  dowSegments: Segment[],
  dowUnrestricted: boolean,
): string {
  const parts: string[] = [];
  if (!dowUnrestricted) parts.push(describeField(dowSegments, 'dow'));
  if (!monthUnrestricted) parts.push(describeField(monthSegments, 'month'));
  parts.push(domUnrestricted ? '매일' : describeField(domSegments, 'dom'));
  return parts.join(', ');
}

/** cron 표현식을 파싱해 한국어 설명 문장으로 반환합니다. 유효하지 않으면 CronParseError 를 던집니다. */
export function describeCron(expression: string): string {
  const trimmed = expression.trim();
  if (trimmed === '') {
    throw new CronParseError('cron 표현식이 비어 있습니다.');
  }

  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    throw new CronParseError(
      `cron 표현식은 5개 필드(분 시 일 월 요일)로 이루어져야 합니다. (입력: ${fields.length}개)`,
    );
  }

  const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = fields as [string, string, string, string, string];

  const minuteSegments = parseField(minuteRaw, 0, 59, '분');
  const hourSegments = parseField(hourRaw, 0, 23, '시');
  const domSegments = parseField(domRaw, 1, 31, '일');
  const monthSegments = parseField(monthRaw, 1, 12, '월');
  const dowSegments = parseField(dowRaw, 0, 7, '요일');

  const minuteUnrestricted = isUnrestricted(minuteSegments);
  const hourUnrestricted = isUnrestricted(hourSegments);
  const domUnrestricted = isUnrestricted(domSegments);
  const monthUnrestricted = isUnrestricted(monthSegments);
  const dowUnrestricted = isUnrestricted(dowSegments);

  const dayPhrase = buildDayPhrase(
    domSegments,
    domUnrestricted,
    monthSegments,
    monthUnrestricted,
    dowSegments,
    dowUnrestricted,
  );
  const timePhrase = buildTimePhrase(hourSegments, hourUnrestricted, minuteSegments, minuteUnrestricted);

  const suffix = timePhrase.endsWith('마다') || timePhrase === '매분' ? ' 실행' : '에 실행';
  return `${dayPhrase} ${timePhrase}${suffix}`;
}
