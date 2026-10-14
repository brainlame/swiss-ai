import { test, expect } from '@playwright/test';
let browserErrors: string[] = [];
test.afterEach(() => {
  expect(browserErrors).toEqual([]);
});
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
test.beforeEach(async ({ request, page }) => {
  browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  expect((await request.post('http://127.0.0.1:54331/__test/reset')).ok()).toBe(
    true,
  );
});
async function signin(page: any, email = 'citizen@fixtures.invalid') {
  await page.goto('/signin?next=/submit');
  await expect(page.locator('form[data-ready=true]')).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('fixturepass123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/submit$/);
}
test('public constitutions, keyboard menu, theme persistence, and mobile layout', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('.constitution-card')).toHaveCount(11);
  await expect(page.getByText('Sample content', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const menu = page.locator('button[aria-controls="navigation"]');
  await expect(menu).toBeEnabled();
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('navigation').getByRole('link')).toHaveCount(5);
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await page.screenshot({
    path: info.outputPath('home.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: /Switch to .* mode/ }).click();
  const theme = await page.locator('html').getAttribute('data-theme');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme!);
});
test('requires authentication and preserves the return destination', async ({
  page,
}) => {
  await page.goto('/submit');
  await expect(page).toHaveURL(/signin\?next=%2Fsubmit/);
  await page.goto('/my-cases');
  await expect(page).toHaveURL(/signin\?next=%2Fmy-cases/);
  await expect(page.locator('form[data-ready=true]')).toBeVisible();
  await page.getByLabel('Email address').fill('citizen@fixtures.invalid');
  await page.getByLabel('Password', { exact: true }).fill('fixturepass123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/my-cases$/);
});
test('public database browsing, search, filter, sort, load more and safe citizen text', async ({
  page,
  request,
}, info) => {
  await page.goto('/cases');
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
  await page.getByLabel('Search cases').fill('uncertainty');
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
  const response = await request.get('/api/cases');
  const publicBody = await response.text();
  expect(publicBody).not.toMatch(
    /owner_id|user_id|@fixtures\.invalid|11111111-1111/,
  );
  await page.screenshot({
    path: info.outputPath('cases.png'),
    fullPage: true,
  });
});
test('case validation, creation, editing, evidence enlargement and deletion', async ({
  page,
}, info) => {
  await signin(page);
  await expect(page.locator('.case-form label')).toHaveCount(4);
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('   ');
  await page
    .getByRole('textbox', {
      name: 'Proposed constitutional improvement',
      exact: true,
    })
    .fill('A concrete proposal');
  await page.getByLabel('Constitution being addressed').selectOption('5');
  await page.getByRole('button', { name: 'Submit case', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('required');
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('<script>alert("unsafe")</script> A citizen test example.');
  await page.getByRole('button', { name: 'Submit case', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('one to five');
  await page.locator('#screenshots').setInputFiles({
    name: 'private-original-name.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(page.locator('.preview')).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath('submit.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Submit case', exact: true }).click();
  await expect(page).toHaveURL(/\/cases\/[a-f0-9-]+$/);
  const detail = page.url();
  await expect(page.locator('.citizen-text').first()).toContainText('<script>');
  await expect(
    page.getByRole('button', { name: 'Enlarge screenshot 1' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Enlarge screenshot 1' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Enlarged screenshot' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({
    path: info.outputPath('detail.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Edit case', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('An updated citizen example');
  await page.getByLabel('Constitution being addressed').selectOption('2');
  await page.locator('#screenshots').setInputFiles({
    name: 'replacement.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.getByRole('button', { name: 'Remove screenshot 1' }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(detail);
  await expect(page.locator('.citizen-text').first()).toHaveText(
    'An updated citizen example',
  );
  await expect(
    page.getByText('Constitution #2', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete case', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Delete this case?' }),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete case', exact: true })
    .click();
  await expect(page).toHaveURL(/my-cases\?deleted=1/);
  await page.goto(detail);
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});
test('another account cannot edit a citizen case', async ({ page }) => {
  await signin(page, 'other@fixtures.invalid');
  await page.goto('/cases/eeeeeeee-0000-4000-8000-000000000001');
  await expect(
    page.getByRole('link', { name: 'Edit case', exact: true }),
  ).toHaveCount(0);
  await page.goto('/cases/eeeeeeee-0000-4000-8000-000000000001/edit');
  await expect(
    page.getByText('Only the owner can manage this case.'),
  ).toBeVisible();
  await page.goto('/my-cases');
  await expect(page.locator('.case-card')).toHaveCount(0);
});

test('failed submission keeps text and staged uploads; retry publishes exactly once', async ({
  page,
  request,
}) => {
  await signin(page);
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('Retry-proof citizen fixture');
  await page
    .getByRole('textbox', {
      name: 'Proposed constitutional improvement',
      exact: true,
    })
    .fill('Explain how uncertainty affects advice.');
  await page.getByLabel('Constitution being addressed').selectOption('2');
  await page.locator('#screenshots').setInputFiles({
    name: 'evidence.png',
    mimeType: 'image/png',
    buffer: png,
  });
  let failOnce = true;
  await page.route('**/api/save', async (route) => {
    if (route.request().postDataJSON().stage === 'commit' && failOnce) {
      failOnce = false;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Test connection interrupted. Retry your submission.',
        }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Submit case', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('connection interrupted');
  await expect(
    page.getByRole('textbox', { name: 'Description', exact: true }),
  ).toHaveValue('Retry-proof citizen fixture');
  await expect(page.locator('.preview')).toHaveCount(1);
  expect(
    (await (await request.get('/api/cases?q=Retry-proof')).json()).items,
  ).toHaveLength(0);
  await page.getByRole('button', { name: 'Submit case', exact: true }).click();
  await expect(page).toHaveURL(/\/cases\/[a-f0-9-]+$/);
  expect(
    (await (await request.get('/api/cases?q=Retry-proof')).json()).items,
  ).toHaveLength(1);
});

test('load-more failures retain results and allow retry; no-match filters reset', async ({
  page,
}) => {
  await page.goto('/cases');
  let failOnce = true;
  await page.route('**/api/cases?**', async (route) => {
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
  await page.getByLabel('Search cases').fill('there is no such fixture');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'No matching cases' }),
  ).toBeVisible();
  await page
    .locator('.filter-bar')
    .getByRole('link', { name: 'Reset filters' })
    .click();
  await expect(page.locator('.case-card')).toHaveCount(12);
});
