import { test, expect, type Page } from '@playwright/test';

async function openToolViaPalette(page: Page, keyword: string, title: string) {
  await page.getByRole('button', { name: /搜索工具/ }).click();
  await page.getByPlaceholder('搜索工具…').fill(keyword);
  await page.locator('#commandList button', { hasText: title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
}

test.describe('Tier 4: Real-World Application Scenarios & Workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('scenario 1: comprehensive developer workflow (JSON Format -> JSON to TS -> Base64 -> Diff)', async ({ page }) => {
    const rawApiPayload = JSON.stringify({
      userId: 42,
      accountName: 'developer_alpha',
      isEnabled: true,
      roles: ['admin', 'maintainer'],
      metadata: { region: 'us-west', quota: 1000 },
    });

    // 1. JSON Format: Format and validate API response
    await openToolViaPalette(page, 'JSON', 'JSON 格式化');
    await page.getByRole('button', { name: '文本', exact: true }).click();
    await page.locator('#jsonInput').fill(rawApiPayload);
    await page.getByRole('button', { name: '格式化', exact: true }).click();

    const formattedOutput = await page.locator('#jsonOutput').inputValue();
    expect(formattedOutput).toContain('"accountName": "developer_alpha"');
    expect(formattedOutput).toContain('"quota": 1000');

    // 2. JSON to TS: Derive TypeScript interface types from formatted JSON
    await openToolViaPalette(page, 'TypeScript', 'JSON 转 TypeScript');
    const tsInputArea = page.getByPlaceholder('在此粘贴或输入 JSON 数据…');
    await tsInputArea.fill(formattedOutput);
    await page.getByRole('button', { name: '生成 TS 类型', exact: true }).click();

    const tsOutput = await page.getByPlaceholder('点击上方「生成 TS 类型」后展示…').inputValue();
    expect(tsOutput).toContain('export interface RootObject');
    expect(tsOutput).toContain('userId: number;');
    expect(tsOutput).toContain('accountName: string;');
    expect(tsOutput).toContain('roles: string[];');

    // 3. Base64: Encode payload for transport and verify reversible decoding
    await openToolViaPalette(page, 'Base64', 'Base64');
    const base64Input = page.getByPlaceholder('输入文本或 Base64 字符串…');
    await base64Input.fill(formattedOutput);
    await page.getByRole('button', { name: 'Base64 编码', exact: true }).click();

    const encodedString = await page.getByPlaceholder('编码或解码结果…').inputValue();
    expect(encodedString.length).toBeGreaterThan(20);

    // Verify roundtrip decode
    await base64Input.fill(encodedString);
    await page.getByRole('button', { name: 'Base64 解码', exact: true }).click();
    await expect(page.getByPlaceholder('编码或解码结果…')).toHaveValue(formattedOutput);

    // 4. Text Diff: Compare original payload vs updated patch
    await openToolViaPalette(page, '对比', '文本 / JSON 对比');
    const modifiedPayload = formattedOutput.replace('"quota": 1000', '"quota": 5000,\n    "tier": "enterprise"');

    await page.getByPlaceholder('在此粘贴原始文本或 JSON…').fill(formattedOutput);
    await page.getByPlaceholder('在此粘贴变更后的文本或 JSON…').fill(modifiedPayload);
    await page.getByRole('button', { name: '对比差异', exact: true }).click();

    // Verify diff output reflects additions and deletions
    await expect(page.getByText(/行新增/)).toBeVisible();
    await expect(page.getByText(/行删除/)).toBeVisible();
  });

  test('scenario 2: auth & cryptographic pipeline (JWT Decode -> Crypto Hash -> QR Code)', async ({ page }) => {
    // 1. JWT: Inspect header and claims
    await openToolViaPalette(page, 'JWT', 'JWT 解码');
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzk5OSIsImlzcyI6ImF1dGgtc2VydmljZSIsInJvbGVzIjpbInN5c2FkbWluIl0sImV4cCI6MTc5MDAwMDAwMH0.signature';
    await page.getByPlaceholder('粘贴 JWT 字符串（三段式，以 . 分隔）…').fill(token);

    await expect(page.locator('pre').first()).toContainText('HS256');
    await expect(page.locator('pre').nth(1)).toContainText('user_999');
    await expect(page.locator('pre').nth(1)).toContainText('sysadmin');

    // 2. Hash: Generate cryptographic checksums
    await openToolViaPalette(page, '哈希', '哈希');
    const secretKey = 'OmniToolboxSecurePayloadSignatureKey';
    await page.getByPlaceholder('输入要计算哈希的文本…').fill(secretKey);

    // Verify SHA-256 and SHA-1 computed
    const hashElements = page.locator('p.font-mono.text-xs.break-all');
    await expect(hashElements.first()).toHaveText(/^[0-9a-f]{64}$/); // SHA-256 is 64 hex chars
    await expect(hashElements.nth(1)).toHaveText(/^[0-9a-f]{40}$/); // SHA-1 is 40 hex chars

    // 3. QR Code: Generate QR Code for sharing
    await openToolViaPalette(page, '二维码', '二维码');
    const authUrl = 'https://toolbox.local/auth?session=user_999';
    await page.getByPlaceholder('输入网址或任意文字…').fill(authUrl);

    // Verify QR code image generated
    const qrImg = page.locator('img[alt="QR Code"]');
    await expect(qrImg).toBeVisible();
    await expect(page.getByRole('button', { name: '下载二维码' })).toBeVisible();
  });

  test('scenario 3: media pipeline configuration & workspace reset', async ({ page }) => {
    // Open Image Convert
    await openToolViaPalette(page, '图片格式转换', '图片格式转换');

    // Attach file
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'product-photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('mock-png-data'),
    });

    await expect(page.getByRole('heading', { name: /文件列表 \(1\)/ })).toBeVisible();

    // Select WebP format and custom name pattern
    const formatSelect = page.locator('#optFormat');
    await formatSelect.click();
    await page.getByRole('option', { name: 'WebP' }).click();

    await page.getByPlaceholder('{name}').fill('{name}-optimized');

    // Clear workbench
    const clearBtn = page.getByRole('main').getByRole('button', { name: '清空' });
    await clearBtn.click();

    // Verify workbench is cleanly reset
    await expect(page.getByRole('heading', { name: /文件列表/ })).toHaveCount(0);
    await expect(page.getByText('点击选择或拖拽文件到此处')).toBeVisible();
  });
});
