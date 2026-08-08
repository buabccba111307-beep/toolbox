/**
 * CSV 중복/빈 행 정리 로직.
 *
 * UI 와 분리된 순수 함수로 둡니다. 파싱 -> 정리 -> 재직렬화 전체를
 * 문자열/배열만으로 검증할 수 있어야 합니다.
 */

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

export type CsvDelimiter = ',' | ';' | '\t';

export interface CsvCleanOptions {
  hasHeader: boolean;
  trimWhitespace: boolean;
  removeEmptyRows: boolean;
  removeDuplicateRows: boolean;
}

export interface CsvCleanResult {
  rows: string[][];
  removedEmptyCount: number;
  removedDuplicateCount: number;
}

/**
 * CSV 텍스트를 2차원 배열로 파싱합니다.
 * 큰따옴표로 감싼 필드, 이스케이프된 큰따옴표(""), 필드 내 줄바꿈을 처리합니다.
 */
export function parseCsv(text: string, delimiter: CsvDelimiter): string[][] {
  if (text === '') {
    throw new CsvParseError('CSV 내용이 비어 있습니다.');
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  const endField = (): void => {
    row.push(field);
    field = '';
  };

  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === delimiter) {
      endField();
      i += 1;
      continue;
    }

    if (ch === '\r') {
      if (text[i + 1] === '\n') {
        endRow();
        i += 2;
        continue;
      }
      endRow();
      i += 1;
      continue;
    }

    if (ch === '\n') {
      endRow();
      i += 1;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (inQuotes) {
    throw new CsvParseError('큰따옴표가 닫히지 않은 채 파일이 끝났습니다.');
  }

  // 마지막 줄에 개행 없이 내용이 남아있으면 행으로 마무리한다.
  if (field !== '' || row.length > 0) {
    endRow();
  }

  return rows;
}

/**
 * 2차원 배열을 CSV 텍스트로 직렬화합니다.
 * 구분자·큰따옴표·줄바꿈이 포함된 필드는 큰따옴표로 감싸고 내부 큰따옴표는 이스케이프합니다.
 */
export function stringifyCsv(rows: string[][], delimiter: CsvDelimiter): string {
  if (rows.length === 0) return '';

  const escapeField = (value: string): string => {
    if (value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  return rows.map((row) => row.map(escapeField).join(delimiter)).join('\r\n');
}

function normalizeRow(row: string[], trimWhitespace: boolean): string[] {
  return trimWhitespace ? row.map((cell) => cell.trim()) : row;
}

function isEmptyRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}

/**
 * 옵션에 따라 행을 정리합니다.
 * 헤더 행은 옵션과 무관하게 항상 보존하고 제거 대상에서 제외합니다.
 */
export function cleanRows(rows: string[][], options: CsvCleanOptions): CsvCleanResult {
  if (rows.length === 0) {
    return { rows: [], removedEmptyCount: 0, removedDuplicateCount: 0 };
  }

  const { hasHeader, trimWhitespace, removeEmptyRows, removeDuplicateRows } = options;

  const rawHeader = hasHeader ? rows[0] : null;
  const header = rawHeader ? normalizeRow(rawHeader, trimWhitespace) : null;
  const body = hasHeader ? rows.slice(1) : rows.slice();

  let removedEmptyCount = 0;
  let removedDuplicateCount = 0;
  const seen = new Set<string>();
  const result: string[][] = [];

  for (const originalRow of body) {
    const row = normalizeRow(originalRow, trimWhitespace);

    if (removeEmptyRows && isEmptyRow(row)) {
      removedEmptyCount += 1;
      continue;
    }

    if (removeDuplicateRows) {
      const key = JSON.stringify(row);
      if (seen.has(key)) {
        removedDuplicateCount += 1;
        continue;
      }
      seen.add(key);
    }

    result.push(row);
  }

  return {
    rows: header ? [header, ...result] : result,
    removedEmptyCount,
    removedDuplicateCount,
  };
}
