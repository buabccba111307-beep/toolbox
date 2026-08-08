import type { Tool } from '../types';

export default {
  slug: 'exif-strip',
  name: '사진 GPS/EXIF 제거',
  description: 'JPEG 사진의 GPS 위치·촬영 기기 등 EXIF 메타데이터를 확인하고 제거합니다.',
} satisfies Tool;
