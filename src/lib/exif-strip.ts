/**
 * JPEG EXIF(APP1) 파싱 및 제거 로직.
 *
 * DOM·File API 에 의존하지 않는 순수 함수로 둡니다. 바이트열만 있으면
 * Vitest 에서 즉시 검증할 수 있고, 브라우저에서는 File.arrayBuffer() 결과를
 * 그대로 넘기면 됩니다.
 */

export interface ExifGps {
  lat: number;
  lon: number;
}

export interface ExifSummary {
  hasExif: boolean;
  hasGps: boolean;
  gps?: ExifGps;
  dateTime?: string;
  make?: string;
  model?: string;
}

export class ExifParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExifParseError';
  }
}

const MARKER_APP1 = 0xffe1;
const MARKER_SOS = 0xffda;
const MARKER_EOI = 0xffd9;

const EXIF_SIGNATURE = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

interface JpegSegment {
  marker: number;
  start: number;
  dataStart: number;
  dataLength: number;
  totalLength: number;
}

interface WalkResult {
  segments: JpegSegment[];
  tailStart: number;
}

/** JPEG 를 마커 세그먼트 단위로 순회합니다. SOS/EOI 를 만나면 멈춥니다. */
function walkSegments(bytes: Uint8Array): WalkResult {
  if (bytes.length < 4) {
    throw new ExifParseError('파일이 너무 작아 JPEG 로 읽을 수 없습니다.');
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new ExifParseError('JPEG 파일이 아닙니다 (SOI 마커 없음).');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const segments: JpegSegment[] = [];
  let offset = 2;

  for (;;) {
    if (offset + 2 > bytes.length) {
      throw new ExifParseError('JPEG 마커가 파일 끝에서 잘렸습니다.');
    }
    if (bytes[offset] !== 0xff) {
      throw new ExifParseError('잘못된 JPEG 마커입니다.');
    }
    const markerByte = bytes[offset + 1] ?? 0;
    const marker = 0xff00 | markerByte;
    const start = offset;

    if (marker === MARKER_SOS || marker === MARKER_EOI) {
      return { segments, tailStart: start };
    }

    offset += 2;

    // 표준 독립 마커(TEM, RST0-7)는 길이·데이터가 없습니다.
    if (markerByte === 0x01 || (markerByte >= 0xd0 && markerByte <= 0xd7)) {
      continue;
    }

    if (offset + 2 > bytes.length) {
      throw new ExifParseError('JPEG 세그먼트 길이 필드가 파일 끝에서 잘렸습니다.');
    }
    const length = view.getUint16(offset, false);
    if (length < 2) {
      throw new ExifParseError('잘못된 JPEG 세그먼트 길이입니다.');
    }
    const dataStart = offset + 2;
    const dataLength = length - 2;
    if (dataStart + dataLength > bytes.length) {
      throw new ExifParseError('JPEG 세그먼트 길이가 파일 끝을 넘어갑니다 (손상된 파일).');
    }

    segments.push({ marker, start, dataStart, dataLength, totalLength: dataStart + dataLength - start });
    offset = dataStart + dataLength;
  }
}

function isExifSignature(bytes: Uint8Array, dataStart: number, dataLength: number): boolean {
  if (dataLength < EXIF_SIGNATURE.length) return false;
  for (let i = 0; i < EXIF_SIGNATURE.length; i++) {
    if (bytes[dataStart + i] !== EXIF_SIGNATURE[i]) return false;
  }
  return true;
}

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  entryOffset: number;
}

function typeSize(type: number): number {
  switch (type) {
    case 1: // BYTE
    case 2: // ASCII
    case 6: // SBYTE
    case 7: // UNDEFINED
      return 1;
    case 3: // SHORT
    case 8: // SSHORT
      return 2;
    case 4: // LONG
    case 9: // SLONG
    case 11: // FLOAT
      return 4;
    case 5: // RATIONAL
    case 10: // SRATIONAL
    case 12: // DOUBLE
      return 8;
    default:
      return 1;
  }
}

function readIfdEntries(
  view: DataView,
  bytes: Uint8Array,
  ifdAbs: number,
  littleEndian: boolean
): IfdEntry[] {
  const count = view.getUint16(ifdAbs, littleEndian);
  const entries: IfdEntry[] = [];
  let offset = ifdAbs + 2;
  for (let i = 0; i < count; i++) {
    if (offset + 12 > bytes.length) break;
    entries.push({
      tag: view.getUint16(offset, littleEndian),
      type: view.getUint16(offset + 2, littleEndian),
      count: view.getUint32(offset + 4, littleEndian),
      entryOffset: offset,
    });
    offset += 12;
  }
  return entries;
}

/** 엔트리의 값이 저장된 절대 바이트 위치와 길이를 계산합니다. */
function getValueRange(
  view: DataView,
  bytes: Uint8Array,
  tiffStart: number,
  entry: IfdEntry,
  littleEndian: boolean
): { start: number; length: number } {
  const length = typeSize(entry.type) * entry.count;
  if (length <= 4) {
    return { start: entry.entryOffset + 8, length };
  }
  const relOffset = view.getUint32(entry.entryOffset + 8, littleEndian);
  const start = tiffStart + relOffset;
  if (start < 0 || start + length > bytes.length) {
    throw new ExifParseError('EXIF 값 오프셋이 파일 범위를 벗어났습니다.');
  }
  return { start, length };
}

function readAsciiValue(
  view: DataView,
  bytes: Uint8Array,
  tiffStart: number,
  entry: IfdEntry,
  littleEndian: boolean
): string {
  const { start, length } = getValueRange(view, bytes, tiffStart, entry, littleEndian);
  let result = '';
  for (let i = 0; i < length; i++) {
    const code = bytes[start + i] ?? 0;
    if (code === 0) break;
    result += String.fromCharCode(code);
  }
  return result.trim();
}

function readRational(view: DataView, offset: number, littleEndian: boolean): number {
  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);
  if (denominator === 0) return NaN;
  return numerator / denominator;
}

function readGpsCoordinate(
  view: DataView,
  bytes: Uint8Array,
  tiffStart: number,
  entry: IfdEntry,
  littleEndian: boolean
): number {
  const { start } = getValueRange(view, bytes, tiffStart, entry, littleEndian);
  const deg = readRational(view, start, littleEndian);
  const min = readRational(view, start + 8, littleEndian);
  const sec = readRational(view, start + 16, littleEndian);
  return deg + min / 60 + sec / 3600;
}

/** GPS IFD 를 읽어 좌표를 반환합니다. 손상된 경우 예외 없이 null 을 돌려줍니다. */
function tryReadGps(
  view: DataView,
  bytes: Uint8Array,
  tiffStart: number,
  gpsAbs: number,
  littleEndian: boolean
): ExifGps | null {
  try {
    if (gpsAbs < 0 || gpsAbs + 2 > bytes.length) return null;
    const entries = readIfdEntries(view, bytes, gpsAbs, littleEndian);

    let latRef: string | undefined;
    let lonRef: string | undefined;
    let lat: number | undefined;
    let lon: number | undefined;

    for (const entry of entries) {
      try {
        if (entry.tag === 1) latRef = readAsciiValue(view, bytes, tiffStart, entry, littleEndian);
        else if (entry.tag === 2) lat = readGpsCoordinate(view, bytes, tiffStart, entry, littleEndian);
        else if (entry.tag === 3) lonRef = readAsciiValue(view, bytes, tiffStart, entry, littleEndian);
        else if (entry.tag === 4) lon = readGpsCoordinate(view, bytes, tiffStart, entry, littleEndian);
      } catch {
        // 개별 태그가 손상됐어도 나머지 파싱은 계속합니다.
      }
    }

    if (lat === undefined || lon === undefined || !latRef || !lonRef) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const signedLat = latRef.toUpperCase().startsWith('S') ? -lat : lat;
    const signedLon = lonRef.toUpperCase().startsWith('W') ? -lon : lon;
    return { lat: signedLat, lon: signedLon };
  } catch {
    return null;
  }
}

function findExifSegment(bytes: Uint8Array, segments: JpegSegment[]): JpegSegment | undefined {
  return segments.find((seg) => seg.marker === MARKER_APP1 && isExifSignature(bytes, seg.dataStart, seg.dataLength));
}

/**
 * JPEG 바이트열에서 EXIF 요약 정보를 읽습니다.
 * JPEG 가 아니거나 세그먼트 구조가 손상된 경우 ExifParseError 를 던집니다.
 * EXIF 내부 필드(GPS 등)가 개별적으로 손상된 경우는 예외 대신 해당 값만 비웁니다.
 */
export function parseExif(buffer: ArrayBuffer): ExifSummary {
  const bytes = new Uint8Array(buffer);
  const { segments } = walkSegments(bytes);
  const exifSegment = findExifSegment(bytes, segments);

  if (!exifSegment) {
    return { hasExif: false, hasGps: false };
  }

  const summary: ExifSummary = { hasExif: true, hasGps: false };
  const tiffStart = exifSegment.dataStart + EXIF_SIGNATURE.length;

  try {
    if (tiffStart + 8 > bytes.length) throw new ExifParseError('TIFF 헤더가 잘렸습니다.');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const b0 = bytes[tiffStart];
    const b1 = bytes[tiffStart + 1];
    let littleEndian: boolean;
    if (b0 === 0x49 && b1 === 0x49) littleEndian = true;
    else if (b0 === 0x4d && b1 === 0x4d) littleEndian = false;
    else throw new ExifParseError('잘못된 TIFF 바이트 순서입니다.');

    const magic = view.getUint16(tiffStart + 2, littleEndian);
    if (magic !== 42) throw new ExifParseError('잘못된 TIFF 매직 넘버입니다.');

    const ifd0Offset = view.getUint32(tiffStart + 4, littleEndian);
    const ifd0Abs = tiffStart + ifd0Offset;
    if (ifd0Abs < 0 || ifd0Abs + 2 > bytes.length) throw new ExifParseError('IFD0 오프셋이 파일 범위를 벗어났습니다.');

    const entries = readIfdEntries(view, bytes, ifd0Abs, littleEndian);

    for (const entry of entries) {
      try {
        if (entry.tag === 0x010f) {
          summary.make = readAsciiValue(view, bytes, tiffStart, entry, littleEndian);
        } else if (entry.tag === 0x0110) {
          summary.model = readAsciiValue(view, bytes, tiffStart, entry, littleEndian);
        } else if (entry.tag === 0x0132) {
          summary.dateTime = readAsciiValue(view, bytes, tiffStart, entry, littleEndian);
        } else if (entry.tag === 0x8825) {
          const gpsRelOffset = view.getUint32(entry.entryOffset + 8, littleEndian);
          const gps = tryReadGps(view, bytes, tiffStart, tiffStart + gpsRelOffset, littleEndian);
          if (gps) {
            summary.hasGps = true;
            summary.gps = gps;
          }
        }
      } catch {
        // 개별 필드가 손상돼도 나머지 요약 정보는 유지합니다.
      }
    }
  } catch {
    // TIFF 구조 자체가 손상됐어도 EXIF 세그먼트 존재 여부는 이미 확인했으므로
    // hasExif: true 만 유지한 채 나머지 필드 없이 돌려줍니다.
  }

  return summary;
}

/**
 * EXIF(APP1) 세그먼트를 제거한 새 JPEG 바이트열을 돌려줍니다.
 * EXIF 가 없는 JPEG 라면 원본과 동일한 바이트열을 돌려줍니다.
 */
export function stripExif(buffer: ArrayBuffer): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  const { segments, tailStart } = walkSegments(bytes);

  const chunks: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  for (const seg of segments) {
    if (seg.marker === MARKER_APP1 && isExifSignature(bytes, seg.dataStart, seg.dataLength)) {
      continue;
    }
    chunks.push(bytes.subarray(seg.start, seg.start + seg.totalLength));
  }
  chunks.push(bytes.subarray(tailStart));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out.buffer;
}
