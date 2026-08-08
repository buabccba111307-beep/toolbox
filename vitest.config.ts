import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 도구 로직은 순수 함수로 분리해 src/lib 에 둡니다.
    // 순수 함수라 DOM 없이 빠르게 돌고, 에이전트가 자동 검증하기에 가장 좋은 형태입니다.
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
