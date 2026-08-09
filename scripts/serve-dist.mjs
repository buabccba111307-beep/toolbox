// e2e 용 정적 파일 서버.
//
// `astro preview` 를 쓰지 않는 이유: Astro 7 의 preview 는 백그라운드 데몬으로 떠서
// 즉시 반환한다. Playwright 는 webServer 프로세스가 살아 있기를 기대하므로
// "Process from config.webServer exited early" 로 실패한다.
// 게다가 데몬이 남아 있으면 다음 실행이 낡은 산출물을 검사하게 된다 — 실제로
// 몇 시간 전 빌드를 검사해 SEO 테스트가 거짓 통과한 적이 있다.
//
// 의존성을 추가하지 않으려고 Node 내장 모듈만 쓴다.
//
// 사용: node scripts/serve-dist.mjs --dir dist --port 4321

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const ROOT = resolve(process.cwd(), arg('dir', 'dist'));
const PORT = Number(arg('port', '4321'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

async function resolveFile(urlPath) {
  // build.format: 'directory' 이므로 /tools/foo/ 는 dist/tools/foo/index.html 이다.
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = join(ROOT, clean);

  // 경로 탈출 방지
  if (!resolve(candidate).startsWith(ROOT + sep) && resolve(candidate) !== ROOT) {
    return null;
  }

  try {
    const s = await stat(candidate);
    if (s.isDirectory()) {
      const index = join(candidate, 'index.html');
      await stat(index);
      return index;
    }
    return candidate;
  } catch {
    // 확장자 없는 경로는 디렉토리 인덱스로 한 번 더 시도한다
    try {
      const index = join(candidate, 'index.html');
      await stat(index);
      return index;
    } catch {
      return null;
    }
  }
}

const server = createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? '/');

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Error');
  }
});

server.listen(PORT, () => {
  console.log(`serving ${ROOT} at http://localhost:${PORT}`);
});
