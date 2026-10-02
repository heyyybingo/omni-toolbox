import { test, expect, type Page } from '@playwright/test';

// Helper to switch tools via Command Palette
async function switchToolViaPalette(page: Page, keyword: string, toolTitle: string) {
  await page.getByRole('button', { name: /搜索工具/ }).click();
  const searchInput = page.getByPlaceholder('搜索工具…');
  await searchInput.fill(keyword);
  const toolButton = page.locator('#commandList button', { hasText: toolTitle });
  await expect(toolButton).toBeVisible();
  await toolButton.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(toolTitle);
}

// Helper to switch tools via Sidebar
async function switchToolViaSidebar(page: Page, toolTitle: string) {
  const sidebarBtn = page.locator('aside button', { hasText: toolTitle });
  await sidebarBtn.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(toolTitle);
}

test.describe('Tier 1: Core Navigation & Group Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('navigates across all 7 tool groups via sidebar and command palette', async ({ page }) => {
    // 1. Group: 图片 (Image) - Default tool
    await expect(page.getByRole('heading', { level: 1 })).toContainText('图片格式转换');
    await switchToolViaSidebar(page, '图片缩放');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('图片缩放');

    // 2. Group: PDF - Switch via Sidebar
    await switchToolViaSidebar(page, 'PDF 拼接');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('PDF 拼接');

    // 3. Group: 音频 (Audio) - Switch via Palette
    await switchToolViaPalette(page, '音频', '音频转换');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('音频转换');

    // 4. Group: 视频 (Video) - Switch via Palette
    await switchToolViaPalette(page, '视频', '视频封面');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('视频封面');

    // 5. Group: 数据 (Data) - Switch via Sidebar
    await switchToolViaSidebar(page, 'JSON ↔ CSV');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('JSON ↔ CSV');

    // 6. Group: 开发 (Dev) - Switch via Palette
    await switchToolViaPalette(page, 'Base64', 'Base64');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Base64');

    // 7. Group: 文档 (Docs) - Switch via Palette
    await switchToolViaPalette(page, 'OCR', 'OCR 提取文字');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('OCR 提取文字');
  });

  test('interacts with file upload and verifies file list stage', async ({ page }) => {
    await switchToolViaSidebar(page, '图片格式转换');

    // Attach file using the file input
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'banner-test.png',
      mimeType: 'image/png',
      buffer: Buffer.from('test-image-binary-payload'),
    });

    // File card should appear
    await expect(page.getByRole('heading', { name: /文件列表 \(1\)/ })).toBeVisible();
    await expect(page.getByRole('paragraph').filter({ hasText: 'banner-test.png' })).toBeVisible();

    // Verify "继续添加" button is rendered
    await expect(page.getByRole('button', { name: '继续添加' })).toBeVisible();

    // Verify Main CTA reflects the pending file count
    const ctaButton = page.getByRole('button', { name: /开始处理 \(1\)/ });
    await expect(ctaButton).toBeVisible();
    await expect(ctaButton).toBeEnabled();
  });

  test('edits parameters across different tool types (select, inputs, sliders)', async ({ page }) => {
    // 1. Image Convert: Select format
    await switchToolViaSidebar(page, '图片格式转换');
    const formatSelect = page.locator('#optFormat');
    await formatSelect.click();
    await page.getByRole('option', { name: 'WebP' }).click();
    await expect(formatSelect).toContainText('WebP');

    // Edit rename pattern
    const renameInput = page.getByPlaceholder('{name}');
    await renameInput.fill('{name}-opt');
    await expect(renameInput).toHaveValue('{name}-opt');

    // 2. Audio Convert: Select audio export format
    await switchToolViaPalette(page, '音频', '音频转换');
    const audioSelect = page.getByRole('combobox').filter({ hasText: 'WAV' });
    await audioSelect.click();
    await page.getByRole('option', { name: 'MP3' }).click();
    await expect(page.getByRole('combobox').filter({ hasText: 'MP3' })).toBeVisible();

    // 3. Document OCR: Select language pack
    await switchToolViaPalette(page, 'OCR', 'OCR 提取文字');
    const ocrSelect = page.getByRole('combobox').filter({ hasText: 'English' });
    await ocrSelect.click();
    await page.getByRole('option', { name: '简体中文' }).click();
    await expect(page.getByRole('combobox').filter({ hasText: '简体中文' })).toBeVisible();
  });

  test('triggers actions in reactive L4 developer tools', async ({ page }) => {
    // UUID tool
    await switchToolViaPalette(page, 'UUID', 'UUID');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('UUID');
    const countInput = page.locator('input[type="number"]');
    await countInput.fill('3');
    await page.getByRole('button', { name: '生成 UUID', exact: true }).click();

    // Should display 3 generated UUID items
    const uuidEntries = page.locator('span.select-all');
    await expect(uuidEntries).toHaveCount(3);
    const firstUuid = await uuidEntries.first().innerText();
    expect(firstUuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
