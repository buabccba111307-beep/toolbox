import { describe, it, expect } from 'vitest';
import { calcTrimRange, trimChannelData, encodeWav, AudioTrimError } from './audio-trim';

describe('calcTrimRange', () => {
  it('초 단위 구간을 샘플 인덱스로 변환한다', () => {
    expect(calcTrimRange(44100 * 10, 44100, 1, 2)).toEqual({
      startSample: 44100,
      endSample: 88200,
    });
  });

  it('0초부터 시작하는 구간도 처리한다', () => {
    expect(calcTrimRange(44100 * 10, 44100, 0, 1)).toEqual({
      startSample: 0,
      endSample: 44100,
    });
  });

  it('endSec 이 전체 길이를 초과하면 전체 길이로 clamp 한다', () => {
    const range = calcTrimRange(44100 * 2, 44100, 0, 100);
    expect(range).toEqual({ startSample: 0, endSample: 44100 * 2 });
  });

  it('startSec 가 음수면 거부한다', () => {
    expect(() => calcTrimRange(44100, 44100, -1, 1)).toThrow(AudioTrimError);
  });

  it('endSec 가 음수면 거부한다', () => {
    expect(() => calcTrimRange(44100, 44100, 0, -1)).toThrow(AudioTrimError);
  });

  it('startSec >= endSec 면 거부한다', () => {
    expect(() => calcTrimRange(44100, 44100, 1, 1)).toThrow(AudioTrimError);
    expect(() => calcTrimRange(44100, 44100, 2, 1)).toThrow(AudioTrimError);
  });

  it('sampleRate 가 0 이하거나 정수가 아니면 거부한다', () => {
    expect(() => calcTrimRange(44100, 0, 0, 1)).toThrow(AudioTrimError);
    expect(() => calcTrimRange(44100, -44100, 0, 1)).toThrow(AudioTrimError);
    expect(() => calcTrimRange(44100, 44100.5, 0, 1)).toThrow(AudioTrimError);
  });

  it('totalSamples 가 0 이하면 거부한다 (빈 오디오)', () => {
    expect(() => calcTrimRange(0, 44100, 0, 1)).toThrow(AudioTrimError);
    expect(() => calcTrimRange(-1, 44100, 0, 1)).toThrow(AudioTrimError);
  });

  it('NaN/Infinity 입력을 거부한다', () => {
    expect(() => calcTrimRange(44100, 44100, Number.NaN, 1)).toThrow(AudioTrimError);
    expect(() => calcTrimRange(44100, 44100, 0, Number.NaN)).toThrow(AudioTrimError);
    expect(() => calcTrimRange(44100, 44100, 0, Number.POSITIVE_INFINITY)).toThrow(AudioTrimError);
    expect(() => calcTrimRange(44100, 44100, Number.POSITIVE_INFINITY, 1)).toThrow(AudioTrimError);
  });

  it('clamp 후 구간이 비면 거부한다', () => {
    expect(() => calcTrimRange(44100, 44100, 2, 3)).toThrow(AudioTrimError);
  });
});

describe('trimChannelData', () => {
  it('지정한 범위로 채널 데이터를 자른다', () => {
    const ch = new Float32Array([0, 1, 2, 3, 4, 5]);
    const [trimmed] = trimChannelData([ch], { startSample: 2, endSample: 5 });
    expect(Array.from(trimmed!)).toEqual([2, 3, 4]);
  });

  it('여러 채널을 동시에 자른다', () => {
    const left = new Float32Array([0, 1, 2, 3]);
    const right = new Float32Array([10, 11, 12, 13]);
    const [trimmedLeft, trimmedRight] = trimChannelData([left, right], {
      startSample: 1,
      endSample: 3,
    });
    expect(Array.from(trimmedLeft!)).toEqual([1, 2]);
    expect(Array.from(trimmedRight!)).toEqual([11, 12]);
  });

  it('채널이 없으면 거부한다', () => {
    expect(() => trimChannelData([], { startSample: 0, endSample: 1 })).toThrow(AudioTrimError);
  });

  it('채널 길이가 서로 다르면 거부한다', () => {
    const a = new Float32Array([0, 1, 2]);
    const b = new Float32Array([0, 1]);
    expect(() => trimChannelData([a, b], { startSample: 0, endSample: 1 })).toThrow(AudioTrimError);
  });

  it('범위가 오디오 길이를 벗어나면 거부한다', () => {
    const ch = new Float32Array([0, 1, 2]);
    expect(() => trimChannelData([ch], { startSample: 0, endSample: 10 })).toThrow(AudioTrimError);
  });

  it('startSample >= endSample 이면 거부한다', () => {
    const ch = new Float32Array([0, 1, 2]);
    expect(() => trimChannelData([ch], { startSample: 2, endSample: 2 })).toThrow(AudioTrimError);
  });
});

function readWavHeader(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const readAscii = (offset: number, length: number): string => {
    let s = '';
    for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
    return s;
  };
  return {
    riff: readAscii(0, 4),
    wave: readAscii(8, 4),
    fmt: readAscii(12, 4),
    audioFormat: view.getUint16(20, true),
    numChannels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    dataChunkId: readAscii(36, 4),
    dataSize: view.getUint32(40, true),
  };
}

describe('encodeWav', () => {
  it('올바른 RIFF/WAVE 헤더를 만든다 (모노)', () => {
    const channel = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const buffer = encodeWav([channel], 44100);
    const header = readWavHeader(buffer);

    expect(header.riff).toBe('RIFF');
    expect(header.wave).toBe('WAVE');
    expect(header.fmt).toBe('fmt ');
    expect(header.audioFormat).toBe(1);
    expect(header.numChannels).toBe(1);
    expect(header.sampleRate).toBe(44100);
    expect(header.bitsPerSample).toBe(16);
    expect(header.blockAlign).toBe(2);
    expect(header.byteRate).toBe(44100 * 2);
    expect(header.dataChunkId).toBe('data');
    expect(header.dataSize).toBe(channel.length * 2);
    expect(buffer.byteLength).toBe(44 + channel.length * 2);
  });

  it('스테레오 채널의 데이터 크기와 blockAlign 이 두 배가 된다', () => {
    const left = new Float32Array([0, 0.25, -0.25]);
    const right = new Float32Array([0, -0.25, 0.25]);
    const buffer = encodeWav([left, right], 48000);
    const header = readWavHeader(buffer);

    expect(header.numChannels).toBe(2);
    expect(header.sampleRate).toBe(48000);
    expect(header.blockAlign).toBe(4);
    expect(header.byteRate).toBe(48000 * 4);
    expect(header.dataSize).toBe(left.length * 4);
    expect(buffer.byteLength).toBe(44 + left.length * 4);
  });

  it('샘플 값을 16bit 정수로 정확히 인코딩한다', () => {
    const channel = new Float32Array([0, 1, -1]);
    const buffer = encodeWav([channel], 44100);
    const view = new DataView(buffer);

    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
  });

  it('범위를 벗어난 샘플은 예외 없이 -1~1 로 clamp 한다', () => {
    const channel = new Float32Array([2, -2, 1.5, -1.5]);
    const buffer = encodeWav([channel], 44100);
    const view = new DataView(buffer);

    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
    expect(view.getInt16(48, true)).toBe(0x7fff);
    expect(view.getInt16(50, true)).toBe(-0x8000);
  });

  it('NaN 샘플은 예외 없이 0 으로 처리한다', () => {
    const channel = new Float32Array([Number.NaN]);
    const buffer = encodeWav([channel], 44100);
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(0);
  });

  it('채널이 없으면 거부한다', () => {
    expect(() => encodeWav([], 44100)).toThrow(AudioTrimError);
  });

  it('채널 길이가 서로 다르면 거부한다', () => {
    const a = new Float32Array([0, 1, 2]);
    const b = new Float32Array([0, 1]);
    expect(() => encodeWav([a, b], 44100)).toThrow(AudioTrimError);
  });

  it('sampleRate 가 0 이하거나 정수가 아니면 거부한다', () => {
    const channel = new Float32Array([0]);
    expect(() => encodeWav([channel], 0)).toThrow(AudioTrimError);
    expect(() => encodeWav([channel], -44100)).toThrow(AudioTrimError);
    expect(() => encodeWav([channel], 44100.5)).toThrow(AudioTrimError);
  });
});
