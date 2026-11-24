import { expect, test } from '@playwright/test';
import { signin } from './helpers';

const email = 'moderator@fixtures.invalid';
const issueId = 'eeeeeeee-0000-4000-8000-000000000001';
test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:54331/__test/reset')).ok()).toBe(
    true,
  );
});
async function membership(request: any, grant = true) {
  expect(
    (
      await request.post('http://127.0.0.1:54331/__test/admin', {
        data: { email, grant },
      })
    ).ok(),
  ).toBe(true);
}
test('normal users are denied, admins see existing totals without voting, and revocation is immediate', async ({
  page,
  request,
}) => {
  await signin(page, email, '/issues');
  const card = page.locator('.case-card').first();
  await expect(card.locator('.upvote-count')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Synthesize cases', exact: true }),
  ).toHaveCount(0);
  const endpoint = '/api/issues/' + issueId + '/delete';
  const origin = 'http://127.0.0.1:4173';
  expect(
    (await page.request.post(endpoint, { headers: { origin } })).status(),
  ).toBe(403);
  await membership(request);
  await page.reload();
  const synthesis = page.getByRole('button', {
    name: 'Synthesize cases',
    exact: true,
  });
  await expect(synthesis).toBeVisible();
  await expect(synthesis).toBeEnabled();
  expect((await synthesis.boundingBox())!.y).toBeLessThan(
    (await page.locator('.filter-bar').boundingBox())!.y,
  );
  let posts = 0;
  page.on('request', (r) => {
    if (r.method() === 'POST') posts++;
  });
  await synthesis.click();
  const synthesisDialog = page.getByRole('dialog', {
    name: 'Synthesize cases',
    exact: true,
  });
  await expect(synthesisDialog).toBeVisible();
  await synthesisDialog
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  expect(posts).toBe(0);
  await expect(card.locator('.upvote-count')).toContainText('1 wanted');
  await expect(card.locator('.downvote-count')).toContainText('1 unwanted');
  await expect(
    card.getByRole('button', { name: 'Wanted behavior', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false');
  let data = await (
    await page.request.get('/api/issues/' + issueId + '/discussion')
  ).json();
  expect(data).toMatchObject({
    upvotes: 1,
    downvotes: 1,
    my_vote: 0,
    total_votes: 2,
  });
  expect(JSON.stringify(data)).not.toMatch(/user_id|owner_id|@fixtures/);
  await membership(request, false);
  expect(
    (await page.request.post(endpoint, { headers: { origin } })).status(),
  ).toBe(403);
  data = await (
    await page.request.get('/api/issues/' + issueId + '/discussion')
  ).json();
  expect(data).toMatchObject({
    upvotes: 0,
    downvotes: 0,
    my_vote: 0,
    total_votes: 2,
    can_view_results: false,
  });
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Synthesize cases', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Delete issue', exact: true }),
  ).toHaveCount(0);
  await expect(card.locator('.upvote-count')).toHaveCount(0);
});
test('admin confirms one card deletion, can cancel or retry, and refreshes rankings and counts', async ({
  page,
  request,
}) => {
  await membership(request);
  await signin(page, email, '/issues');
  const card = page.locator('.case-card').first();
  const excerpt = await card.locator('h2 a').innerText();
  await card.getByRole('button', { name: 'Delete issue', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Delete this issue?',
    exact: true,
  });
  await expect(dialog).toContainText(excerpt);
  await expect(dialog).toContainText('permanently');
  await dialog.getByRole('button', { name: 'Keep issue', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(10);
  await expect(
    page.getByRole('button', { name: 'Unclassified: 26 issues', exact: true }),
  ).toBeVisible();
  await card.getByRole('button', { name: 'Delete issue', exact: true }).click();
  let fail = true;
  await page.route('**/api/issues/*/delete', (route) => {
    if (fail) {
      fail = false;
      return route.fulfill({
        status: 503,
        json: { message: 'Temporary deletion failure. Retry.' },
      });
    }
    return route.continue();
  });
  await dialog
    .getByRole('button', { name: 'Delete issue', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText(
    'Temporary deletion failure',
  );
  await expect(page.locator('.case-card')).toHaveCount(10);
  await dialog
    .getByRole('button', { name: 'Delete issue', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Issue deleted.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Unclassified: 25 issues', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.case-card')).toHaveCount(10);
  await expect(page.locator('.case-card h2 a')).not.toContainText([excerpt]);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(20);
  const ids = await page
    .locator('.case-card h2 a')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLAnchorElement).href));
  expect(new Set(ids).size).toBe(20);
  expect(ids.some((id) => id.endsWith(issueId))).toBe(false);
});
test('admin detail deletion handles image-cleanup failure and redirects to All Issues on retry', async ({
  page,
  request,
}) => {
  await membership(request);
  await signin(page, email, '/issues/' + issueId);
  await expect(page.locator('.upvote-count')).toContainText('1 wanted');
  await expect(
    page.getByRole('link', { name: 'Edit issue', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete issue', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Delete this issue?',
    exact: true,
  });
  await request.post('http://127.0.0.1:54331/__test/storage-failure', {
    data: { fail: true },
  });
  await dialog
    .getByRole('button', { name: 'Delete issue', exact: true })
    .click();
  await expect(dialog.getByRole('alert')).toContainText('image cleanup failed');
  await page.reload();
  await expect(
    page.getByText(
      'This issue is hidden while image deletion is pending. Retry deletion below.',
    ),
  ).toBeVisible();
  await request.post('http://127.0.0.1:54331/__test/storage-failure', {
    data: { fail: false },
  });
  await page.getByRole('button', { name: 'Delete issue', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Delete issue', exact: true })
    .click();
  await expect(page).toHaveURL('/issues?deleted=1');
  await expect(
    page.getByRole('button', { name: 'Unclassified: 25 issues', exact: true }),
  ).toBeVisible();
  expect(
    (
      await page.request.post('/api/issues/' + issueId + '/delete', {
        headers: { origin: 'http://127.0.0.1:4173' },
      })
    ).ok(),
  ).toBe(true);
});

test('deletion retains search, topic and sort, resets pagination, and supports keyboard confirmation', async ({
  page,
  request,
}) => {
  await membership(request);
  await request.post('http://127.0.0.1:54331/__test/activity', {
    data: { action: 'topics' },
  });
  await signin(
    page,
    email,
    '/issues?q=Fixture&topic=fixture-citations&sort=discussed',
  );
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(15);
  const first = page.locator('.case-card').first();
  const target = await first.locator('h2 a').getAttribute('href');
  const opener = first.getByRole('button', {
    name: 'Delete issue',
    exact: true,
  });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', {
    name: 'Delete this issue?',
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.case-card')).toHaveCount(15);
  await opener.focus();
  await page.keyboard.press('Enter');
  await dialog
    .getByRole('button', { name: 'Delete issue', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.case-card')).toHaveCount(10);
  await expect(page.getByLabel('Search issues')).toHaveValue('Fixture');
  await expect(page.getByLabel('Topic', { exact: true })).toHaveValue(
    'fixture-citations',
  );
  await expect(page.getByLabel('Sort by')).toHaveValue('discussed');
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(14);
  const links = await page
    .locator('.case-card h2 a')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href')));
  expect(links).not.toContain(target);
  expect(new Set(links).size).toBe(14);
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('synthesis confirms without a file, reports progress and failures, and refreshes after success', async ({
  page,
  request,
}) => {
  await membership(request);
  await signin(page, email, '/issues');
  await page
    .getByRole('button', { name: 'Synthesize cases', exact: true })
    .click();
  const dialog = page.getByRole('dialog', {
    name: 'Synthesize cases',
    exact: true,
  });
  const submit = dialog.getByRole('button', {
    name: 'Synthesize cases',
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await expect(dialog.locator('input[type=file]')).toHaveCount(0);
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let calls = 0;
  await page.route('**/api/admin/synthesis', async (route) => {
    calls++;
    expect(route.request().postData()).toBe(null);
    if (calls === 1) {
      await waiting;
      return route.fulfill({
        status: 400,
        json: {
          message: 'OpenRouter free model request failed (HTTP 429).',
        },
      });
    }
    await request.post('http://127.0.0.1:54331/__test/activity', {
      data: { action: 'topics' },
    });
    return route.fulfill({
      json: { topics: 1, issues: 26, revision: 'synthetic' },
    });
  });
  await submit.click();
  await expect(dialog.getByRole('progressbar')).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Cancel', exact: true }),
  ).toBeDisabled();
  await expect.poll(() => calls).toBe(1);
  finish();
  await expect(dialog.getByRole('alert')).toContainText('HTTP 429');
  await submit.click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Published 1 topics for 26 issues.' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Topic', { exact: true }).locator('option'),
  ).toContainText(['All topics', 'Citation checks', 'Unclassified']);
  expect(calls).toBe(2);
});
