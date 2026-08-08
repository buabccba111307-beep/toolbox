import type { Tool } from './types';

/**
 * 도구 목록을 파일 시스템에서 자동으로 수집한다.
 *
 * 이렇게 하는 이유: 예전에는 index.astro 에 배열을 손으로 유지했는데,
 * 여러 에이전트가 동시에 도구를 추가하면 **전부 같은 줄에서 충돌**했다.
 * 도구마다 파일이 따로 있으면 공유 파일이 없어 충돌이 발생하지 않는다.
 *
 * 새 도구를 추가할 때는 src/tools/entries/<slug>.ts 를 하나 만들면 끝이다.
 * 이 파일은 건드리지 않는다.
 */
const modules = import.meta.glob<{ default: Tool }>('./entries/*.ts', {
  eager: true,
});

export const tools: Tool[] = Object.values(modules)
  .map((mod) => mod.default)
  .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

export function toolHref(tool: Tool): string {
  return `/tools/${tool.slug}/`;
}
