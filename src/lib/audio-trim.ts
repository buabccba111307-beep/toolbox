/**
 * 오디오 트리밍 및 WAV 인코딩 로직.
 *
 * DOM·AudioContext 에 의존하지 않는 순수 함수로 둡니다. 디코딩된 PCM 샘플
 * (Float32Array) 만 있으면 Vitest 에서 즉시 검증할 수 있고, 브라우저에서는
 * AudioBuffer.getChannelData() 결과를 그대로 넘기면 됩니다.
 */

export class AudioTrimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioTrimError';
  }
}

export interface TrimRange {
  startSample: number;
  endSample: number;
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new AudioTrimError(`${label} 값이 유효한 숫자가 아닙니다.`);
  }
  if (value < 0) {
    throw new AudioTrimError(`${label} 값은 0 이상이어야 합니다.`);
  }
}

/**
 * startSec/endSec 를 sampleRate, totalSamples 기준 샘플 인덱스로 변환합니다.
 * endSec 이 오디오 전체 길이를 초과하면 전체 길이로 clamp 합니다.
 */
export function calcTrimRange(
  totalSamples: number,
  sampleRate: number,
  startSec: number,
  endSec: number
): TrimRange {
  if (!Number.isFinite(sampleRate) || !Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new AudioTrimError('sampleRate 는 0보다 큰 정수여야 합니다.');
  }
  if (!Number.isFinite(totalSamples) || !Number.isInteger(totalSamples) || totalSamples <= 0) {
    throw new AudioTrimError('totalSamples 는 0보다 큰 정수여야 합니다.');
  }
  assertFiniteNonNegative(startSec, 'startSec');
  assertFiniteNonNegative(endSec, 'endSec');
  if (startSec >= endSec) {
    throw new AudioTrimError('시작 시각은 끝 시각보다 작아야 합니다.');
  }

  const startSample = Math.min(Math.floor(startSec * sampleRate), totalSamples);
  const endSample = Math.min(Math.ceil(endSec * sampleRate), totalSamples);

  if (startSample >= endSample) {
    throw new AudioTrimError('잘라낼 구간이 비어 있습니다.');
  }

  return { startSample, endSample };
}

/** 채널별 Float32Array 를 range 기준으로 트리밍합니다. */
export function trimChannelData(channelData: Float32Array[], range: TrimRange): Float32Array[] {
  if (channelData.length === 0) {
    throw new AudioTrimError('오디오 채널이 없습니다.');
  }
  const length = channelData[0]!.length;
  for (const channel of channelData) {
    if (channel.length !== length) {
      throw new AudioTrimError('채널별 길이가 서로 다릅니다.');
    }
  }
  if (range.startSample < 0 || range.endSample > length || range.startSample >= range.endSample) {
    throw new AudioTrimError('잘라낼 구간이 오디오 범위를 벗어났습니다.');
  }

  return channelData.map((channel) => channel.slice(range.startSample, range.endSample));
}

function clampSample(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function floatTo16BitPcm(value: number): number {
  const clamped = clampSample(value);
  return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
}

/**
 * PCM 샘플(채널별 Float32Array, -1~1 범위)로부터 16bit PCM WAV 파일 바이트열을 생성합니다.
 * 범위를 벗어난 샘플 값은 예외를 던지지 않고 -1~1 로 clamp 합니다.
 */
export function encodeWav(channelData: Float32Array[], sampleRate: number): ArrayBuffer {
  if (channelData.length === 0) {
    throw new AudioTrimError('오디오 채널이 없습니다.');
  }
  if (!Number.isFinite(sampleRate) || !Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new AudioTrimError('sampleRate 는 0보다 큰 정수여야 합니다.');
  }

  const numChannels = channelData.length;
  const numFrames = channelData[0]!.length;
  for (const channel of channelData) {
    if (channel.length !== numFrames) {
      throw new AudioTrimError('채널별 길이가 서로 다릅니다.');
    }
  }

  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const headerSize = 44;

  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt 청크 크기
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = headerSize;
  for (let frame = 0; frame < numFrames; frame++) {
    for (let channel = 0; channel < numChannels; channel++) {
      view.setInt16(offset, floatTo16BitPcm(channelData[channel]![frame]!), true);
      offset += bytesPerSample;
    }
  }

  return buffer;
}
