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

test('ten upvote-ranked issues per page, stable ties and a bounded public API', async ({
  page,
  request,
}) => {
  await page.goto('/issues');
  await expect(page.locator('.case-card')).toHaveCount(10);
  await expect(page.getByLabel('Sort by')).toHaveCount(0);
  let response = await (await request.get('/api/issues')).json();
  expect(response.items).toHaveLength(10);
  expect(response.items[0].discussion.upvotes).toBe(1);
  expect(response.items[0].discussion.downvotes).toBe(1);
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
  expect(all.map((r: any) => r.upvotes)).toEqual(
    all.map((r: any) => r.upvotes).sort((a: number, b: number) => b - a),
  );
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(20);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(26);
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toHaveCount(0);
  expect(JSON.stringify(all)).not.toMatch(/owner_id|user_id|@fixtures/);
});

test('live graphics react to outside publishing, classification and deletion; circles filter the feed', async ({
  page,
  request,
}, info) => {
  const notify = await realtime(page);
  await page.goto('/issues');
  await expect(page.locator('.live-status')).toHaveText('Live');
  await expect(page.locator('.donut-total strong')).toHaveText('26');
  await expect(page.locator('.principle-bubble')).toHaveCount(11);
  await expect(page.locator('.behavior-legend')).toContainText('Unclassified');
  expect(
    (
      await request.post('http://127.0.0.1:54331/__test/activity', {
        data: { action: 'publish' },
      })
    ).ok(),
  ).toBe(true);
  notify();
  await expect(page.locator('.donut-total strong')).toHaveText('27');
  await expect(
    page.getByRole('button', { name: 'Refresh issues', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toBeDisabled();
  const stats = await (await request.get('/api/issues/overview')).json();
  await expect(
    page.getByRole('link', {
      name: `Principle #11: ${stats.constitutions[10].count} issues. Filter issues.`,
      exact: true,
    }),
  ).toBeVisible();
  await request.post('http://127.0.0.1:54331/__test/activity', {
    data: { action: 'reclassify' },
  });
  notify();
  await expect
    .poll(
      async () =>
        await page.locator('.behavior-legend strong').allTextContents(),
    )
    .toEqual([
      String(stats.behaviors.good - 1),
      String(stats.behaviors.bad + 1),
      String(stats.behaviors.unclassified),
    ]);
  await page.screenshot({ path: info.outputPath('overview.png') });
  await page
    .locator('.issue-overview')
    .screenshot({ path: info.outputPath('overview-panel.png') });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const circle = page.locator('.principle-bubble').nth(1);
  await circle.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/constitution=2/);
  await expect(page.locator('.case-card')).toHaveCount(3);
  await expect(page.locator('.donut-total strong')).toHaveText('27'); // global overview
  await request.post('http://127.0.0.1:54331/__test/activity', {
    data: { action: 'delete' },
  });
  notify();
  await expect(page.locator('.donut-total strong')).toHaveText('26');
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
  await expect(page.locator('.donut-total strong')).toHaveText('27');
  await page.route('**/api/issues/overview', (route) =>
    route.fulfill({
      status: 503,
      json: { message: 'Fixture overview outage' },
    }),
  );
  notify();
  await expect(page.locator('.live-status')).toHaveText('Updates delayed');
  await expect(page.locator('.donut-total strong')).toHaveText('27');
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
  await expect(page.locator('.donut-total strong')).toHaveText('26');
  await request.post('http://127.0.0.1:54331/__test/activity', {
    data: { action: 'publish' },
  });
  await page.clock.runFor(11000);
  await expect(page.locator('.donut-total strong')).toHaveText('27');
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
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toBeEnabled();
  await page.getByLabel('Search issues').fill('Fixture citizen perspective');
  await page
    .getByLabel('Topic', { exact: true })
    .selectOption({ label: 'Citation checks' });
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page).toHaveURL(/topic=fixture-citations/);
  await expect(page.locator('.case-card')).toHaveCount(10);
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('.case-card')).toHaveCount(15);
  await expect(
    page.getByRole('button', { name: 'Load more', exact: true }),
  ).toHaveCount(0);
});
