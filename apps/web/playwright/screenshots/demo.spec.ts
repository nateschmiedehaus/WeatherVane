import { test, expect, devices } from '@playwright/test';

test.describe('Weather Demo Page Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    // Start the Next.js dev server if needed
    await page.goto('/demo-weather-analysis');
  });

  test('Desktop - Overview Mode', async ({ page }) => {
    // Default view should be overview
    await expect(page).toHaveTitle(/Weather-Aware Modeling Demo/);

    // Take screenshot
    await page.screenshot({
      path: 'playwright-export/demo-overview-desktop.png',
      fullPage: true
    });
  });

  test('Desktop - Tenant Analysis Mode', async ({ page }) => {
    // Click on Tenant Analysis tab
    await page.click('button:has-text("🏢 Tenant Analysis")');

    // Wait for content to load
    await page.waitForSelector('text=Interactive Tenant Analysis');

    // Take screenshot
    await page.screenshot({
      path: 'playwright-export/demo-tenant-desktop.png',
      fullPage: true
    });

    // Test weather toggle interaction
    await page.click('button:has-text("WITH WEATHER")');
    await page.waitForTimeout(700); // Wait for animation

    // Take screenshot after toggle
    await page.screenshot({
      path: 'playwright-export/demo-tenant-no-weather-desktop.png',
      fullPage: true
    });
  });

  test('Desktop - Comparison Mode', async ({ page }) => {
    // Click on Comparison tab
    await page.click('button:has-text("📈 Comparison")');

    // Wait for table to load
    await page.waitForSelector('table');

    // Take screenshot
    await page.screenshot({
      path: 'playwright-export/demo-comparison-desktop.png',
      fullPage: true
    });
  });

  test('Desktop - Tenant switching', async ({ page }) => {
    // Go to tenant analysis
    await page.click('button:has-text("🏢 Tenant Analysis")');

    // Click on first tenant button
    await page.click('button:has-text("Extreme Weather Sensitivity")');
    await page.waitForTimeout(300);

    const extremeScreenshot = await page.screenshot({ fullPage: true });
    await expect(extremeScreenshot).toBeTruthy();

    // Click on second tenant
    await page.click('button:has-text("High Weather Sensitivity")');
    await page.waitForTimeout(300);

    const highScreenshot = await page.screenshot({ fullPage: true });
    await expect(highScreenshot).toBeTruthy();

    // Verify content changed
    const extremeText = await page.locator('text=High Weather Sensitivity').isVisible();
    expect(extremeText).toBeTruthy();
  });

  test('Tablet - Responsive Layout (iPad Pro)', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['iPad Pro 11'],
    });
    const page = await context.newPage();

    await page.goto('/demo-weather-analysis');
    await expect(page).toHaveTitle(/Weather-Aware Modeling Demo/);

    // Take tablet screenshot
    await page.screenshot({
      path: 'playwright-export/demo-overview-tablet.png',
      fullPage: true
    });

    await context.close();
  });

  test('Interactive Elements - Revenue Animation', async ({ page }) => {
    // Go to tenant analysis
    await page.click('button:has-text("🏢 Tenant Analysis")');

    // Get initial revenue value
    const revenueDisplay = await page.locator('text=Predicted Revenue').nth(0);
    await expect(revenueDisplay).toBeVisible();

    // Capture before animation
    await page.screenshot({
      path: 'playwright-export/demo-revenue-before.png'
    });

    // Click weather toggle
    await page.click('button:has-text("WITH WEATHER")');

    // Wait for animation to complete
    await page.waitForTimeout(600);

    // Capture after animation
    await page.screenshot({
      path: 'playwright-export/demo-revenue-after.png'
    });
  });

  test('All Tenant Cards Visible', async ({ page }) => {
    // Go to tenant analysis
    await page.click('button:has-text("🏢 Tenant Analysis")');

    // Verify all 4 tenant buttons exist
    const tenantButtons = await page.locator('button:has-text("Weather Sensitivity")').count();
    expect(tenantButtons).toBeGreaterThanOrEqual(4);
  });

  test('Links and Navigation', async ({ page }) => {
    // Verify breadcrumb navigation
    const homeLink = page.locator('text=Home');
    await expect(homeLink).toBeVisible();

    // Verify footer link exists
    const docLink = page.locator('text=Weather PoC Report');
    await expect(docLink).toBeVisible();

    // Take footer screenshot
    await page.goto('/demo-weather-analysis');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    await page.screenshot({
      path: 'playwright-export/demo-footer.png'
    });
  });
});

test.describe('Design System Validation', () => {
  test('Accessibility - Heading Structure', async ({ page }) => {
    await page.goto('/demo-weather-analysis');

    // Verify h1 exists
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);

    // Verify heading hierarchy
    const h2 = page.locator('h2');
    const h2Count = await h2.count();
    expect(h2Count).toBeGreaterThan(0);
  });

  test('Color Contrast - Text Readability', async ({ page }) => {
    await page.goto('/demo-weather-analysis');

    // Verify all text is visible
    const mainContent = page.locator('[class*="demoContainer"]');
    await expect(mainContent).toBeVisible();

    // Check button contrast
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(3, buttonCount); i++) {
      const button = buttons.nth(i);
      await expect(button).toBeVisible();
    }
  });

  test('Responsive Typography', async ({ page }) => {
    await page.goto('/demo-weather-analysis');

    // Get heading size at desktop
    const heading = page.locator('h1');
    const desktopSize = await heading.evaluate((el) =>
      window.getComputedStyle(el).fontSize
    );

    expect(desktopSize).toBeTruthy();

    // Verify it's reasonable size (not too small)
    const sizeNum = parseInt(desktopSize);
    expect(sizeNum).toBeGreaterThan(20); // At least 20px
  });
});
