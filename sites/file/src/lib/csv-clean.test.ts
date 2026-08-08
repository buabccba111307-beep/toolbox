import { describe, expect, it } from 'vitest';
import { CsvParseError, cleanRows, parseCsv, stringifyCsv } from './csv-clean';

describe('parseCsv', () => {
  it('빈 문자열은 에러를 던진다', () => {
    expect(() => parseCsv('', ',')).toThrow(CsvParseError);
  });

  it('닫히지 않은 큰따옴표는 에러를 던진다', () => {
    expect(() => parseCsv('a,"b\n', ',')).toThrow(CsvParseError);
  });

  it('단순한 CSV 를 파싱한다', () => {
    expect(parseCsv('a,b,c\n1,2,3', ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('세미콜론과 탭 구분자를 지원한다', () => {
    expect(parseCsv('a;b\n1;2', ';')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2', '\t')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('큰따옴표로 감싼 필드 안의 구분자를 문자 그대로 취급한다', () => {
    expect(parseCsv('"a,b",c\n1,2', ',')).toEqual([
      ['a,b', 'c'],
      ['1', '2'],
    ]);
  });

  it('이스케이프된 큰따옴표(")를 하나의 큰따옴표로 변환한다', () => {
    expect(parseCsv('"he said ""hi""",b', ',')).toEqual([['he said "hi"', 'b']]);
  });

  it('필드 내부 줄바꿈을 하나의 필드로 파싱한다', () => {
    expect(parseCsv('"서울\n강남구",b', ',')).toEqual([['서울\n강남구', 'b']]);
  });

  it('CRLF 줄바꿈을 처리한다', () => {
    expect(parseCsv('a,b\r\n1,2', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('행마다 컬럼 개수가 달라도 에러 없이 그대로 파싱한다', () => {
    expect(parseCsv('a,b,c\n1,2', ',')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2'],
    ]);
  });

  it('마지막 줄바꿈 뒤에 내용이 없으면 빈 행을 추가하지 않는다', () => {
    expect(parseCsv('a,b\n1,2\n', ',')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('stringifyCsv', () => {
  it('빈 배열은 빈 문자열을 반환한다', () => {
    expect(stringifyCsv([], ',')).toBe('');
  });

  it('단순한 배열을 CSV 문자열로 만든다', () => {
    expect(
      stringifyCsv(
        [
          ['a', 'b'],
          ['1', '2'],
        ],
        ','
      )
    ).toBe('a,b\r\n1,2');
  });

  it('구분자·큰따옴표·줄바꿈이 포함된 필드는 큰따옴표로 감싸고 내부 큰따옴표를 이스케이프한다', () => {
    expect(stringifyCsv([['a,b', 'he said "hi"', '서울\n강남구']], ',')).toBe(
      '"a,b","he said ""hi""","서울\n강남구"'
    );
  });

  it('파싱 후 재직렬화하면 원래 필드 값을 복원한다', () => {
    const original = [['he said "hi"', 'a,b', '서울\n강남구']];
    const text = stringifyCsv(original, ',');
    expect(parseCsv(text, ',')).toEqual(original);
  });
});

describe('cleanRows', () => {
  it('빈 배열을 넣으면 에러 없이 빈 결과를 반환한다', () => {
    expect(cleanRows([], { hasHeader: false, trimWhitespace: false, removeEmptyRows: false, removeDuplicateRows: false })).toEqual({
      rows: [],
      removedEmptyCount: 0,
      removedDuplicateCount: 0,
    });
  });

  it('공백 제거 옵션이 켜지면 각 필드를 trim 한다', () => {
    const result = cleanRows([[' a ', ' b ']], {
      hasHeader: false,
      trimWhitespace: true,
      removeEmptyRows: false,
      removeDuplicateRows: false,
    });
    expect(result.rows).toEqual([['a', 'b']]);
  });

  it('빈 행을 제거하고 개수를 센다 (옵션이 true 일 때만)', () => {
    const rows = [
      ['a', 'b'],
      ['', ' '],
      ['c', 'd'],
    ];

    const withRemoval = cleanRows(rows, {
      hasHeader: false,
      trimWhitespace: true,
      removeEmptyRows: true,
      removeDuplicateRows: false,
    });
    expect(withRemoval.rows).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(withRemoval.removedEmptyCount).toBe(1);

    const withoutRemoval = cleanRows(rows, {
      hasHeader: false,
      trimWhitespace: true,
      removeEmptyRows: false,
      removeDuplicateRows: false,
    });
    expect(withoutRemoval.rows).toEqual([
      ['a', 'b'],
      ['', ''],
      ['c', 'd'],
    ]);
    expect(withoutRemoval.removedEmptyCount).toBe(0);
  });

  it('중복 행을 제거하고 먼저 나온 행을 남긴다', () => {
    const rows = [
      ['a', '1'],
      ['a', '1'],
      ['b', '2'],
      ['a', '1'],
    ];

    const result = cleanRows(rows, {
      hasHeader: false,
      trimWhitespace: false,
      removeEmptyRows: false,
      removeDuplicateRows: true,
    });

    expect(result.rows).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
    expect(result.removedDuplicateCount).toBe(2);
  });

  it('trimWhitespace 가 true 면 trim 후 비교, false 면 원본 그대로 비교한다', () => {
    const rows = [
      ['a', '1'],
      [' a ', ' 1 '],
    ];

    const trimmed = cleanRows(rows, {
      hasHeader: false,
      trimWhitespace: true,
      removeEmptyRows: false,
      removeDuplicateRows: true,
    });
    expect(trimmed.rows).toEqual([['a', '1']]);
    expect(trimmed.removedDuplicateCount).toBe(1);

    const untrimmed = cleanRows(rows, {
      hasHeader: false,
      trimWhitespace: false,
      removeEmptyRows: false,
      removeDuplicateRows: true,
    });
    expect(untrimmed.rows).toEqual([
      ['a', '1'],
      [' a ', ' 1 '],
    ]);
    expect(untrimmed.removedDuplicateCount).toBe(0);
  });

  it('헤더 행은 중복/빈 행 판정에서 제외되고 항상 결과에 포함된다', () => {
    const rows = [
      ['이름', '이름'], // 헤더 자체가 중복된 값이어도 제거되지 않음
      ['a', 'b'],
      ['a', 'b'],
      ['', ''],
    ];

    const result = cleanRows(rows, {
      hasHeader: true,
      trimWhitespace: true,
      removeEmptyRows: true,
      removeDuplicateRows: true,
    });

    expect(result.rows).toEqual([
      ['이름', '이름'],
      ['a', 'b'],
    ]);
    expect(result.removedEmptyCount).toBe(1);
    expect(result.removedDuplicateCount).toBe(1);
  });

  it('헤더가 있어도 데이터가 없으면 헤더만 남는다', () => {
    const result = cleanRows([['이름', '나이']], {
      hasHeader: true,
      trimWhitespace: false,
      removeEmptyRows: true,
      removeDuplicateRows: true,
    });
    expect(result.rows).toEqual([['이름', '나이']]);
    expect(result.removedEmptyCount).toBe(0);
    expect(result.removedDuplicateCount).toBe(0);
  });

  it('모든 옵션이 꺼져 있으면 원본을 그대로 반환한다', () => {
    const rows = [
      ['a', 'b'],
      ['a', 'b'],
      ['', ''],
    ];
    const result = cleanRows(rows, {
      hasHeader: false,
      trimWhitespace: false,
      removeEmptyRows: false,
      removeDuplicateRows: false,
    });
    expect(result.rows).toEqual(rows);
    expect(result.removedEmptyCount).toBe(0);
    expect(result.removedDuplicateCount).toBe(0);
  });
});
