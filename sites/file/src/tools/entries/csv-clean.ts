import type { Tool } from '../types';

export default {
  slug: 'csv-clean',
  name: 'CSV 중복 행 정리',
  description: 'CSV 파일의 중복·빈 행을 지우고 공백을 정리해 새 CSV 파일로 다운로드합니다.',
} satisfies Tool;
