import { test, expect } from '@playwright/test';

async function openTool(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: /搜索工具/ }).click();
  await page.getByPlaceholder('搜索工具…').fill(title);
  await page.locator('#commandList button', { hasText: title }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
}

test.describe('M2 Adversarial Challenge: Theme Persistence & DevTools Workbench', () => {

  test('Adversarial Mount: Preserves existing dark theme in localStorage without mount-time overwrite', async ({ page }) => {
    // Inject dark theme prior to page script execution
    await page.addInitScript(() => {
      window.localStorage.setItem('lt-theme', 'dark');
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Verify <html> data-theme attribute is dark
    const htmlTheme = await page.locator('html').getAttribute('data-theme');
    expect(htmlTheme, 'HTML data-theme should be dark on initial load').toBe('dark');

    // Verify localStorage was NOT overwritten by mount effect
    const savedTheme = await page.evaluate(() => window.localStorage.getItem('lt-theme'));
    expect(savedTheme, 'localStorage lt-theme must remain dark and not be overwritten').toBe('dark');

    // Verify toggle button shows switch to light mode
    const toggleBtn = page.locator('button[title="切换浅色模式"]');
    await expect(toggleBtn).toBeVisible();
  });

  test('Theme toggle persists cleanly across browser reload', async ({ page }) => {
    // Start with default
    await page.goto('/');

    // Toggle theme to dark
    const toDarkBtn = page.locator('button[title="切换暗色模式"]');
    await toDarkBtn.click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    let currentTheme = await page.evaluate(() => window.localStorage.getItem('lt-theme'));
    expect(currentTheme).toBe('dark');

    // Perform browser reload
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Must still be dark after reload
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    currentTheme = await page.evaluate(() => window.localStorage.getItem('lt-theme'));
    expect(currentTheme).toBe('dark');
    await expect(page.locator('button[title="切换浅色模式"]')).toBeVisible();

    // Toggle back to light
    await page.locator('button[title="切换浅色模式"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    // Reload again
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    currentTheme = await page.evaluate(() => window.localStorage.getItem('lt-theme'));
    expect(currentTheme).toBe('light');
    await expect(page.locator('button[title="切换暗色模式"]')).toBeVisible();
  });

  test('JWT Decoder UI handles Unicode multi-byte, emojis, and corrupted tokens gracefully', async ({ page }) => {
    await page.goto('/');
    await openTool(page, 'JWT 解码');

    const textarea = page.locator('textarea[placeholder*="粘贴 JWT 字符串"]');
    await expect(textarea).toBeVisible();

    // 1. Valid JWT with Chinese, emojis, and base64url padding
    // Payload: {"user":"张三","role":"管理员","tool":"前端工具箱","emoji":"🚀"}
    const unicodeToken =
      'eyJhbGciOiJIUzI1NiJ9.' +
      'eyJ1c2VyIjoi5byg5LiJIiwicm9sZSI6IueuoeeQhuWRmCIsInRvb2wiOiLliY3nq6_lt6XlhbfnrrEiLCJlbW9qaSI6IvCfmoAifQ.' +
      'sig';

    await textarea.fill(unicodeToken);

    // Payload pre element should render the decoded JSON with Unicode and Emoji
    const preBlocks = page.locator('pre.code-pane');
    await expect(preBlocks.nth(0)).toContainText('"alg": "HS256"');
    await expect(preBlocks.nth(1)).toContainText('张三');
    await expect(preBlocks.nth(1)).toContainText('管理员');
    await expect(preBlocks.nth(1)).toContainText('前端工具箱');
    await expect(preBlocks.nth(1)).toContainText('🚀');

    // 2. Corrupted token input
    await textarea.fill('invalid.jwt.token!@#$%^&*()');
    await expect(preBlocks.nth(0)).toHaveText('—');
    await expect(preBlocks.nth(1)).toHaveText('—');
  });

  test('Color Tool UI parses 3-digit, 6-digit hex, edge colors, and HSL conversions', async ({ page }) => {
    await page.goto('/');
    await openTool(page, '颜色转换');

    const hexInput = page.locator('div:has(> label:has-text("HEX 颜色值")) input');
    await expect(hexInput).toBeVisible();

    // 1. Shorthand #fff
    await hexInput.fill('#fff');
    await expect(page.getByText('#FFFFFF', { exact: true })).toBeVisible();
    await expect(page.getByText('rgb(255, 255, 255)', { exact: true })).toBeVisible();
    await expect(page.getByText('hsl(0, 0%, 100%)', { exact: true })).toBeVisible();

    // 2. Shorthand #000
    await hexInput.fill('#000');
    await expect(page.getByText('#000000', { exact: true })).toBeVisible();
    await expect(page.getByText('rgb(0, 0, 0)', { exact: true })).toBeVisible();
    await expect(page.getByText('hsl(0, 0%, 0%)', { exact: true })).toBeVisible();

    // 3. Shorthand #f00 (pure red)
    await hexInput.fill('#f00');
    await expect(page.getByText('#FF0000', { exact: true })).toBeVisible();
    await expect(page.getByText('rgb(255, 0, 0)', { exact: true })).toBeVisible();
    await expect(page.getByText('hsl(0, 100%, 50%)', { exact: true })).toBeVisible();

    // 4. Shorthand #0f0 (pure green)
    await hexInput.fill('#0f0');
    await expect(page.getByText('#00FF00', { exact: true })).toBeVisible();
    await expect(page.getByText('rgb(0, 255, 0)', { exact: true })).toBeVisible();
    await expect(page.getByText('hsl(120, 100%, 50%)', { exact: true })).toBeVisible();

    // 5. Shorthand #00f (pure blue)
    await hexInput.fill('#00f');
    await expect(page.getByText('#0000FF', { exact: true })).toBeVisible();
    await expect(page.getByText('rgb(0, 0, 255)', { exact: true })).toBeVisible();
    await expect(page.getByText('hsl(240, 100%, 50%)', { exact: true })).toBeVisible();

    // 6. Invalid hex falls back to #0C66E4
    await hexInput.fill('invalid-hex-string');
    await expect(page.getByText('#0C66E4', { exact: true })).toBeVisible();
    await expect(page.getByText('rgb(12, 102, 228)', { exact: true })).toBeVisible();
    await expect(page.getByText('hsl(215, 90%, 47%)', { exact: true })).toBeVisible();
  });
});
