import type { Tool } from '../types';

export default {
  slug: 'json-formatter',
  name: 'JSON 포맷터',
  description:
    'JSON 을 보기 좋게 정렬하거나 한 줄로 압축합니다. 잘못된 JSON 은 원인을 알려줍니다.',
} satisfies Tool;
