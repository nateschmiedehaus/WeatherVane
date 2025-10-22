import { test, expect } from 'playwright/test';

test.describe('static export smoke', () => {
  test('Automations overview renders trust-first messaging', async ({ page }) => {
    await page.goto('automations.html');
    await expect(page.getByRole('heading', { level: 2, name: /Guided automation you can trust/i })).toBeVisible();
    const automationsStatus = page.getByRole('status').filter({ hasText: /Loading automation settings/i });
    await expect(automationsStatus).toBeVisible();
  });

  test('WeatherOps dashboard renders command center hero', async ({ page }) => {
    await page.goto('dashboard.html');
    await expect(page.getByRole('heading', { level: 1, name: /Guardrail & Weather Command Center/i })).toBeVisible();
    await expect(page.getByTestId('dashboard')).toBeVisible();
  });

  test('Reports page renders executive hero and loading state', async ({ page }) => {
    await page.goto('reports.html');
    await expect(page.getByRole('heading', { level: 2, name: /Executive Reports/i })).toBeVisible();
    const reportsStatus = page.getByRole('status').filter({ hasText: /Loading executive report/i });
    await expect(reportsStatus).toBeVisible();
  });
});
