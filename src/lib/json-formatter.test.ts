import { describe, it, expect } from 'vitest';
import { formatJson, minifyJson, JsonFormatError } from './json-formatter';

describe('formatJson', () => {
  it('기본 들여쓰기(2칸)로 정렬한다', () => {
    expect(formatJson('{"a":1,"b":2}')).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it('들여쓰기 크기를 지정할 수 있다', () => {
    expect(formatJson('{"a":1}', { indent: 4 })).toBe('{\n    "a": 1\n}');
  });

  it('탭 들여쓰기를 지원한다', () => {
    expect(formatJson('{"a":1}', { indent: 'tab' })).toBe('{\n\t"a": 1\n}');
  });

  it('들여쓰기 0 또는 음수는 압축과 동일하게 처리한다', () => {
    const input = '{"a":1,"b":{"c":2}}';
    expect(formatJson(input, { indent: 0 })).toBe(minifyJson(input));
    expect(formatJson(input, { indent: -3 })).toBe(minifyJson(input));
  });

  it('중첩된 객체 키를 재귀적으로 정렬한다', () => {
    const input = '{"b":1,"a":{"d":1,"c":2}}';
    expect(formatJson(input, { sortKeys: true })).toBe(
      '{\n  "a": {\n    "c": 2,\n    "d": 1\n  },\n  "b": 1\n}'
    );
  });

  it('배열 안 객체의 키도 정렬한다', () => {
    const input = '[{"b":1,"a":2}]';
    expect(formatJson(input, { sortKeys: true })).toBe('[\n  {\n    "a": 2,\n    "b": 1\n  }\n]');
  });

  it('최상위 값이 객체가 아니어도 처리한다', () => {
    expect(formatJson('[1,2,3]')).toBe('[\n  1,\n  2,\n  3\n]');
    expect(formatJson('"hello"')).toBe('"hello"');
    expect(formatJson('42')).toBe('42');
    expect(formatJson('true')).toBe('true');
    expect(formatJson('null')).toBe('null');
  });

  it('중복된 키는 JSON.parse 동작대로 마지막 값을 유지한다', () => {
    expect(formatJson('{"a":1,"a":2}')).toBe('{\n  "a": 2\n}');
  });

  it('깊게 중첩된 구조도 처리한다', () => {
    let value: unknown = 0;
    for (let i = 0; i < 200; i++) {
      value = { nested: value };
    }
    const input = JSON.stringify(value);
    expect(() => formatJson(input)).not.toThrow();
    expect(formatJson(input, { indent: 0 })).toBe(input);
  });

  it('빈 문자열은 에러를 던진다', () => {
    expect(() => formatJson('')).toThrow(JsonFormatError);
    expect(() => formatJson('   ')).toThrow(JsonFormatError);
  });

  it('잘못된 JSON 은 원인을 포함한 에러를 던진다', () => {
    expect(() => formatJson('{"a": 1,}')).toThrow(JsonFormatError);
    expect(() => formatJson("{'a': 1}")).toThrow(JsonFormatError);
    expect(() => formatJson('undefined')).toThrow(JsonFormatError);
    expect(() => formatJson('{"a": 1')).toThrow(JsonFormatError);

    try {
      formatJson('{"a": 1,}');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(JsonFormatError);
      expect((err as Error).message.length).toBeGreaterThan('JSON 파싱에 실패했습니다: '.length);
    }
  });
});

describe('minifyJson', () => {
  it('공백을 모두 제거한 한 줄로 만든다', () => {
    expect(minifyJson('{\n  "a": 1,\n  "b": [1, 2, 3]\n}')).toBe('{"a":1,"b":[1,2,3]}');
  });

  it('최상위 값이 객체가 아니어도 처리한다', () => {
    expect(minifyJson('[1, 2, 3]')).toBe('[1,2,3]');
    expect(minifyJson('  "hello"  ')).toBe('"hello"');
    expect(minifyJson('  42  ')).toBe('42');
  });

  it('빈 문자열은 에러를 던진다', () => {
    expect(() => minifyJson('')).toThrow(JsonFormatError);
  });

  it('잘못된 JSON 은 에러를 던진다', () => {
    expect(() => minifyJson('{"a": 1,}')).toThrow(JsonFormatError);
    expect(() => minifyJson('not json')).toThrow(JsonFormatError);
  });
});
