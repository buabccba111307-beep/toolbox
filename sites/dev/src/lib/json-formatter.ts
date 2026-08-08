/**
 * JSON pretty-print / minify 로직.
 *
 * UI 와 분리된 순수 함수로 둡니다. `JSON.parse`/`JSON.stringify` 표준 API 만 사용하고,
 * 브라우저 밖에서도 즉시 검증 가능합니다.
 */

export class JsonFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonFormatError';
  }
}

export type Indent = number | 'tab';

export interface FormatJsonOptions {
  /**
   * 들여쓰기 크기. 숫자면 스페이스 개수, 'tab' 이면 탭 문자.
   * 0 이하이거나 생략 시 기본값(2)을 쓴다. 압축을 원하면 minifyJson 을 쓴다.
   */
  indent?: Indent;
  /** true 면 모든 중첩 객체의 키를 재귀적으로 정렬한다. */
  sortKeys?: boolean;
}

function parseJson(input: string): unknown {
  if (input.trim() === '') {
    throw new JsonFormatError('입력이 비어 있습니다.');
  }
  try {
    return JSON.parse(input);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new JsonFormatError(`JSON 파싱에 실패했습니다: ${reason}`);
  }
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }
  return value;
}

/** 유효한 JSON 문자열을 보기 좋게 들여쓰기해 돌려준다. */
export function formatJson(input: string, options: FormatJsonOptions = {}): string {
  const parsed = parseJson(input);
  const value = options.sortKeys ? sortKeysDeep(parsed) : parsed;

  if (options.indent === 'tab') {
    return JSON.stringify(value, null, '\t');
  }

  const size = Math.floor(options.indent ?? 2);
  if (!Number.isFinite(size) || size <= 0) {
    return JSON.stringify(value);
  }
  return JSON.stringify(value, null, size);
}

/** 유효한 JSON 문자열의 공백을 모두 제거해 한 줄로 돌려준다. */
export function minifyJson(input: string): string {
  return JSON.stringify(parseJson(input));
}
