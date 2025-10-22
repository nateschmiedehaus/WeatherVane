import { test, expect } from 'playwright/test';

test.describe('automations change log trust narrative', () => {
  test('foregrounds pending approvals with actionable guidance', async ({ page }) => {
    await page.goto('automations.html');

    const changeLog = page.getByTestId('automation-change-log');
    await expect(changeLog).toBeVisible();

    const summary = page.getByTestId('automation-change-log-summary');
    await expect(summary).toHaveAttribute('data-tone', 'caution');
    await expect(summary).toContainText(/Needs review/i);
    await expect(page.getByTestId('automation-summary-next-action')).toContainText(/Next:/i);

    const pendingFilter = page.getByTestId('automation-filter-pending');
    await expect(pendingFilter).toHaveAttribute('data-active', 'true');

    const pendingItem = page
      .locator('[data-testid="automation-change-log-item"][data-status="pending"]')
      .first();
    await expect(pendingItem).toBeVisible();
    await expect(pendingItem.locator('[data-testid="automation-narrative-why"]')).not.toBeEmpty();
    await expect(pendingItem.locator('[data-testid="automation-narrative-impact"]')).not.toBeEmpty();
    await expect(
      pendingItem.locator('[data-testid="automation-narrative-impact-context"]'),
    ).toBeVisible();
    await expect(
      pendingItem.locator('[data-testid="automation-narrative-next-step"]'),
    ).toContainText(/Approve|request/i);

    const evidenceDetails = pendingItem.locator('details');
    await expect(evidenceDetails).not.toHaveAttribute('open', '');
    await evidenceDetails.locator('summary').click();
    await expect(evidenceDetails).toHaveAttribute('open', '');
    await expect(evidenceDetails.locator('ul > li').first()).toBeVisible();
  });

  test('exposes shipped changes and rehearsal filters in the log', async ({ page }) => {
    await page.goto('automations.html');

    const shippedFilter = page.getByTestId('automation-filter-approved');
    await expect(shippedFilter).toBeVisible();
    await expect(page.getByTestId('automation-filter-count-approved')).not.toHaveText('0');

    const rehearsalFilter = page.getByTestId('automation-filter-shadow');
    await expect(rehearsalFilter).toBeVisible();
    await expect(page.getByTestId('automation-filter-count-shadow')).not.toHaveText('0');
  });
});
