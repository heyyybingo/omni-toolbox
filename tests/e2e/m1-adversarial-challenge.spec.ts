import { test, expect } from '@playwright/test';
import { TOOLS } from '../../src/tools/registry';

async function openTool(page: any, toolTitle: string) {
  await page.getByRole('button', { name: /搜索工具/ }).click();
  await page.getByPlaceholder('搜索工具…').fill(toolTitle);
  await page.locator('#commandList button', { hasText: toolTitle }).first().click();
  await expect(page.getByRole('dialog', { name: '搜索工具' })).toHaveCount(0);
}

test.describe('Milestone 1 Adversarial Challenge: File Input DOM State & Selector Integrity', () => {

  test('Condition 1: Initial load DOM state and attributes', async ({ page }) => {
    await page.goto('/');
    const fileInputs = page.locator('input[type="file"]');
    const count = await fileInputs.count();
    expect(count, 'Initial load must have exactly 1 file input in DOM').toBe(1);

    const input = fileInputs.first();
    await expect(input).toHaveClass(/hidden/);
    await expect(input).toHaveAttribute('multiple', '');
    await expect(input).toHaveAttribute('accept', 'image/*');
  });

  test('Condition 2: Uploading files transition (Dropzone unmounts, file list mounts)', async ({ page }) => {
    await page.goto('/');
    const samplePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    // Initial count
    await expect(page.locator('input[type="file"]')).toHaveCount(1);
    await expect(page.getByText('点击选择或拖拽文件到此处')).toBeVisible();

    // Attach file
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sample1.png',
      mimeType: 'image/png',
      buffer: samplePng,
    });

    // File list card appears, Dropzone disappears
    await expect(page.getByRole('heading', { name: /文件列表/ })).toBeVisible();
    await expect(page.getByText('点击选择或拖拽文件到此处')).toHaveCount(0);

    // File input count when files are present
    const countWithFiles = await page.locator('input[type="file"]').count();
    expect(countWithFiles, 'With files uploaded, input[type="file"] must remain exactly 1').toBe(1);

    // Add another file using the same input
    await page.locator('input[type="file"]').setInputFiles({
      name: 'sample2.png',
      mimeType: 'image/png',
      buffer: samplePng,
    });
    await expect(page.getByRole('heading', { name: /文件列表 \(2\)/ })).toBeVisible();
    expect(await page.locator('input[type="file"]').count()).toBe(1);
  });

  test('Condition 3: Clearing files transition (file list unmounts, Dropzone remounts)', async ({ page }) => {
    await page.goto('/');
    const samplePng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );

    await page.locator('input[type="file"]').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: samplePng,
    });
    await expect(page.getByRole('heading', { name: /文件列表/ })).toBeVisible();

    // Clear session
    const clearBtn = page.getByRole('main').getByRole('button', { name: '清空' });
    await clearBtn.click();

    // Dropzone is remounted
    await expect(page.getByText('点击选择或拖拽文件到此处')).toBeVisible();
    await expect(page.getByRole('heading', { name: /文件列表/ })).toHaveCount(0);

    // File input count must remain exactly 1
    const countAfterClear = await page.locator('input[type="file"]').count();
    expect(countAfterClear, 'After clearing, input[type="file"] must remain exactly 1').toBe(1);
  });

  test('Condition 4: Switching between visual and non-visual (L4) tools', async ({ page }) => {
    await page.goto('/');

    // 1. Initial visual tool (image-convert): count = 1
    expect(await page.locator('input[type="file"]').count()).toBe(1);

    // 2. Switch to non-visual L4 tool (JSON 格式化)
    await openTool(page, 'JSON 格式化');
    await expect(page.getByRole('heading', { name: 'JSON 工作台' })).toBeVisible();
    const countInL4Json = await page.locator('input[type="file"]').count();
    expect(countInL4Json, 'In L4 JSON tool, global hidden input still exists in root').toBe(1);

    // 3. Switch to another non-visual tool (Base64)
    await openTool(page, 'Base64');
    await expect(page.getByRole('heading', { name: /Base64 编码/ })).toBeVisible();
    expect(await page.locator('input[type="file"]').count()).toBe(1);

    // 4. Switch to visual tool (PDF 拼接)
    await openTool(page, 'PDF 拼接');
    await expect(page.getByText('点击选择或拖拽文件到此处')).toBeVisible();
    expect(await page.locator('input[type="file"]').count()).toBe(1);

    // 5. Switch back to non-visual tool (哈希)
    await openTool(page, '哈希');
    expect(await page.locator('input[type="file"]').count()).toBe(1);

    // 6. Switch to image-crop (visual)
    await openTool(page, '图片裁剪');
    expect(await page.locator('input[type="file"]').count()).toBe(1);
  });

  test('Condition 5: Fullscreen mode behavior on standard workbench', async ({ page }) => {
    await page.goto('/');
    expect(await page.locator('input[type="file"]').count()).toBe(1);

    // Click fullscreen button
    const fullscreenBtn = page.getByRole('button', { name: '放大工作区' });
    await fullscreenBtn.click();

    // Check if fullscreen layer is mounted (exit button has aria-label="还原")
    const restoreBtn = page.getByRole('button', { name: '还原' });
    await expect(restoreBtn).toBeVisible();

    // Even in fullscreen mode with duplicate renderStandardWorkbench(), Dropzone does NOT render an input
    const countInFullscreen = await page.locator('input[type="file"]').count();
    expect(countInFullscreen, 'Fullscreen mode on image-convert should not duplicate file inputs').toBe(1);

    // Exit fullscreen
    await restoreBtn.click();
    await expect(restoreBtn).toHaveCount(0);
    expect(await page.locator('input[type="file"]').count()).toBe(1);
  });

  test('Condition 6: Adversarial Investigation of Auxiliary File Input Tools (image-stamp & pdf-img-wm)', async ({ page }) => {
    await page.goto('/');

    // 1. Navigate to '图片 Logo 水印' (image-stamp)
    await openTool(page, '图片 Logo 水印');
    await expect(page.getByText('点击选择水印图片 (PNG/JPEG)')).toBeVisible();

    // Check file input count
    const stampFileInputs = page.locator('input[type="file"]');
    const stampCount = await stampFileInputs.count();
    expect(stampCount, 'image-stamp renders 2 file inputs: global workbench input + parameter FileInput (id="stampFile")').toBe(2);

    // Inspect the elements in DOM
    const inputsInfo = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="file"]')).map((el) => ({
        id: el.id || '(no-id)',
        accept: el.getAttribute('accept'),
        multiple: el.hasAttribute('multiple'),
        className: el.className,
      }));
    });
    expect(inputsInfo).toEqual([
      { id: 'stampFile', accept: 'image/png,image/jpeg', multiple: false, className: 'hidden' },
      { id: '(no-id)', accept: 'image/*', multiple: true, className: 'hidden' },
    ]);

    // Test strict mode violation when using naive unqualified selector
    let strictModeErrorMsg = '';
    try {
      await page.locator('input[type="file"]').setInputFiles({
        name: 'test.png',
        mimeType: 'image/png',
        buffer: Buffer.from('dummy'),
      });
    } catch (err: any) {
      strictModeErrorMsg = err.message;
    }
    expect(strictModeErrorMsg).toContain('strict mode violation');
    expect(strictModeErrorMsg).toContain('resolved to 2 elements');

    // Confirm that targeting the main workbench input unambiguously requires:
    // `page.locator('input[type="file"][multiple]')`
    await page.locator('input[type="file"][multiple]').setInputFiles({
      name: 'main-sample.png',
      mimeType: 'image/png',
      buffer: Buffer.from('dummy'),
    });
    await expect(page.getByRole('heading', { name: /文件列表/ })).toBeVisible();

    // Now test Fullscreen in image-stamp:
    const fullscreenBtn = page.getByRole('button', { name: '放大工作区' });
    await fullscreenBtn.click();
    const restoreBtn = page.getByRole('button', { name: '还原' });
    await expect(restoreBtn).toBeVisible();

    // In fullscreen, FullscreenLayer duplicates renderStandardWorkbench(), causing FileInput to render twice!
    const countInStampFullscreen = await page.locator('input[type="file"]').count();
    // 2 FileInputs (#stampFile) + 1 global hidden input = 3 elements!
    expect(countInStampFullscreen, 'In image-stamp fullscreen, duplicate workbench renders stampFile twice + global = 3 inputs').toBe(3);
    await restoreBtn.click();

    // 2. Navigate to 'PDF 图片水印' (pdf-img-wm)
    await openTool(page, 'PDF 图片水印');
    await expect(page.getByText('点击选择水印图片 (PNG/JPEG)')).toBeVisible();

    const pdfStampInputs = page.locator('input[type="file"]');
    const pdfStampCount = await pdfStampInputs.count();
    expect(pdfStampCount, 'pdf-img-wm renders 2 file inputs: global workbench input + parameter FileInput (id="pdfStampFile")').toBe(2);

    const pdfInputsInfo = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('input[type="file"]')).map((el) => ({
        id: el.id || '(no-id)',
        accept: el.getAttribute('accept'),
        multiple: el.hasAttribute('multiple'),
        className: el.className,
      }));
    });
    expect(pdfInputsInfo).toEqual([
      { id: 'pdfStampFile', accept: 'image/png,image/jpeg', multiple: false, className: 'hidden' },
      { id: '(no-id)', accept: 'application/pdf,.pdf', multiple: true, className: 'hidden' },
    ]);
  });

  test('Condition 7: Full sweep of all 51 registered tools in omni-toolbox', async ({ page }) => {
    await page.goto('/');

    const toolEntries = Object.values(TOOLS);
    const results: Record<string, { title: string; count: number; ids: string[] }> = {};

    for (const tool of toolEntries) {
      await openTool(page, tool.title);
      const fileInputs = page.locator('input[type="file"]');
      const count = await fileInputs.count();
      const ids = await page.evaluate(() =>
        Array.from(document.querySelectorAll('input[type="file"]')).map((el) => el.id || '(no-id)')
      );
      results[tool.id] = { title: tool.title, count, ids };
    }

    const toolsWithMoreThanOne = Object.entries(results).filter(([_, r]) => r.count > 1);
    const toolsWithZero = Object.entries(results).filter(([_, r]) => r.count === 0);
    const toolsWithExactOne = Object.entries(results).filter(([_, r]) => r.count === 1);

    // Verify empirical findings:
    // Exactly 49 tools have count === 1
    // Exactly 2 tools (image-stamp and pdf-img-wm) have count === 2
    // Exactly 0 tools have count === 0
    expect(toolsWithZero.length).toBe(0);
    expect(toolsWithExactOne.length).toBe(49);
    expect(toolsWithMoreThanOne.length).toBe(2);
    expect(toolsWithMoreThanOne.map(([id]) => id).sort()).toEqual(['image-stamp', 'pdf-img-wm'].sort());
  });
});
