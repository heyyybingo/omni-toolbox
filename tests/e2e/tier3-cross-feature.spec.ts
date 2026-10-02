import { test, expect, type Page } from '@playwright/test';

async function openToolViaPalette(page: Page, keyword: string, title: string) {
  await page.getByRole('button', { name: /搜索工具/ }).click();
  await page.getByPlaceholder('搜索工具…').fill(keyword);
  await page.locator('#commandList button', { hasText: title }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
}

test.describe('Tier 3: Cross-Feature Combinations & State Isolation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('multi-tab lifecycle: open, switch, close tab, and close all tabs', async ({ page }) => {
    // Initial tab: 图片格式转换
    await expect(page.getByRole('heading', { level: 1 })).toContainText('图片格式转换');

    // Open JSON 格式化
    await openToolViaPalette(page, 'JSON', 'JSON 格式化');
    // Open Base64
    await openToolViaPalette(page, 'Base64', 'Base64');
    // Open UUID
    await openToolViaPalette(page, 'UUID', 'UUID');

    // Verify all 4 tabs exist in tabs container
    const tabContainer = page.locator('div.flex.items-center.gap-1.min-w-0');
    await expect(tabContainer.locator('div', { hasText: '图片格式转换' })).toBeVisible();
    await expect(tabContainer.locator('div', { hasText: 'JSON 格式化' })).toBeVisible();
    await expect(tabContainer.locator('div', { hasText: 'Base64' })).toBeVisible();
    await expect(tabContainer.locator('div', { hasText: 'UUID' })).toBeVisible();

    // Switch tab by clicking JSON 格式化
    await tabContainer.locator('div', { hasText: 'JSON 格式化' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('JSON 格式化');

    // Close the UUID tab
    const uuidTab = tabContainer.locator('div', { hasText: 'UUID' });
    const closeUuidBtn = uuidTab.getByRole('button', { name: '关闭页签' });
    await closeUuidBtn.click({ force: true });
    await expect(tabContainer.locator('div', { hasText: 'UUID' })).toHaveCount(0);

    // Click "全部关闭" button
    const closeAllBtn = page.getByRole('button', { name: '全部关闭' });
    await expect(closeAllBtn).toBeVisible();
    await closeAllBtn.click();

    // After closing all tabs, only default tab '图片格式转换' remains
    await expect(page.getByRole('heading', { level: 1 })).toContainText('图片格式转换');
    await expect(tabContainer.locator('div', { hasText: 'JSON 格式化' })).toHaveCount(0);
  });

  test('session state isolation between multiple active tool sessions', async ({ page }) => {
    // 1. In JSON 格式化, input data
    await openToolViaPalette(page, 'JSON', 'JSON 格式化');
    await page.getByRole('button', { name: '文本', exact: true }).click();
    const jsonInput = page.locator('#jsonInput');
    await jsonInput.fill('{"session":"isolated_state_json"}');

    // 2. Switch to Base64, input data
    await openToolViaPalette(page, 'Base64', 'Base64');
    const base64Input = page.getByPlaceholder('输入文本或 Base64 字符串…');
    await base64Input.fill('Base64SessionDataToken');

    // 3. Switch back to JSON 格式化 via tab bar
    const tabContainer = page.locator('div.flex.items-center.gap-1.min-w-0');
    await tabContainer.locator('div', { hasText: 'JSON 格式化' }).click();

    // Verify JSON input is completely preserved
    await expect(page.locator('#jsonInput')).toHaveValue('{"session":"isolated_state_json"}');

    // 4. Switch back to Base64 via tab bar
    await tabContainer.locator('div', { hasText: 'Base64' }).click();
    await expect(page.getByPlaceholder('输入文本或 Base64 字符串…')).toHaveValue('Base64SessionDataToken');
  });

  test('workbench clear button resets session state cleanly', async ({ page }) => {
    await openToolViaPalette(page, 'Base64', 'Base64');

    const inputArea = page.getByPlaceholder('输入文本或 Base64 字符串…');
    await inputArea.fill('Data to be cleared');
    await page.getByRole('button', { name: 'Base64 编码', exact: true }).click();

    const outputArea = page.getByPlaceholder('编码或解码结果…');
    await expect(outputArea).not.toHaveValue('');

    // Click workbench header clear button
    const clearBtn = page.getByRole('main').getByRole('button', { name: '清空' });
    await clearBtn.click();

    // Verify input and output are reset
    await expect(inputArea).toHaveValue('');
    await expect(outputArea).toHaveValue('');
  });

  test('theme toggle switches smoothly between light and dark modes', async ({ page }) => {
    const html = page.locator('html');

    // Initial state is light mode
    await expect(html).toHaveAttribute('data-theme', 'light');

    // Click theme toggle to switch to dark mode
    const toDarkBtn = page.getByTitle(/切换暗色模式/);
    await toDarkBtn.click();

    // Verify dark mode applied
    await expect(html).toHaveAttribute('data-theme', 'dark');
    const darkScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(darkScheme).toBe('dark');

    // Click theme toggle to switch back to light mode (button title changes to 切换浅色模式)
    const toLightBtn = page.getByTitle(/切换浅色模式/);
    await toLightBtn.click();

    // Verify light mode restored
    await expect(html).toHaveAttribute('data-theme', 'light');
    const lightScheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(lightScheme).toBe('light');
  });
});
