import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:54331/__test/reset')).ok()).toBe(
    true,
  );
});

// SDK WebSocket protocol fixture; API reads and mutations below use real PostgreSQL.
async function realtime(page: Page) {
  let emit: () => void = () => {
    throw new Error('Realtime has not subscribed');
  };
  await page.routeWebSocket('**/realtime/v1/websocket**', (socket) => {
    socket.onMessage((message) => {
      const [join, ref, topic, event, payload] = JSON.parse(message.toString());
      if (event === 'phx_join') {
        const change = payload.config.postgres_changes[0];
        expect(change).toMatchObject({
          event: 'UPDATE',
          schema: 'public',
          table: 'issue_feed_state',
        });
        socket.send(
          JSON.stringify([
            join,
            ref,
            topic,
            'phx_reply',
            {
              status: 'ok',
              response: { postgres_changes: [{ id: 1, ...change }] },
            },
          ]),
        );
        emit = () =>
          socket.send(
            JSON.stringify([
              null,
              null,
              topic,
              'postgres_changes',
              {
                ids: [1],
                data: {
                  schema: 'public',
                  table: 'issue_feed_state',
                  type: 'UPDATE',
                  columns: [],
                  record: {
                    id: 1,
                    revision: 999,
                    updated_at: new Date().toISOString(),
                  },
                  old_record: { id: 1 },
                  commit_timestamp: new Date().toISOString(),
                  errors: null,
                },
              },
            ]),
          );
      } else if (event === 'heartbeat' || event === 'phx_leave')
        socket.send(
          JSON.stringify([
            join,
            ref,
            topic,
            'phx_reply',
            { status: 'ok', response: {} },
          ]),
        );
    });
  });
  return () => emit();
}

test('ten time-ranked issues per page, stable ties and a bounded public API', async ({
  page,
  request,
}) => {
  await page.goto('/issues');
  await expect(page.locator('.case-card')).toHaveCount(10);
  await expect(page.getByLabel('Sort by')).toHaveValue('trending');
  let response = await (await request.get('/api/issues')).json();
  expect(response.items).toHaveLength(10);
  expect(response.items[0].discussion.total_votes).toBe(2);
  expect(response.items[0].discussion.total_comments).toBe(26);
  expect(response.items[0].discussion.threads.wanted.preview).toEqual([]);
  const all = [...response.items];
  while (response.hasMore) {
    response = await (
      await request.get(
        '/api/issues?' +
          new URLSearchParams(
            Object.entries(response.nextCursor).map(([k, v]) => [k, String(v)]),
          ),
      )
    ).json();
    expect(response.items.length).toBeLessThanOrEqual(10);
    all.push(...response.items);
  }
  expect(all).toHaveLength(26);
  expect(new Set(all.map((r: any) => r.id)).size).toBe(26);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(26);
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toHaveCount(0);
  expect(JSON.stringify(all)).not.toMatch(/owner_id|user_id|@fixtures/);
});

test('live graphics react to outside publishing and deletion; leaderboard rows reveal topic details', async ({
  page,
  request,
}, info) => {
  const notify = await realtime(page);
  await page.goto('/issues');
  await expect(page.locator('.live-status')).toHaveText('Live');
  await expect(
    page.getByRole('button', { name: 'Unclassified: 26 issues', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.topic-row')).toHaveCount(1);
  expect(
    (
      await request.post('http://127.0.0.1:54331/__test/activity', {
        data: { action: 'publish' },
      })
    ).ok(),
  ).toBe(true);
  notify();
  await expect(
    page.getByRole('button', { name: 'Unclassified: 27 issues', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Refresh issues', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: 'Unclassified: 27 issues',
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('overview.png') });
  await page
    .locator('.issue-overview')
    .screenshot({ path: info.outputPath('overview-panel.png') });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const circle = page.locator('.topic-row').first();
  await circle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.topic-detail')).toContainText('Unclassified');
  await expect(page.locator('.topic-detail')).toContainText('27 issues');
  await expect(
    page.getByRole('button', { name: 'Unclassified: 27 issues', exact: true }),
  ).toBeVisible(); // global overview
  await request.post('http://127.0.0.1:54331/__test/activity', {
    data: { action: 'delete' },
  });
  notify();
  await expect(
    page.getByRole('button', { name: 'Unclassified: 26 issues', exact: true }),
  ).toBeVisible();
  const publicStats = JSON.stringify(
    await (await request.get('/api/issues/overview')).json(),
  );
  expect(publicStats).not.toMatch(
    /owner|user_id|email|@fixtures|description|transcript/,
  );
});

test('changed rankings require a refresh, while failed overview updates retain the last counts', async ({
  page,
  request,
}) => {
  const notify = await realtime(page);
  await page.goto('/issues');
  await expect(page.locator('.live-status')).toHaveText('Live');
  const snapshot = await (await request.get('/api/issues/overview')).json();
  // Freeze auto-refresh so this specifically exercises the SQL cursor-conflict path.
  await page.route('**/api/issues/overview', (route) =>
    route.fulfill({ json: snapshot }),
  );
  await request.post('http://127.0.0.1:54331/__test/activity', {
    data: { action: 'publish' },
  });
  await request.post('http://127.0.0.1:54331/__test/activity', {
    data: { action: 'vote' },
  });
  // Force the load-more boundary to discover a changed revision, without a live event.
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Refresh issues', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.case-card')).toHaveCount(10);
  await page.unroute('**/api/issues/overview');
  await page
    .getByRole('button', { name: 'Refresh issues', exact: true })
    .click();
  await expect(page.locator('.case-card').first()).toContainText(
    'Live overview fixture',
  );
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Unclassified: 27 issues', exact: true }),
  ).toBeVisible();
  await page.route('**/api/issues/overview', (route) =>
    route.fulfill({
      status: 503,
      json: { message: 'Fixture overview outage' },
    }),
  );
  notify();
  await expect(page.locator('.live-status')).toHaveText('Updates delayed');
  await expect(
    page.getByRole('button', { name: 'Unclassified: 27 issues', exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/issues/overview');
  await page
    .getByRole('button', { name: 'Retry overview', exact: true })
    .click();
  await expect(page.locator('.live-status')).toHaveText('Live');
});

test('polling refreshes the overview when realtime is unavailable', async ({
  page,
  request,
}) => {
  let socketAttempted!: () => void;
  const attempted = new Promise<void>((resolve) => (socketAttempted = resolve));
  await page.routeWebSocket('**/realtime/v1/websocket**', (socket) => {
    socketAttempted();
    socket.close();
  });
  await page.clock.install();
  const initial = page.waitForResponse('**/api/issues/overview');
  await page.goto('/issues');
  await Promise.all([initial, attempted]);
  await expect(
    page.getByRole('button', { name: 'Refresh overview' }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Unclassified: 26 issues', exact: true }),
  ).toBeVisible();
  await request.post('http://127.0.0.1:54331/__test/activity', {
    data: { action: 'publish' },
  });
  await page.clock.runFor(11000);
  await expect(
    page.getByRole('button', { name: 'Unclassified: 27 issues', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.live-status')).toHaveText('Auto-updating');
});

test('topic and text search apply before loading more ranked issues', async ({
  page,
  request,
}) => {
  await page.goto('/issues');
  await expect(page.getByLabel('Topic', { exact: true })).toHaveValue('');
  await expect(page.getByRole('option', { name: 'Unclassified' })).toHaveCount(
    1,
  );
  const fixture = await request.post('http://127.0.0.1:54331/__test/activity', {
    data: { action: 'topics' },
  });
  expect(fixture.ok()).toBe(true);
  await page.reload();
  await expect(page.locator('.topic-row')).toHaveCount(2);
  const assigned = page.getByRole('button', {
    name: 'Citation checks: 15 issues',
    exact: true,
  });
  const unclassified = page.getByRole('button', {
    name: 'Unclassified: 11 issues',
    exact: true,
  });
  await expect(unclassified).toBeVisible();
  await expect(page.locator('.topic-name')).toHaveText([
    'Citation checks',
    'Unclassified',
  ]);
  await assigned.click();
  await expect(page.locator('.topic-detail')).toContainText('Citation checks');
  await expect(page.getByLabel('Principle', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Search issues').fill('Fixture citizen perspective');
  await page
    .getByLabel('Topic', { exact: true })
    .selectOption({ label: 'Citation checks' });
  await expect(page).toHaveURL(/topic=fixture-citations/);
  await expect(page.locator('.case-card')).toHaveCount(10);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(15);
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toHaveCount(0);
});

test('sort dropdown preserves filters and resets pagination', async ({
  page,
}) => {
  await page.goto('/issues');
  await page.getByLabel('Search issues').fill('Fixture citizen perspective');
  await page.getByLabel('Sort by').selectOption('discussed');
  await expect(page).toHaveURL(/sort=discussed/);
  await expect(page.locator('.case-card')).toHaveCount(10);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(20);
  await page.getByLabel('Sort by').selectOption('controversial');
  await expect(page.locator('.case-card')).toHaveCount(0);
  await expect(page.getByLabel('Search issues')).toHaveValue(
    'Fixture citizen perspective',
  );
  await page
    .locator('.filter-bar')
    .getByRole('link', { name: 'Reset filters', exact: true })
    .click();
  await expect(page.getByLabel('Sort by')).toHaveValue('trending');
  await expect(page.locator('.case-card')).toHaveCount(10);
  await page.getByLabel('Sort by').selectOption('controversial');
  await expect(page.locator('.case-card')).toHaveCount(1);
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toHaveCount(0);
});

test('topic leaderboard ranks the full catalog and pages five rows with arrow controls', async ({
  page,
  request,
}) => {
  const stats = await (await request.get('/api/issues/overview')).json();
  let topics = Array.from({ length: 12 }, (_, i) => ({
    id: 'synthetic-topic-' + (i + 1),
    name: 'Synthetic topic ' + (i + 1),
    count: i + 1,
  }));
  let revision = 10000000;
  await page.route('**/api/issues/overview', (route) =>
    route.fulfill({
      json: { ...stats, topics, revision: String(revision) },
    }),
  );
  await page.goto('/issues');
  const rows = page.locator('.topic-row');
  const up = page.getByRole('button', { name: 'Previous five topics' });
  const down = page.getByRole('button', { name: 'Next five topics' });
  await expect(rows).toHaveCount(5);
  await expect(page.locator('.topic-count')).toHaveText([
    '12',
    '11',
    '10',
    '9',
    '8',
  ]);
  await expect(page.locator('.topic-rank')).toHaveText([
    '1',
    '2',
    '3',
    '4',
    '5',
  ]);
  await expect(up).toBeDisabled();
  await down.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.topic-count')).toHaveText([
    '7',
    '6',
    '5',
    '4',
    '3',
  ]);
  await expect(page.locator('.topic-pagination')).toContainText(
    '6–10 of 12 topics',
  );
  await down.click();
  await expect(rows).toHaveCount(2);
  await expect(page.locator('.topic-rank')).toHaveText(['11', '12']);
  await expect(down).toBeDisabled();
  await rows.first().click();
  await expect(page.locator('.topic-detail')).toContainText(
    'Synthetic topic 2',
  );
  await up.click();
  await expect(rows).toHaveCount(5);
  await expect(page.locator('.topic-count')).toHaveText([
    '7',
    '6',
    '5',
    '4',
    '3',
  ]);
  // A live catalog replacement clamps an out-of-range page and breaks ties by name.
  topics = [
    { id: 'zulu', name: 'Zulu', count: 2 },
    { id: 'alpha', name: 'Alpha', count: 2 },
  ];
  revision++;
  await page
    .getByRole('button', { name: 'Refresh overview', exact: true })
    .click();
  await expect(rows).toHaveCount(2);
  await expect(page.locator('.topic-name')).toHaveText(['Alpha', 'Zulu']);
  await expect(up).toBeDisabled();
  await expect(down).toBeDisabled();
  await expect(page.locator('.topic-detail')).toHaveCount(0);
});
