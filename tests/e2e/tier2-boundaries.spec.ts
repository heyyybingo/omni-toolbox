import { test, expect, type Page } from '@playwright/test';

async function openToolViaPalette(page: Page, keyword: string, title: string) {
  await page.getByRole('button', { name: /搜索工具/ }).click();
  await page.getByPlaceholder('搜索工具…').fill(keyword);
  await page.locator('#commandList button', { hasText: title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
}

test.describe('Tier 2: Boundary & Edge Condition Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('json-format handles empty inputs and syntax errors gracefully', async ({ page }) => {
    await openToolViaPalette(page, 'JSON', 'JSON 格式化');

    // Switch to text mode
    await page.getByRole('button', { name: '文本', exact: true }).click();
    const inputArea = page.locator('#jsonInput');
    await inputArea.fill('');

    // Trigger format with empty input
    await page.getByRole('button', { name: '格式化', exact: true }).click();
    await expect(page.getByText('格式化失败')).toBeVisible();

    // Fill malformed JSON and click validate
    await inputArea.fill('{"missing_quote: 123');
    await page.getByRole('button', { name: '校验', exact: true }).click();
    await expect(page.getByText('校验失败')).toBeVisible();
  });

  test('base64 handles special UTF-8 characters and invalid decode strings', async ({ page }) => {
    await openToolViaPalette(page, 'Base64', 'Base64');

    const inputArea = page.getByPlaceholder('输入文本或 Base64 字符串…');
    const outputArea = page.getByPlaceholder('编码或解码结果…');

    // Special multi-byte UTF-8, Chinese & Emoji characters
    const specialText = 'Hello 世界 🚀 %&#+=?';
    await inputArea.fill(specialText);
    await page.getByRole('button', { name: 'Base64 编码', exact: true }).click();

    await expect(page.getByText('编码完成')).toBeVisible();
    const encodedVal = await outputArea.inputValue();
    expect(encodedVal.length).toBeGreaterThan(0);

    // Decode the result back
    await inputArea.fill(encodedVal);
    await page.getByRole('button', { name: 'Base64 解码', exact: true }).click();
    await expect(page.getByText('解码完成')).toBeVisible();
    await expect(outputArea).toHaveValue(specialText);

    // Malformed base64 decode input
    await inputArea.fill('%%%This is definitely not valid base64!!!%%%');
    await page.getByRole('button', { name: 'Base64 解码', exact: true }).click();
    await expect(page.getByText('解码失败')).toBeVisible();
  });

  test('uuid boundary clamping for zero and extreme counts', async ({ page }) => {
    await openToolViaPalette(page, 'UUID', 'UUID');

    const countInput = page.locator('input[type="number"]');

    // Boundary: 0 (should clamp to at least 1)
    await countInput.fill('0');
    await page.getByRole('button', { name: '生成 UUID', exact: true }).click();
    await expect(page.locator('span.select-all')).toHaveCount(1);

    // Boundary: 999 (should clamp to upper bound 50)
    await countInput.fill('999');
    await page.getByRole('button', { name: '生成 UUID', exact: true }).click();
    await expect(page.locator('span.select-all')).toHaveCount(50);
  });

  test('timestamp converter handles epoch zero and invalid inputs', async ({ page }) => {
    await openToolViaPalette(page, '时间戳', '时间戳');

    const tsInput = page.getByPlaceholder('输入秒或毫秒 (如 1727673600)');
    const resultBox = page.locator('text=转换结果:');

    // Epoch timestamp 0
    await tsInput.fill('0');
    // For 0 or empty, output displays placeholder '—'
    await expect(resultBox).toContainText('—');

    // Valid epoch seconds: 1700000000 -> Nov 14 2023 / 15 2023
    await tsInput.fill('1700000000');
    await expect(resultBox).toContainText('2023');

    // Non-numeric string
    await tsInput.fill('invalid-number');
    await expect(resultBox).toContainText('—');
  });

  test('jwt decoder handles malformed tokens and extracts valid payload', async ({ page }) => {
    await openToolViaPalette(page, 'JWT', 'JWT 解码');

    const jwtInput = page.getByPlaceholder('粘贴 JWT 字符串（三段式，以 . 分隔）…');

    // Malformed token without dots
    await jwtInput.fill('malformed-token-without-signature');
    await expect(page.locator('pre').first()).toHaveText('—');
    await expect(page.locator('pre').nth(1)).toHaveText('—');

    // Valid sample JWT token
    const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvZWwiLCJpYXQiOjE1MTYyMzkwMjJ9.4flKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    await jwtInput.fill(sampleToken);
    await expect(page.locator('pre').first()).toContainText('HS256');
    await expect(page.locator('pre').nth(1)).toContainText('Joel');
  });

  test('text-diff handles identical inputs and extreme variance', async ({ page }) => {
    await openToolViaPalette(page, '对比', '文本 / JSON 对比');

    const textareas = page.locator('textarea');
    const originalPane = textareas.nth(0);
    const modifiedPane = textareas.nth(1);

    // Identical text
    await originalPane.fill('Line 1\nLine 2\nLine 3');
    await modifiedPane.fill('Line 1\nLine 2\nLine 3');
    await page.getByRole('button', { name: '对比差异', exact: true }).click();
    await expect(page.getByText('0 行新增')).toBeVisible();
    await expect(page.getByText('0 行删除')).toBeVisible();

    // Completely disparate text
    await modifiedPane.fill('Completely Different Content\nWith New Data');
    await page.getByRole('button', { name: '对比差异', exact: true }).click();
    await expect(page.getByText(/2 行新增/)).toBeVisible();
    await expect(page.getByText(/3 行删除/)).toBeVisible();
  });
});
