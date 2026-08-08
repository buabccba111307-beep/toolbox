import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tools, toolHref } from './registry';

// 목록이 자동 수집되므로, 수집 결과가 실제 페이지와 어긋나지 않는지 여기서 막는다.
// 에이전트가 항목 파일만 만들고 페이지를 빠뜨리면 이 테스트가 잡는다.

describe('도구 레지스트리', () => {
  it('도구가 하나 이상 수집된다', () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  it('slug 가 중복되지 않는다', () => {
    const slugs = tools.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('slug 는 URL 로 쓸 수 있는 형식이다', () => {
    for (const tool of tools) {
      expect(tool.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('이름과 설명이 비어 있지 않다', () => {
    for (const tool of tools) {
      expect(tool.name.trim()).not.toBe('');
      expect(tool.description.trim()).not.toBe('');
    }
  });

  it('모든 slug 에 대응하는 페이지 파일이 존재한다', () => {
    for (const tool of tools) {
      const page = resolve(__dirname, '../pages/tools', `${tool.slug}.astro`);
      expect(existsSync(page), `페이지 없음: src/pages/tools/${tool.slug}.astro`).toBe(true);
    }
  });

  it('링크는 슬래시로 끝난다 (Astro directory 포맷)', () => {
    for (const tool of tools) {
      expect(toolHref(tool)).toBe(`/tools/${tool.slug}/`);
    }
  });
});
