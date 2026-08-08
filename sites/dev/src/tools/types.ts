/** 도구 하나의 메타데이터. 목록 페이지가 이 정보로 카드를 그린다. */
export interface Tool {
  /** URL 슬러그. src/pages/tools/<slug>.astro 와 일치해야 한다. */
  slug: string;
  /** 목록에 표시할 이름 */
  name: string;
  /** 한 줄 설명. 무엇을 해주는지 구체적으로 쓴다. */
  description: string;
}
