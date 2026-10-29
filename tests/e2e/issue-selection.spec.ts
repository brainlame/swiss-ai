import { test, expect } from '@playwright/test';
import { signin, send } from './helpers';

test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:54331/__test/reset')).ok()).toBe(
    true,
  );
});

test('selects a continuous section, restores the full chat and keeps issue-form text', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signin(page);
  for (const prompt of [
    'hello',
    'password',
    'photosynthesis',
    'What is the capital of Australia?',
  ])
    await send(page, prompt);
  const full = await page.locator('.chat-message p').allTextContents();
  await page.getByLabel('Message', { exact: true }).fill('My unsent follow-up');
  await page
    .getByRole('button', { name: 'Submit an issue', exact: true })
    .click();
  await expect(page.getByLabel('First exchange')).toHaveValue('3');
  await page.getByLabel('First exchange').selectOption('1');
  await page.getByLabel('Last exchange').selectOption('2');
  await expect(page.locator('.included-message')).toHaveCount(4);
  expect(await page.locator('.included-message p').allTextContents()).toEqual(
    full.slice(2, 6),
  );
  await page.screenshot({
    path: info.outputPath('continuous-selection.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Continue to issue', exact: true })
    .click();
  await expect(page).toHaveURL(/\/submit\?source=chatbot$/);
  await expect(
    page
      .getByRole('region', { name: 'Attached conversation' })
      .locator('article'),
  ).toHaveCount(4);
  const evidence = page.getByRole('region', { name: 'Attached conversation' });
  expect(await evidence.locator('article p').allTextContents()).toEqual(
    full.slice(2, 6),
  );
  await expect(evidence.locator('input,textarea')).toHaveCount(0);
  await page
    .getByLabel('Description', { exact: false })
    .fill('A focused issue about the selected exchanges.');
  await page
    .getByLabel('Proposed constitutional improvement', { exact: false })
    .fill('Explain useful reasoning and how advice can be verified.');
  await page
    .getByLabel('Constitution being addressed', { exact: false })
    .selectOption('4');
  await page.getByRole('radio', { name: 'Good / wanted behavior' }).check();
  await evidence
    .getByRole('button', { name: 'Back to chat', exact: true })
    .click();
  await expect(page).toHaveURL(/\/chatbot$/);
  await expect(page.locator('.chat-message')).toHaveCount(8);
  expect(await page.locator('.chat-message p').allTextContents()).toEqual(full);
  await expect(page.getByLabel('First exchange')).toHaveValue('1');
  await expect(page.getByLabel('Last exchange')).toHaveValue('2');
  await expect(page.locator('.included-message')).toHaveCount(4);
  await page
    .getByRole('button', { name: 'Keep chatting', exact: true })
    .click();
  await expect(page.getByLabel('Message', { exact: true })).toHaveValue(
    'My unsent follow-up',
  );
  await page
    .getByRole('button', { name: 'Submit an issue', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Continue to issue', exact: true })
    .click();
  await expect(page).toHaveURL(/\/submit\?source=chatbot$/);
  await expect(
    page
      .getByRole('region', { name: 'Attached conversation' })
      .locator('article'),
  ).toHaveCount(4);
  await expect(page.getByLabel('Description', { exact: false })).toHaveValue(
    'A focused issue about the selected exchanges.',
  );
  await expect(
    page.getByLabel('Constitution being addressed', { exact: false }),
  ).toHaveValue('4');
  await expect(
    page.getByRole('radio', { name: 'Good / wanted behavior' }),
  ).toBeChecked();
  await evidence
    .getByRole('button', { name: 'Back to chat', exact: true })
    .click();
  await page.getByLabel('First exchange').selectOption('0');
  await page.getByLabel('Last exchange').selectOption('1');
  await page
    .getByRole('button', { name: 'Continue to issue', exact: true })
    .click();
  await expect(page).toHaveURL(/\/submit\?source=chatbot$/);
  await expect(
    page
      .getByRole('region', { name: 'Attached conversation' })
      .locator('article'),
  ).toHaveCount(4);
  expect(await evidence.locator('article p').allTextContents()).toEqual(
    full.slice(0, 4),
  );
  await expect(page.getByLabel('Description', { exact: false })).toHaveValue(
    'A focused issue about the selected exchanges.',
  );
  let submitted: Record<string, unknown> | undefined;
  await page.route('**/api/save', async (route) => {
    submitted = route.request().postDataJSON();
    await route.continue();
  });
  await page.getByRole('button', { name: 'Submit issue', exact: true }).click();
  await expect(page).toHaveURL(/\/issues\/[a-f0-9-]+$/);
  expect(submitted!.transcript).toEqual(
    full
      .slice(0, 4)
      .map((text, i) => ({ role: i % 2 ? 'assistant' : 'user', text })),
  );
  expect(JSON.stringify(submitted)).not.toContain(full[6]);
  expect(await evidence.locator('article p').allTextContents()).toEqual(
    full.slice(0, 4),
  );
  await expect(
    evidence.getByRole('button', { name: 'Back to chat' }),
  ).toHaveCount(0);
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Chatbot', exact: true })
    .click();
  await expect(page.locator('.chat-message')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('range boundaries adjust together, and selection remains usable in a compact viewport', async ({
  page,
}, info) => {
  await signin(page);
  for (const prompt of ['hello', 'password', 'photosynthesis'])
    await send(page, prompt);
  await page
    .getByRole('button', { name: 'Submit an issue', exact: true })
    .click();
  await page.getByLabel('First exchange').selectOption('0');
  await page.getByLabel('Last exchange').selectOption('0');
  await page.getByLabel('First exchange').selectOption('2');
  await expect(page.getByLabel('Last exchange')).toHaveValue('2');
  await expect(page.locator('.included-message')).toHaveCount(2);
  await page.getByLabel('Last exchange').selectOption('0');
  await expect(page.getByLabel('First exchange')).toHaveValue('0');
  await expect(page.locator('.included-message')).toHaveCount(2);
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: size.width, height: 320 });
  await expect(
    page.getByRole('button', { name: 'Continue to issue', exact: true }),
  ).toBeInViewport({ ratio: 1 });
  expect(
    await page.getByRole('log').evaluate((el) => el.clientHeight),
  ).toBeGreaterThan(0);
  await page.screenshot({
    path: info.outputPath('compact-selection.png'),
    fullPage: true,
  });
  await page.setViewportSize(size);
  await page
    .getByRole('button', { name: 'Continue to issue', exact: true })
    .click();
  await page
    .getByRole('region', { name: 'Attached conversation' })
    .getByRole('button', { name: 'Back to chat' })
    .click();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'All Issues', exact: true })
    .click();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Chatbot', exact: true })
    .click();
  await expect(page.locator('.chat-message')).toHaveCount(0);
});

test('issue URLs and labels are canonical while older links and API clients still work', async ({
  page,
  request,
}) => {
  const id = 'eeeeeeee-0000-4000-8000-000000000001';
  for (const [old, canonical] of [
    ['/cases?q=uncertainty&sort=oldest', '/issues?q=uncertainty&sort=oldest'],
    ['/cases/' + id, '/issues/' + id],
    ['/cases/' + id + '/edit', '/issues/' + id + '/edit'],
    ['/my-cases', '/my-issues'],
  ]) {
    const response = await request.get(old, { maxRedirects: 0 });
    expect(response.status()).toBe(308);
    expect(response.headers().location).toBe(canonical);
  }
  const old = await (await request.get('/api/cases')).json(),
    canonical = await (await request.get('/api/issues')).json();
  expect(old.items.map((item: { id: string }) => item.id)).toEqual(
    canonical.items.map((item: { id: string }) => item.id),
  );
  await page.goto('/');
  await expect(
    page
      .getByRole('navigation')
      .getByRole('link', { name: 'All Issues', exact: true }),
  ).toHaveAttribute('href', '/issues');
  await page.goto('/issues');
  await expect(
    page.getByRole('heading', { name: 'All Issues', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Search issues')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open issue', exact: true }).first(),
  ).toBeVisible();
});
