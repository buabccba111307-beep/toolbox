// audio-trim e2e 테스트용 샘플 WAV 파일을 실행 시점에 생성합니다.
// 바이너리 픽스처 파일을 저장소에 두는 대신, sample-photo.ts 와 같은 방식으로
// 유효한 WAV 바이트를 직접 조립합니다 (Playwright 의 setInputFiles 는 버퍼를 직접 받습니다).

/** durationSec 길이의 사인파 WAV(16bit PCM, 모노) 를 만듭니다. */
export function createSampleWav(durationSec: number, sampleRate = 44100): Buffer {
  const numFrames = Math.round(durationSec * sampleRate);
  const bytesPerSample = 2;
  const dataSize = numFrames * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  const freq = 440;
  for (let i = 0; i < numFrames; i++) {
    const sample = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5;
    buffer.writeInt16LE(Math.round(sample * 0x7fff), 44 + i * bytesPerSample);
  }

  return buffer;
}

/** WAV 바이트에서 재생 시간(초)을 계산합니다. */
export function readWavDurationSec(buf: Buffer): number {
  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const dataSize = buf.readUInt32LE(40);
  const blockAlign = numChannels * (bitsPerSample / 8);
  return dataSize / blockAlign / sampleRate;
}
