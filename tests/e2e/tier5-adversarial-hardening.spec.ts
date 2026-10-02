import { test, expect, type Page } from '@playwright/test';

async function openToolViaPalette(page: Page, keyword: string, title: string) {
  await page.getByRole('button', { name: /搜索工具/ }).click();
  await page.getByPlaceholder('搜索工具…').fill(keyword);
  await page.locator('#commandList button', { hasText: title }).first().click();
  await expect(page.getByRole('dialog', { name: '搜索工具' })).toHaveCount(0);
}

test.describe('Tier 5: Adversarial Hardening & Stress Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Test 1: Rapid UI navigation & multi-tab concurrency storm', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    // Rapidly open 20 tools across different categories to stress tab calculation and popover slices
    const toolList = [
      { key: 'JSON', title: 'JSON 格式化' },
      { key: 'Base64', title: 'Base64' },
      { key: 'UUID', title: 'UUID' },
      { key: '时间戳', title: '时间戳' },
      { key: '颜色', title: '颜色转换' },
      { key: 'JWT', title: 'JWT 解码' },
      { key: '二维码', title: '二维码' },
      { key: 'TS', title: 'JSON 转 TypeScript' },
      { key: '对比', title: '文本 / JSON 对比' },
      { key: '正则', title: '正则表达式测试' },
      { key: '缩放', title: '图片缩放' },
      { key: 'EXIF', title: '清除 EXIF' },
      { key: '拼接', title: 'PDF 拼接' },
      { key: '拆分', title: 'PDF 拆分' },
      { key: '旋转', title: 'PDF 旋转' },
      { key: '音频', title: '音频转换' },
      { key: '视频', title: '视频封面' },
      { key: 'CSV', title: 'JSON ↔ CSV' },
      { key: 'YAML', title: 'JSON ↔ YAML' },
      { key: '哈希', title: '哈希' },
    ];

    for (const item of toolList) {
      await openToolViaPalette(page, item.key, item.title);
    }

    // Verify overflow popover button (+N) mounts when visible tab container overflows
    const overflowBtn = page.locator('button[title*="剩余"]');
    await expect(overflowBtn).toBeVisible();

    // Hover over the overflow button to open popover menu
    await overflowBtn.hover();
    const menu = page.locator('div[role="menu"][aria-label="其余页签"]');
    await expect(menu).toBeVisible();

    // Select an item from overflow menu
    const overflowItem = menu.locator('div[role="menuitem"]').first();
    await overflowItem.click();

    // Popover should dismiss cleanly and heading should reflect active tool
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Rapidly switch active tab among visible tabs to verify DOM stability
    const tabContainer = page.locator('div.flex.items-center.gap-1.min-w-0');
    const tabs = tabContainer.locator('> div');
    const tabCount = await tabs.count();
    for (let i = 0; i < Math.min(4, tabCount); i++) {
      await tabs.nth(i).click();
    }

    // Click "全部关闭" to cleanly reset to default initial state
    const closeAllBtn = page.getByRole('button', { name: '全部关闭' });
    await expect(closeAllBtn).toBeVisible();
    await closeAllBtn.click();

    // Verify reset to default tool
    await expect(page.getByRole('heading', { level: 1 })).toContainText('图片格式转换');
    expect(pageErrors).toHaveLength(0);
  });

  test('Test 2: Malformed file inputs & zero-byte error handling', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    // 1. Zero-byte file upload to image-convert
    await page.locator('input[type="file"]').setInputFiles({
      name: 'empty.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(0),
    });

    // File list should render cleanly showing "0 B"
    await expect(page.getByRole('heading', { name: /文件列表/ })).toBeVisible();
    await expect(page.getByText('0 B')).toBeVisible();

    // Trigger execution on empty file
    const ctaBtn = page.getByRole('button', { name: /开始处理/ });
    await expect(ctaBtn).toBeVisible();
    await ctaBtn.click();

    // Allow worker pipeline to process and gracefully complete error handling
    await page.waitForTimeout(600);
    expect(pageErrors).toHaveLength(0);

    // 2. Corrupted file upload with invalid image payload
    const clearBtn = page.getByRole('button', { name: '清空' });
    await clearBtn.click();
    await expect(page.getByText('点击选择或拖拽文件到此处')).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: 'corrupted.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('NOT_A_VALID_JPEG_HEADER_PAYLOAD'),
    });

    await expect(page.getByRole('heading', { name: /文件列表/ })).toBeVisible();
    await page.getByRole('button', { name: /开始处理/ }).click();
    await page.waitForTimeout(600);
    expect(pageErrors).toHaveLength(0);

    // 3. Corrupted non-PDF file upload to pdf-merge
    await openToolViaPalette(page, 'PDF 拼接', 'PDF 拼接');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'corrupted.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nBROKEN_NON_TERMINATED_STREAM'),
    });

    await expect(page.getByRole('heading', { name: /文件列表/ })).toBeVisible();
    await page.getByRole('button', { name: /开始处理/ }).click();
    await page.waitForTimeout(600);
    expect(pageErrors).toHaveLength(0);
  });

  test('Test 3: Oversized text & ReDoS loop bounds verification in developer tools', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    // 1. JSON 格式化: Large 500-object JSON payload
    await openToolViaPalette(page, 'JSON', 'JSON 格式化');
    await page.getByRole('button', { name: '文本', exact: true }).click();

    const largeObj: Record<string, unknown> = {};
    for (let i = 0; i < 500; i++) {
      largeObj[`field_${i}`] = { nested: `val_${i}`, num: i, enabled: i % 2 === 0 };
    }
    const jsonStr = JSON.stringify(largeObj);
    await page.locator('#jsonInput').fill(jsonStr);
    await page.getByRole('button', { name: '格式化', exact: true }).click();

    // Verify formatted output rendered
    await expect(page.locator('#jsonOutput')).toBeVisible();
    const outputVal = await page.locator('#jsonOutput').inputValue();
    expect(outputVal).toContain('"field_0": {');

    // 2. 正则表达式测试: Zero-length lookahead pattern hitting maxIterations=500 guard
    await openToolViaPalette(page, '正则', '正则表达式测试');

    const patternInput = page.getByPlaceholder('在此输入正则表达式…');
    await patternInput.fill('(?=.)');

    const testTextArea = page.getByPlaceholder('在此输入需要测试的文本…');
    await testTextArea.fill('x'.repeat(800));

    // Match count badge should display exactly 500 matches without browser hang
    await expect(page.getByText('匹配到 500 处')).toBeVisible();

    // 3. 文本对比: Multi-line text comparison
    await openToolViaPalette(page, '对比', '文本 / JSON 对比');

    const leftLines = Array.from({ length: 200 }, (_, i) => `Line ${i + 1}`).join('\n');
    const rightLines = Array.from({ length: 200 }, (_, i) => (i === 100 ? 'Modified Line 101' : `Line ${i + 1}`)).join('\n');

    await page.locator('textarea').first().fill(leftLines);
    await page.locator('textarea').nth(1).fill(rightLines);
    await page.getByRole('button', { name: '对比差异', exact: true }).click();

    await expect(page.getByText(/行新增/)).toBeVisible();
    await expect(page.getByText(/行删除/)).toBeVisible();

    expect(pageErrors).toHaveLength(0);
  });

  test('Test 4: Strict zero tolerance for pageerror and unhandled promise rejections across tool sessions', async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    // Cycle through representative tools spanning multiple functional domains
    const sessionTools = [
      { key: '图片缩放', title: '图片缩放' },
      { key: 'Favicon', title: 'Favicon / 应用图标生成' },
      { key: 'PDF 旋转', title: 'PDF 旋转' },
      { key: '音频转换', title: '音频转换' },
      { key: '视频封面', title: '视频封面' },
      { key: 'JSON ↔ YAML', title: 'JSON ↔ YAML' },
      { key: 'UUID', title: 'UUID' },
      { key: '哈希', title: '哈希' },
      { key: '颜色', title: '颜色转换' },
      { key: 'JWT', title: 'JWT 解码' },
      { key: '二维码', title: '二维码' },
      { key: 'OCR 提取文字', title: 'OCR 提取文字' },
    ];

    for (const item of sessionTools) {
      await openToolViaPalette(page, item.key, item.title);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(item.title);
    }

    // Toggle theme between light and dark modes
    const themeBtn = page.getByTitle(/切换暗色模式|切换浅色模式/);
    await themeBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await themeBtn.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Verify zero unhandled exceptions throughout the session
    expect(pageErrors).toHaveLength(0);
  });
});
