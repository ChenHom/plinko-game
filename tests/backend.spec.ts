import { test, expect } from '@playwright/test';
import { binPayouts } from '../src/lib/constants/game';
import { RiskLevel } from '../src/lib/types';

test('uses backend-provided bin index', async ({ page }) => {
  await page.route('**/api/play', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ binIndex: 0, signature: 'test' }),
    });
  });

  await page.goto('/');

  await page.getByRole('button', { name: 'Drop Ball' }).click();

  const expected = binPayouts[16][RiskLevel.MEDIUM][0].toString();
  await expect(page.getByText(expected, { exact: true })).toBeVisible({ timeout: 10000 });
});
