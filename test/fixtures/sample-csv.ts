// csv-clean e2e 테스트용 샘플 CSV 를 실행 시점에 생성합니다.
// 중복 행, 빈 행, 앞뒤 공백이 섞인 행을 포함합니다.

/** 중복 행·빈 행·공백이 섞인 샘플 CSV 텍스트를 만듭니다. */
export function createSampleCsv(): string {
  const lines = [
    '이름,이메일',
    '홍길동,hong@example.com',
    '홍길동,hong@example.com',
    ' 김철수 , kim@example.com ',
    ',',
    '이영희,lee@example.com',
  ];
  return lines.join('\n');
}
