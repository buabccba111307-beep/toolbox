# toolbox — 에이전트 작업 규칙

브라우저에서 도는 작은 개발 도구들을 **한 사이트에 라우트로** 모은 Astro 정적 사이트입니다.
도구마다 사이트를 새로 만들지 않습니다.

## 새 도구를 추가하는 표준 절차

1. **`src/lib/<name>.ts`** — 로직을 순수 함수로. DOM·브라우저 API 의존 금지.
   잘못된 입력은 예외를 던지거나 `null` 을 돌려주고, 무엇이 잘못됐는지 알린다.
2. **`src/lib/<name>.test.ts`** — Vitest. 정상 케이스, 경계값, 잘못된 입력을 모두 덮는다.
3. **`src/pages/tools/<slug>.astro`** — `Base` 레이아웃 사용. `<script>` 안에서 lib 함수를 import 해 DOM 에 연결.
   입력 요소에는 반드시 `<label for>` 를 붙인다 (접근성 + E2E 선택자).
4. **`src/pages/index.astro`** 의 `tools` 배열에 항목 추가.
5. **`e2e/<slug>.spec.ts`** — Playwright. 빌드 산출물을 대상으로 실제 동작을 검증.
6. 페이지 하단에 **주제 설명 문단 2개 이상**. SEO 와 애드센스 심사에 필요하다.

`src/lib/px-rem.ts` 와 `src/pages/tools/px-to-rem.astro` 가 기준 예시다. 새 도구는 이 구조를 따른다.

## 왜 로직을 lib 으로 분리하는가

순수 함수여야 DOM 없이 즉시 검증된다. 그래야 에이전트가 자기 코드를 자기가 채점하지 않고
테스트로 증명할 수 있다. UI 안에 로직을 넣지 말 것.

## 검증 원칙

**"코드를 작성했다" 는 완료가 아니다.** PR 본문에 다음을 첨부한다:

- `npm run typecheck` 출력
- `npm run test:run` 출력

실행하지 못한 항목은 **"미검증"** 이라고 명시한다. 추측으로 완료 보고하지 않는다.

## 코드 규칙

- TypeScript strict. `any` 금지
- 새 의존성 추가 금지. 필요하면 이슈에 먼저 제안한다 — 번들 크기가 곧 SEO 비용이다
- 스타일은 `Base.astro` 의 CSS 변수(`--fg`, `--bg`, `--border`, `--accent`)를 쓴다. 다크 모드가 자동으로 따라온다
- 모든 계산은 브라우저 안에서. 사용자 입력을 서버로 보내지 않는다

## 금지

- 프로덕션 배포 (`vercel --prod`, `npm publish`)
- 파괴적 git (`push --force`, `reset --hard`, `clean -fdx`)
- `.env`, 키, 자격증명 파일 접근
- 사람 승인 없는 머지
- 지시받은 범위 밖의 파일 수정. 벗어나야 한다면 중단하고 `TASK_BLOCKED` 을 출력한다

## 충돌 주의

여러 에이전트가 동시에 작업할 때 **`src/pages/index.astro` 의 `tools` 배열은 공통 접점**이다.
이 파일은 배열에 한 줄 추가하는 것 외에는 건드리지 말 것.
