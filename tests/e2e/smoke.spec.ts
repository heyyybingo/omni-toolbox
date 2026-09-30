import { test, expect } from '@playwright/test';

async function openJsonTool(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /搜索工具/ }).click();
  await page.getByPlaceholder('搜索工具…').fill('JSON');
  await page.locator('#commandList button', { hasText: 'JSON 格式化' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('JSON');
}

test.describe('Toolbox smoke', () => {
  test('loads shell and switches tools via command palette', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('图片格式转换');
    await openJsonTool(page);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('JSON');
  });

  test('json format tool formats text', async ({ page }) => {
    await openJsonTool(page);
    await page.locator('#jsonInput').fill('{"b":2,"a":1}');
    await page.getByRole('button', { name: '文本', exact: true }).click();
    await page.getByRole('button', { name: '格式化', exact: true }).click();
    await expect(page.locator('#jsonOutput')).toContainText('"b": 2');
  });

  test('inspector is hidden by default', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('画质预览')).toHaveCount(0);
    await expect(page.getByText('页面预览')).toHaveCount(0);
  });

  test('command palette closes when clicking backdrop outside content', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /搜索工具/ }).click();
    const dialog = page.getByRole('dialog', { name: '搜索工具' });
    await expect(dialog).toBeVisible();
    
    // Click on backdrop outside dialog (top left)
    await page.mouse.click(20, 20);
    await expect(dialog).toHaveCount(0);
  });

  test('file list has proper top padding when files exist', async ({ page }) => {
    await page.goto('/');
    // Attach dummy file
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('dummy-image-data'),
    });

    await expect(page.getByRole('heading', { name: /文件列表/ })).toBeVisible();
    const content = page.locator('.space-y-2').filter({ hasText: 'test.jpg' });
    await expect(content).toBeVisible();

    const paddingTop = await content.evaluate((el) => window.getComputedStyle(el).paddingTop);
    expect(paddingTop).toBe('16px');
  });

  test('clear button is unique in workbench and resets tool', async ({ page }) => {
    await page.goto('/');
    // Attach dummy file
    await page.locator('input[type="file"]').setInputFiles({
      name: 'test.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('dummy-image-data'),
    });

    await expect(page.getByRole('heading', { name: /文件列表/ })).toBeVisible();

    // Verify there is only one "清空" button in the workbench (in the header)
    const clearButtons = page.getByRole('main').getByRole('button', { name: '清空' });
    await expect(clearButtons).toHaveCount(1);

    // Verify redundant "清空文件" button does not exist
    await expect(page.getByRole('button', { name: '清空文件' })).toHaveCount(0);

    // Click the clear button and verify files are cleared
    await clearButtons.click();
    await expect(page.getByRole('heading', { name: /文件列表/ })).toHaveCount(0);
    await expect(page.getByText('点击选择或拖拽文件到此处')).toBeVisible();
  });

  test('live preview calibration panel renders inside parameters card for visual tools', async ({ page }) => {
    await page.goto('/');
    // Attach valid 1x1 transparent png file
    const samplePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: samplePng,
    });

    // Check that live calibration panel appears inside the parameters card
    await expect(page.getByText('实时效果校准', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '参数设置与实时效果校准' })).toBeVisible();

    // Verify A/B mode buttons exist
    await expect(page.getByRole('button', { name: '效果图', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '原图', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '对比', exact: true })).toBeVisible();
  });

  test('standardized Select and Dropzone components conform to workbench spec', async ({ page }) => {
    await page.goto('/');

    // Verify Dropzone component attributes
    const dropzone = page.locator('div[role="button"]').filter({ hasText: '点击选择或拖拽文件到此处' });
    await expect(dropzone).toBeVisible();
    await expect(dropzone).toHaveAttribute('tabindex', '0');

    // Verify system Select component in parameters
    const formatSelect = page.locator('#optFormat');
    await expect(formatSelect).toBeVisible();
    await expect(formatSelect).toHaveAttribute('role', 'combobox');

    // Click to open system select menu and choose WebP
    await formatSelect.click();
    const listbox = page.locator('div[role="listbox"]');
    await expect(listbox).toBeVisible();
    await page.getByRole('option', { name: 'WebP' }).click();
    await expect(formatSelect).toContainText('WebP');
  });

  test('dark mode applies color-scheme and dark theme properly', async ({ page }) => {
    await page.goto('/');

    // Initial light mode color-scheme
    const initialScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(initialScheme).toBe('light');

    // Click theme toggle button to switch to dark mode
    const themeBtn = page.getByTitle(/切换暗色模式/);
    await themeBtn.click();

    // Verify html tag has data-theme="dark" and color-scheme is dark
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const darkScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(darkScheme).toBe('dark');
  });

  test('json-yaml tool converts JSON to YAML and back', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /搜索工具/ }).click();
    await page.getByPlaceholder('搜索工具…').fill('YAML');
    await page.locator('#commandList button', { hasText: 'JSON ↔ YAML' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('JSON ↔ YAML');

    // Click 转换 button
    await page.getByRole('button', { name: '转换', exact: true }).click();
    // Verify output textarea contains YAML format
    const outputArea = page.getByPlaceholder('转换结果将在此处展示…');
    await expect(outputArea).toHaveValue(/name: toolbox/);

    // Click 互换 to swap input and output
    await page.getByRole('button', { name: '互换', exact: true }).click();
    await expect(page.getByPlaceholder('在此粘贴或输入 YAML…')).toHaveValue(/name: toolbox/);
  });

  test('json-to-ts tool generates TypeScript interfaces', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /搜索工具/ }).click();
    await page.getByPlaceholder('搜索工具…').fill('TypeScript');
    await page.locator('#commandList button', { hasText: 'JSON 转 TypeScript' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('JSON 转 TypeScript');

    // Click 生成 TS 类型 button
    await page.getByRole('button', { name: '生成 TS 类型', exact: true }).click();
    const outputArea = page.getByPlaceholder('点击上方「生成 TS 类型」后展示…');
    await expect(outputArea).toHaveValue(/export interface RootObject/);
    await expect(outputArea).toHaveValue(/title: string;/);
  });

  test('text-diff tool compares text differences', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /搜索工具/ }).click();
    await page.getByPlaceholder('搜索工具…').fill('对比');
    await page.locator('#commandList button', { hasText: '文本 / JSON 对比' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('文本 / JSON 对比');

    // Click 对比差异 button
    await page.getByRole('button', { name: '对比差异', exact: true }).click();
    // Verify diff output lines and badges exist
    await expect(page.getByText(/行新增/)).toBeVisible();
    await expect(page.getByText(/行删除/)).toBeVisible();
  });

  test('regex-tester tool matches expressions with real-time feedback', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /搜索工具/ }).click();
    await page.getByPlaceholder('搜索工具…').fill('正则');
    await page.locator('#commandList button', { hasText: '正则表达式测试' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('正则表达式测试');

    // By default sample email regex and test text match emails
    await expect(page.getByText(/匹配到 \d+ 处/)).toBeVisible();
    await expect(page.getByRole('cell', { name: 'support@company.com' })).toBeVisible();

    // Toggle replace mode
    await page.getByRole('button', { name: '开启文本替换' }).click();
    await expect(page.getByText('替换结果预览')).toBeVisible();
    await expect(page.locator('textarea[readonly]')).toHaveValue(/masked_email/);
  });

  test('favicon-gen and image-exif-view tools load in workbench', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /搜索工具/ }).click();
    await page.getByPlaceholder('搜索工具…').fill('Favicon');
    await page.locator('#commandList button', { hasText: 'Favicon / 应用图标生成' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Favicon / 应用图标生成');
    await expect(page.getByText('将为上传的图像一键生成 Web 与移动端全套标准尺寸图标')).toBeVisible();

    await page.getByRole('button', { name: /搜索工具/ }).click();
    await page.getByPlaceholder('搜索工具…').fill('EXIF');
    await page.locator('#commandList button', { hasText: 'EXIF 参数检视' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('EXIF 参数检视');
    await expect(page.getByText('请先在上方拖入或选择包含拍摄信息的图片')).toBeVisible();
  });
});
