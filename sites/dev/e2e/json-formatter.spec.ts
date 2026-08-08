import { test, expect } from '@playwright/test';

// 빌드된 정적 산출물을 대상으로 검증합니다.
// "코드를 작성했다" 가 아니라 "배포될 결과물이 실제로 동작한다" 를 증명하는 게 목적입니다.

test.describe('JSON 포맷터', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/tools/json-formatter/');
  });

  test('페이지가 제목과 함께 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('JSON 포맷터');
  });

  test('정렬 버튼을 누르면 들여쓰기된 JSON 이 나온다', async ({ page }) => {
    await page.getByLabel('JSON 입력').fill('{"a":1,"b":2}');
    await page.getByRole('button', { name: '정렬' }).click();
    await expect(page.getByLabel('결과')).toHaveValue('{\n  "a": 1,\n  "b": 2\n}');
  });

  test('압축 버튼을 누르면 한 줄로 줄어든다', async ({ page }) => {
    await page.getByLabel('JSON 입력').fill('{\n  "a": 1,\n  "b": 2\n}');
    await page.getByRole('button', { name: '압축' }).click();
    await expect(page.getByLabel('결과')).toHaveValue('{"a":1,"b":2}');
  });

  test('들여쓰기 크기를 바꾸면 결과가 다시 계산된다', async ({ page }) => {
    await page.getByLabel('JSON 입력').fill('{"a":1}');
    await page.getByLabel('들여쓰기').selectOption('4');
    await page.getByRole('button', { name: '정렬' }).click();
    await expect(page.getByLabel('결과')).toHaveValue('{\n    "a": 1\n}');
  });

  test('키 정렬 옵션을 켜면 키가 알파벳 순으로 정렬된다', async ({ page }) => {
    await page.getByLabel('JSON 입력').fill('{"b":1,"a":2}');
    await page.getByLabel('키 정렬 (재귀적)').check();
    await page.getByRole('button', { name: '정렬' }).click();
    await expect(page.getByLabel('결과')).toHaveValue('{\n  "a": 2,\n  "b": 1\n}');
  });

  test('잘못된 JSON 이면 에러 메시지를 보여주고 결과를 비운다', async ({ page }) => {
    await page.getByLabel('JSON 입력').fill('{"a": 1,}');
    await page.getByRole('button', { name: '정렬' }).click();
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expect(page.getByLabel('결과')).toHaveValue('');
  });

  test('입력을 비우면 결과도 비워진다', async ({ page }) => {
    await page.getByLabel('JSON 입력').fill('{"a":1}');
    await page.getByRole('button', { name: '정렬' }).click();
    await page.getByLabel('JSON 입력').fill('');
    await expect(page.getByLabel('결과')).toHaveValue('');
  });

  test('canonical 링크가 설정되어 있다', async ({ page }) => {
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute('href', /\/tools\/json-formatter\/$/);
  });
});
