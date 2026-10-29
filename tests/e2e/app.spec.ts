import { test, expect } from '@playwright/test';
import { signin } from './helpers';
let browserErrors: string[] = [];
test.beforeEach(async ({ request, page }) => {
  browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  expect((await request.post('http://127.0.0.1:54331/__test/reset')).ok()).toBe(
    true,
  );
});
test.afterEach(() => expect(browserErrors).toEqual([]));
test('homepage, persistent keyboard tabs, safe-area layout and remembered theme', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('.constitution-card')).toHaveCount(11);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveCount(3);
  await expect(
    nav.getByRole('link', { name: 'Home', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toHaveCount(0);
  await expect(page.locator('a[href^="/submit"]')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Open Chatbot', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.workflow')).toContainText('six-digit code');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  const issues = nav.getByRole('link', { name: 'All Issues', exact: true });
  await issues.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/issues$/);
  await expect(issues).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: /Switch to .* mode/ }).click();
  const theme = await page.locator('html').getAttribute('data-theme');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme!);
});
test('protected access, legacy submission redirects and owner account destination', async ({
  page,
  request,
}) => {
  for (const path of ['/chatbot', '/my-issues']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(303);
    expect(response.headers().location).toBe(
      '/signin?next=' + encodeURIComponent(path),
    );
  }
  const legacy = await request.get('/submit', { maxRedirects: 0 });
  expect(legacy.headers().location).toBe('/chatbot');
  await signin(page, 'citizen@fixtures.invalid', '/my-issues');
  await expect(page.locator('.case-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'My Issues', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Account', exact: true }),
  ).toBeFocused();
});
test('public database browsing, search, filter, sort, load more and safe citizen text', async ({
  page,
  request,
}, info) => {
  await page.goto('/issues');
  await expect(page.locator('.case-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(24);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(26);
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toHaveCount(0);
  const links = await page
    .locator('.case-card h2 a')
    .evaluateAll((els: any) => els.map((e: any) => e.href));
  expect(new Set(links).size).toBe(26);
  await page.getByLabel('Search issues').fill('uncertainty');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Reset filters' })).toBeVisible();
  await page
    .locator('.filter-bar')
    .getByRole('link', { name: 'Reset filters' })
    .click();
  await page.getByLabel('Constitution', { exact: true }).selectOption('2');
  await page.getByLabel('Sort by').selectOption('oldest');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(3);
  await expect(page.getByLabel('Constitution', { exact: true })).toHaveValue(
    '2',
  );
  expect(
    (await page.locator('.case-card .pill').allTextContents()).every(
      (t) => t === 'Constitution #2',
    ),
  ).toBe(true);
  const response = await request.get('/api/issues');
  const publicBody = await response.text();
  expect(publicBody).not.toMatch(
    /owner_id|user_id|@fixtures\.invalid|11111111-1111/,
  );
  await page.screenshot({
    path: info.outputPath('issues.png'),
    fullPage: true,
  });
});

test('historical evidence remains visible and unclassified; another user cannot manage it', async ({
  page,
}, info) => {
  const path = '/issues/eeeeeeee-0000-4000-8000-000000000001';
  await page.goto(path);
  await expect(page.locator('.behavior-label')).toHaveText('Unclassified');
  await page.getByRole('button', { name: 'Enlarge screenshot 1' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Enlarged screenshot', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await signin(page, 'other@fixtures.invalid', '/my-issues');
  await expect(page.locator('.case-card')).toHaveCount(0);
  await page.goto(path);
  await expect(
    page.getByRole('link', { name: 'Edit issue', exact: true }),
  ).toHaveCount(0);
  await page.goto(path + '/edit');
  await expect(
    page.getByText('Only the owner can manage this issue.'),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('historical-permissions.png'),
    fullPage: true,
  });
});
test('load-more failures retain results and allow retry; no-match filters reset', async ({
  page,
}) => {
  await page.goto('/issues');
  let failOnce = true;
  await page.route('**/api/issues?**', async (route) => {
    if (failOnce) {
      failOnce = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Temporary connection failure' }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Try again');
  await expect(page.locator('.case-card')).toHaveCount(12);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(24);
  await page.getByLabel('Search issues').fill('there is no such fixture');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No matching issues' }),
  ).toBeVisible();
  await page
    .locator('.filter-bar')
    .getByRole('link', { name: 'Reset filters' })
    .click();
  await expect(page.locator('.case-card')).toHaveCount(12);
});
