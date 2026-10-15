import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.goto('/chatbot');
  await expect(page).toHaveURL(/\/signin\?next=%2Fchatbot$/);
  await expect(page.locator('form[data-ready=true]')).toBeVisible();
  await page.getByLabel('Email address').fill('citizen@fixtures.invalid');
  await page.getByLabel('Password', { exact: true }).fill('fixturepass123');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/chatbot$/);
  await expect(page.getByLabel('Message', { exact: true })).toBeEnabled();
}

async function send(page: Page, text: string) {
  const count = await page.locator('.chat-message').count();
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.chat-message')).toHaveCount(count + 2);
}

test('chatbot: server authentication, latest-message rules, safe input and ephemeral lifecycle', async ({
  page,
  request,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const signedOut = await request.get('/chatbot', { maxRedirects: 0 });
  expect(signedOut.status()).toBe(303);
  expect(signedOut.headers().location).toBe('/signin?next=%2Fchatbot');
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Chatbot', exact: true })
    .click();
  await expect(page).toHaveURL(/\/signin\?next=%2Fchatbot$/);
  await signIn(page);
  await expect(
    page.getByRole('heading', { name: 'Chatbot', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#chatbot-introduction')).toContainText(
    'Some replies are intentionally flawed',
  );
  await expect(
    page.getByRole('button', { name: 'Send', exact: true }),
  ).toBeDisabled();
  const input = page.getByLabel('Message', { exact: true });
  await input.fill(' \n\t ');
  await expect(
    page.getByRole('button', { name: 'Send', exact: true }),
  ).toBeDisabled();
  await input.press('Enter');
  await expect(page.locator('.chat-message')).toHaveCount(0);

  // All matching stays in memory: no message or reply requests may leave this page.
  const requests: string[] = [];
  const trackRequest = (req: { url(): string }) => requests.push(req.url());
  page.on('request', trackRequest);
  const storageBefore = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage },
    cookie: document.cookie,
  }));
  await send(page, 'Hello, can you help me? Are you human?');
  await expect(page.locator('.chat-message').last()).toContainText(
    'not a person',
  );
  await send(page, 'password');
  await expect(page.locator('.chat-message').last()).toContainText(
    'Do not share your password',
  );
  await send(page, 'tell me more');
  await expect(page.locator('.chat-message').last()).toContainText(
    'do not have a predefined reply',
  );
  const unsafe = '<img src=x onerror="window.chatbotInjected=true">';
  await send(page, unsafe);
  await expect(page.locator('.user-message').last().locator('p')).toHaveText(
    unsafe,
  );
  await expect(
    page.locator('.chat-message img, .chat-message script'),
  ).toHaveCount(0);
  await expect(page.getByRole('log')).toHaveAttribute('aria-live', 'polite');
  expect(
    await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
      cookie: document.cookie,
    })),
  ).toEqual(storageBefore);
  expect(requests).toEqual([]);
  page.off('request', trackRequest);
  expect(page.url()).toMatch(/\/chatbot$/);

  // A repeated click is guarded synchronously, including programmatic duplicate submit events.
  await input.fill('thank you');
  await page.locator('.chat-composer').evaluate((form: HTMLFormElement) => {
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page.locator('.chat-message')).toHaveCount(10);
  await expect(page.locator('.chat-message').last()).toContainText(
    'You are welcome',
  );

  const touch = await page.evaluate(
    () =>
      navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches,
  );
  await input.fill('line one');
  await input.press(touch ? 'Enter' : 'Shift+Enter');
  await input.pressSequentially('line two');
  await expect(input).toHaveValue('line one\nline two');
  if (touch) {
    await page.getByRole('button', { name: 'Send', exact: true }).click();
  } else {
    await input.press('Enter');
  }
  await expect(page.locator('.chat-message')).toHaveCount(12);
  await expect(input).toHaveValue('');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('chatbot.png'),
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Constitutions', exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/chatbot$/);
  await expect(page.locator('.chat-message')).toHaveCount(0);
  await expect(input).toHaveValue('');
  await send(page, 'hello');
  await page.reload();
  await expect(page.locator('.chat-message')).toHaveCount(0);
  await expect(input).toHaveValue('');
  await send(page, 'hello');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Your account' }).click();
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await signIn(page);
  await expect(page.locator('.chat-message')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('chatbot: scroll following, reading-position preservation and compact keyboard viewport', async ({
  page,
}, info) => {
  await signIn(page);
  for (let index = 0; index < 14; index++) await send(page, `hello ${index}`);
  const log = page.getByRole('log');
  await expect
    .poll(() =>
      log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight),
    )
    .toBeLessThan(80);
  await log.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event('scroll'));
  });
  const scrollPosition = await log.evaluate((el) => el.scrollTop);
  // Keyboard submit keeps focus in the composer and does not request native button scrolling.
  await page.getByLabel('Message', { exact: true }).fill('photosynthesis');
  await page
    .locator('.chat-composer')
    .evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(page.locator('.chat-message')).toHaveCount(30);
  expect(await log.evaluate((el) => el.scrollTop)).toBe(scrollPosition);
  await log.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
  await send(page, 'hello');
  await expect
    .poll(() =>
      log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight),
    )
    .toBeLessThan(80);
  await log.focus();
  await page.keyboard.press('Home');
  await expect(log).toBeFocused();

  const original = page.viewportSize()!;
  await page.setViewportSize({ width: original.width, height: 320 });
  const composer = page.locator('.chat-composer');
  await expect(composer).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole('button', { name: 'Send', exact: true }),
  ).toBeInViewport({ ratio: 1 });
  const box = await composer.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(320);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath('chatbot-compact.png'),
    fullPage: true,
  });
  await page.setViewportSize(original);
});

test('chatbot: 50 hints in a keyboard-accessible modal beside the heading', async ({
  page,
}, info) => {
  await signIn(page);
  const hints = page.getByRole('button', { name: 'Hints', exact: true });
  await hints.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Explore the chatbot' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('li')).toHaveCount(50);
  await expect(dialog.locator('li').first()).toContainText('Greetings');
  await expect(dialog.locator('li button, li a')).toHaveCount(0);
  await expect(
    dialog.getByRole('button', { name: 'Close', exact: true }),
  ).toBeFocused();
  expect(await dialog.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await page.screenshot({
    path: info.outputPath('chatbot-hints.png'),
    fullPage: true,
  });
  await dialog.locator('li').last().scrollIntoViewIfNeeded();
  await expect(dialog.locator('li').last()).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(hints).toBeFocused();
  await hints.click();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(hints).toBeFocused();
});

test('chatbot: selected exchange creates a public immutable case, supports optional screenshots, edits and deletion', async ({
  page,
  request,
}, info) => {
  await signIn(page);
  const prompt = 'hello <img src=x onerror="window.evidenceInjected=true">';
  const response = 'Hello. What would you like to talk about?';
  await send(page, prompt);
  await send(page, 'What is the capital of Australia?');
  await expect(
    page.getByRole('button', { name: 'Create a case', exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole('button', { name: 'Create a case', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/submit\?source=chatbot$/);
  const evidence = page.getByRole('region', { name: 'Attached chat exchange' });
  await expect(evidence).toBeVisible();
  await expect(
    evidence
      .getByRole('article', { name: 'Attached user prompt' })
      .locator('p'),
  ).toHaveText(prompt);
  await expect(
    evidence
      .getByRole('article', { name: 'Attached chatbot response' })
      .locator('p'),
  ).toHaveText(response);
  await expect(evidence.locator('input,textarea,img,script')).toHaveCount(0);
  await expect(evidence).not.toContainText('Australia');
  await expect(page.locator('#screenshots-label')).toContainText('Optional');
  const description = 'Chat evidence browser fixture ' + Date.now();
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill(description);
  await page
    .getByLabel('Proposed constitutional improvement', { exact: false })
    .fill('Explain what is known and how it can be checked.');
  await page.getByLabel('Constitution being addressed').selectOption('2');
  await page.screenshot({
    path: info.outputPath('chat-case-form.png'),
    fullPage: true,
  });
  let failOnce = true;
  await page.route('**/api/save', async (route) => {
    if (route.request().postDataJSON().stage === 'commit' && failOnce) {
      failOnce = false;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Fixture connection interrupted; please retry.',
        }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Submit case', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('connection interrupted');
  await expect(evidence).toContainText(prompt);
  await expect(
    page.getByRole('textbox', { name: 'Description', exact: true }),
  ).toHaveValue(description);
  await page.getByRole('button', { name: 'Submit case', exact: true }).click();
  await expect(page).toHaveURL(/\/cases\/[a-f0-9-]+$/);
  const detail = page.url(),
    id = detail.split('/').pop()!;
  await expect(evidence).toContainText(prompt);
  await expect(
    page.getByRole('heading', { name: 'Chatbot screenshots', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('chat-case-detail.png'),
    fullPage: true,
  });
  const result = await (
    await request.get('/api/cases?q=' + encodeURIComponent(description))
  ).json();
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({
    chat_prompt: prompt,
    chat_response: response,
    screenshots: [],
  });
  expect(JSON.stringify(result)).not.toMatch(
    /owner_id|user_id|@fixtures\.invalid|matchedRuleId/,
  );
  const publicContext = await page.context().browser()!.newContext();
  const visitor = await publicContext.newPage();
  await visitor.goto(detail);
  await expect(
    visitor.getByRole('region', { name: 'Attached chat exchange' }),
  ).toContainText(response);
  await expect(
    visitor.getByRole('link', { name: 'Edit case', exact: true }),
  ).toHaveCount(0);
  await publicContext.close();

  const tamper = await page.evaluate(
    async ({ id, description }) => {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          stage: 'commit',
          id,
          version: 2,
          constitution: 2,
          description,
          improvement: 'Updated proposal',
          paths: [],
          exchange: { prompt: 'forged', response: 'forged' },
        }),
      });
      return { status: res.status, body: await res.json() };
    },
    { id, description },
  );
  expect(tamper.status).toBe(400);
  expect(tamper.body.message).toContain('read-only');
  await page.getByRole('link', { name: 'Edit case', exact: true }).click();
  await expect(evidence).toContainText(prompt);
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill(description + ' updated');
  await page.locator('#screenshots').setInputFiles({
    name: 'optional.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(detail);
  await expect(
    page.getByRole('button', { name: 'Enlarge screenshot 1' }),
  ).toBeVisible();
  await expect(evidence).toContainText(response);
  await page.getByRole('link', { name: 'Edit case', exact: true }).click();
  await page.getByRole('button', { name: 'Remove screenshot 1' }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(detail);
  await expect(
    page.getByRole('button', { name: 'Enlarge screenshot 1' }),
  ).toHaveCount(0);
  await expect(evidence).toContainText(prompt);
  await page.getByRole('button', { name: 'Delete case', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete this case?' })
    .getByRole('button', { name: 'Delete case', exact: true })
    .click();
  await expect(page).toHaveURL(/\/my-cases\?deleted=1$/);
  await page.goto(detail);
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});

test('chatbot: fallback evidence transfers, refreshing discards unsaved evidence and restores screenshot requirement', async ({
  page,
}) => {
  await signIn(page);
  await send(page, 'xyzzy');
  await page
    .getByRole('button', { name: 'Create a case', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Attached chat exchange' }),
  ).toContainText('do not have a predefined reply');
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Attached chat exchange' }),
  ).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('no longer available');
  await expect(page.locator('#screenshots-label')).toContainText('Required');
  await page
    .getByRole('textbox', { name: 'Description', exact: true })
    .fill('Ordinary case without evidence');
  await page
    .getByLabel('Proposed constitutional improvement', { exact: false })
    .fill('Clarify the sample principle.');
  await page.getByLabel('Constitution being addressed').selectOption('2');
  await page.getByRole('button', { name: 'Submit case', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'one to five screenshots',
  );
});
