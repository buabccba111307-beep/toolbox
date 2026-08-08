// video-to-gif e2e 테스트용 샘플 동영상을 실행 시점에 생성합니다.
// 저장소에 바이너리 동영상 픽스처를 두는 대신(코덱 인코더는 외부 의존성 없이
// 손으로 만들기 매우 어려움), 이미 열려 있는 Chromium 페이지 안에서 canvas.captureStream +
// MediaRecorder 로 짧은 WebM 을 직접 녹화해 Buffer 로 돌려줍니다. 브라우저 자체의
// 신뢰할 수 있는 인코더를 빌려 쓰는 셈이라 새 npm 의존성이 필요 없습니다.
import type { Page } from '@playwright/test';

export interface SampleVideoOptions {
  width?: number;
  height?: number;
  durationMs?: number;
  fps?: number;
}

export async function createSampleWebm(page: Page, options: SampleVideoOptions = {}): Promise<Buffer> {
  const { width = 160, height = 90, durationMs = 1500, fps = 10 } = options;

  const base64 = await page.evaluate(
    async ({ width, height, durationMs, fps }) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
        ? 'video/webm;codecs=vp8'
        : 'video/webm';

      const stream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(
        fps
      );
      const recorder = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
      });

      recorder.start();
      const startTime = performance.now();

      const draw = (): void => {
        const elapsed = performance.now() - startTime;
        const hue = (elapsed / durationMs) * 360;
        ctx.fillStyle = `hsl(${hue}, 80%, 50%)`;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.floor((elapsed / durationMs) * width), 0, Math.max(2, Math.floor(width / 20)), height);

        if (elapsed < durationMs) {
          requestAnimationFrame(draw);
        } else {
          recorder.stop();
        }
      };
      requestAnimationFrame(draw);

      await stopped;

      const blob = new Blob(chunks, { type: 'video/webm' });
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
      return btoa(binary);
    },
    { width, height, durationMs, fps }
  );

  return Buffer.from(base64, 'base64');
}
