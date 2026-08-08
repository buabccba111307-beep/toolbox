// id-photo e2e 테스트용 샘플 이미지를 실행 시점에 생성합니다.
// 바이너리 픽스처 파일을 저장소에 두는 대신, 외부 의존성 없이(Node 내장 zlib 만 사용)
// 유효한 PNG 바이트를 직접 조립합니다.
import { deflateSync } from 'node:zlib';

let crcTable: Uint32Array | null = null;

function crc32(buf: Buffer): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** width x height 크기의 단색 배경 + 원 하나짜리 RGB PNG 를 만듭니다. */
export function createSamplePng(width = 800, height = 1000): Buffer {
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: RGB
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = pngChunk('IHDR', ihdrData);

  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  const cx = width / 2;
  const cy = height * 0.42;
  const r = Math.min(width, height) * 0.22;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inFace = dx * dx + dy * dy < r * r;
      if (inFace) {
        raw[offset++] = 240;
        raw[offset++] = 200;
        raw[offset++] = 170;
      } else {
        raw[offset++] = Math.floor((x / width) * 100) + 100;
        raw[offset++] = Math.floor((y / height) * 100) + 120;
        raw[offset++] = 200;
      }
    }
  }

  const idat = pngChunk('IDAT', deflateSync(raw));
  const iend = pngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([PNG_SIGNATURE, ihdr, idat, iend]);
}

/** PNG 바이트에서 IHDR 청크의 width/height 를 읽습니다. */
export function readPngSize(buf: Buffer): { width: number; height: number } {
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}
