# toolbox

브라우저에서 바로 쓰는 개발용 변환기와 계산기 모음입니다. 설치 없이, 서버로 데이터를 전송하지 않고 모든 계산을 클라이언트에서 처리합니다.

[Astro](https://astro.build/) 기반 정적 사이트이며, 도구를 하나 추가할 때 라우트 파일 하나와 `src/pages/index.astro` 의 목록 배열 한 줄만 있으면 되도록 구성되어 있습니다.

## 요구 사항

- Node.js 24
- npm

## 시작하기

```bash
npm ci
npm run dev
```

기본적으로 `http://localhost:4321` 에서 개발 서버가 뜹니다.

## 스크립트

| 명령어 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 정적 사이트 빌드 (`dist/`) |
| `npm run preview` | 빌드 결과물 미리보기 |
| `npm run typecheck` | `astro check` 로 타입 검사 (`.astro` 파일 포함) |
| `npm run test` | 유닛 테스트 watch 모드 (Vitest) |
| `npm run test:run` | 유닛 테스트 1회 실행 |
| `npm run e2e` | Playwright E2E 테스트 |

## 프로젝트 구조

```
src/
  layouts/    공용 레이아웃 (Base.astro)
  lib/        도구 로직 — DOM 과 분리된 순수 함수, *.test.ts 로 검증
  pages/      라우트. pages/tools/ 아래에 도구별 페이지 추가
e2e/          Playwright E2E 테스트
```

도구 로직은 `src/lib` 에 순수 함수로 작성하고 `src/lib/*.test.ts` 로 단위 테스트를 붙입니다. UI 는 `src/pages/tools/` 에 라우트 파일로 추가하고, `src/pages/index.astro` 의 `tools` 배열에 항목을 등록합니다.

## 테스트 & 검증

PR 을 올리기 전에 다음을 로컬에서 실행해 통과를 확인합니다.

```bash
npm run typecheck
npm run test:run
```

같은 검사가 `.github/workflows/ci.yml` 에서 lint, build, E2E(Playwright)와 함께 CI 로도 실행됩니다.

## 배포

`astro.config.mjs` 의 `site` 값은 배포 도메인이 정해지면 실제 도메인으로 교체해야 합니다 (sitemap/canonical URL 생성에 사용되어 SEO 에 직접 영향을 줍니다).
