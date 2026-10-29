import { test, expect } from '@playwright/test';
import { signin } from './helpers';
const caseId = 'eeeeeeee-0000-4000-8000-000000000001';
test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:54331/__test/reset')).ok()).toBe(
    true,
  );
});
test('public case cards show voting, anonymous relative-time comments and paginated threads', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/cases');
  const card = page
    .getByRole('article', { name: 'Citizen case', exact: true })
    .first();
  await expect(
    card.getByRole('button', { name: 'Upvote', exact: true }),
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: 'Downvote', exact: true }),
  ).toBeVisible();
  await expect(card.locator('.vote-summary')).toContainText('2 votes');
  await expect(card.locator('.discussion-comment')).toHaveCount(2);
  await expect(
    card.getByLabel('Add a comment', { exact: true }),
  ).toHaveAttribute('readonly', '');
  await expect(card.locator('.comment-heading strong').first()).toHaveText(
    'Anonymous',
  );
  await expect(card.locator('time').last()).toContainText('hours ago');
  await card
    .getByRole('button', { name: 'Show all comments (26)', exact: true })
    .click();
  await expect(card.locator('.comment-thread')).toHaveCount(10);
  await card
    .getByRole('button', { name: 'Load more comments', exact: true })
    .click();
  await expect(card.locator('.comment-thread')).toHaveCount(14);
  const firstThread = card.locator('.comment-thread').first();
  await firstThread
    .getByRole('button', { name: 'Show 12 replies', exact: true })
    .click();
  await expect(
    firstThread.locator('.comment-replies .discussion-comment'),
  ).toHaveCount(10);
  await firstThread
    .getByRole('button', { name: 'Show more replies', exact: true })
    .click();
  await expect(
    firstThread.locator('.comment-replies .discussion-comment'),
  ).toHaveCount(12);
  await firstThread
    .getByRole('button', { name: 'Hide replies', exact: true })
    .click();
  await expect(firstThread.locator('.comment-replies')).toHaveCount(0);
  await card
    .getByRole('button', { name: 'Show fewer comments', exact: true })
    .click();
  await expect(card.locator('.comment-thread')).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await card.screenshot({ path: info.outputPath('case-discussion-feed.png') });
  const publicBody = await (await request.get('/api/cases')).text();
  expect(publicBody).not.toMatch(
    /user_id|owner_id|@fixtures.invalid|11111111-1111/,
  );
  await card.getByRole('link', { name: 'Open case', exact: true }).click();
  await expect(page).toHaveURL('/cases/' + caseId);
  await expect(page).toHaveURL('/cases/' + caseId);
  await expect(
    page.getByRole('heading', { name: 'Community discussion' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Upvote', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reply', exact: true }),
  ).toHaveCount(2);
  expect(errors).toEqual([]);
});
test('signed-in votes toggle, persist and stay synchronized between cards and detail', async ({
  page,
}) => {
  await signin(page, 'citizen@fixtures.invalid', '/cases');
  const card = page
    .getByRole('article', { name: 'Citizen case', exact: true })
    .first();
  const up = card.getByRole('button', { name: 'Upvote', exact: true }),
    down = card.getByRole('button', { name: 'Downvote', exact: true });
  await expect(up).toHaveAttribute('aria-pressed', 'true');
  await up.click();
  await expect(up).toHaveAttribute('aria-pressed', 'false');
  await expect(card.locator('.vote-summary')).toContainText('1 vote');
  await down.click();
  await expect(down).toHaveAttribute('aria-pressed', 'true');
  await expect(card.locator('.vote-summary')).toContainText('2 votes');
  await card.getByRole('link', { name: 'Open case', exact: true }).click();
  await expect(page).toHaveURL('/cases/' + caseId);
  await expect(
    page.getByRole('button', { name: 'Downvote', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Upvote', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Upvote', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Upvote', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});
test('comments and replies preserve text on failure, render safely, persist and allow author deletion', async ({
  page,
}, info) => {
  await signin(page, 'citizen@fixtures.invalid', '/cases');
  const card = page
    .getByRole('article', { name: 'Citizen case', exact: true })
    .first();
  const message = 'Useful example <img src=x onerror="window.injected=true">';
  await card.getByLabel('Add a comment', { exact: true }).fill(message);
  let failOnce = true;
  await page.route('**/api/cases/*/discussion', async (route) => {
    if (
      route.request().method() === 'POST' &&
      route.request().postDataJSON().action === 'comment' &&
      failOnce
    ) {
      failOnce = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Connection interrupted. Retry your comment.',
        }),
      });
    } else await route.continue();
  });
  await card.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(card.getByRole('alert')).toContainText('Connection interrupted');
  await expect(card.getByLabel('Add a comment', { exact: true })).toHaveValue(
    message,
  );
  await card.getByRole('button', { name: 'Comment', exact: true }).click();
  await expect(card.locator('.comment-body').first()).toHaveText(message);
  await expect(card.locator('.comment-body img')).toHaveCount(0);
  const thread = card.locator('.comment-thread').first();
  await thread.getByRole('button', { name: 'Reply', exact: true }).click();
  await thread
    .getByLabel('Reply to Anonymous')
    .fill('A reply supporting this observation.');
  await thread.getByRole('button', { name: 'Post reply', exact: true }).click();
  await expect(thread.locator('.comment-replies')).toContainText(
    'A reply supporting this observation.',
  );
  await page.screenshot({
    path: info.outputPath('case-comment-reply.png'),
    fullPage: false,
  });
  await card.getByRole('link', { name: 'Open case', exact: true }).click();
  await expect(page).toHaveURL('/cases/' + caseId);
  const detail = page.url();
  const root = page.locator('.comment-thread').first();
  await expect(root.locator('.comment-body').first()).toHaveText(message);
  await root.getByRole('button', { name: 'Show 1 reply', exact: true }).click();
  await expect(root.locator('.comment-replies')).toContainText(
    'A reply supporting this observation.',
  );
  await root
    .locator('.discussion-comment')
    .first()
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Delete your comment?' })
    .getByRole('button', { name: 'Delete comment', exact: true })
    .click();
  await expect(root.locator('.comment-body').first()).toHaveText(
    'This comment was deleted.',
  );
  await page.reload();
  await expect(page).toHaveURL(detail);
  await expect(page.locator('.comment-body').first()).toHaveText(
    'This comment was deleted.',
  );
});
test('signed-out voting asks for signin; comment failures can be retried without losing previews', async ({
  page,
}) => {
  await page.goto('/cases');
  const card = page
    .getByRole('article', { name: 'Citizen case', exact: true })
    .first();
  let failOnce = true;
  await page.route('**/discussion?view=comments**', async (route) => {
    if (failOnce) {
      failOnce = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Comments temporarily unavailable.' }),
      });
    } else await route.continue();
  });
  await card
    .getByRole('button', { name: 'Show all comments (26)', exact: true })
    .click();
  await expect(card.getByRole('alert')).toContainText(
    'temporarily unavailable',
  );
  await expect(card.locator('.comment-thread')).toHaveCount(2);
  await card
    .getByRole('button', { name: 'Retry comments', exact: true })
    .click();
  await expect(card.locator('.comment-thread')).toHaveCount(10);
  await card.getByRole('button', { name: 'Upvote', exact: true }).click();
  await expect(page).toHaveURL(/\/signin\?next=%2Fcases$/);
});

test('a reply to a long thread appears immediately without skipping unloaded replies', async ({
  page,
}) => {
  await signin(page, 'citizen@fixtures.invalid', '/cases');
  const card = page
    .getByRole('article', { name: 'Citizen case', exact: true })
    .first();
  const thread = card.locator('.comment-thread').first();
  await thread.getByRole('button', { name: 'Reply', exact: true }).click();
  await thread
    .getByLabel('Reply to Anonymous')
    .fill('Newest reply in a long discussion.');
  await thread.getByRole('button', { name: 'Post reply', exact: true }).click();
  await expect(
    thread.locator('.comment-replies .discussion-comment'),
  ).toHaveCount(11);
  await expect(thread.locator('.comment-replies')).toContainText(
    'Newest reply in a long discussion.',
  );
  await thread
    .getByRole('button', { name: 'Show more replies', exact: true })
    .click();
  await expect(
    thread.locator('.comment-replies .discussion-comment'),
  ).toHaveCount(13);
  await expect(
    thread.locator('.comment-replies .comment-body').last(),
  ).toHaveText('Newest reply in a long discussion.');
});
