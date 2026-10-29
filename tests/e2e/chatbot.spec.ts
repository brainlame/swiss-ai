import { test, expect, type Page } from '@playwright/test';

import { signin as signIn, send } from './helpers';

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

  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Home', exact: true })
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
  await page.getByRole('button', { name: 'Account' }).click();
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

test('chatbot: full snapshot is read-only, screenshot-free and persists through save, edit and public detail', async ({
  page,
  request,
}, info) => {
  await signIn(page);
  const prompt = 'hello <img src=x onerror="window.evidenceInjected=true">';
  await send(page, prompt);
  await send(page, 'What is the capital of Australia?');
  const originals = await page.locator('.chat-message p').allTextContents();
  await page
    .getByRole('button', { name: 'Submit an issue', exact: true })
    .click();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue to issue', exact: true })
    .click();
  await expect(page).toHaveURL(/\/submit\?source=chatbot$/);
  const evidence = page.getByRole('region', { name: 'Attached conversation' });
  await expect(evidence.locator('article')).toHaveCount(4);
  expect(await evidence.locator('article p').allTextContents()).toEqual(
    originals,
  );
  await expect(evidence.locator('textarea,input,img,script')).toHaveCount(0);
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(
    page.getByRole('radio', { name: 'Bad / unwanted behavior' }),
  ).toBeChecked();
  const description = 'Full conversation browser fixture';
  await page.getByLabel('Description', { exact: false }).fill(description);
  await page
    .getByLabel('Proposed constitutional improvement', { exact: false })
    .fill('Explain how an answer can be verified.');
  await page
    .getByLabel('Constitution being addressed', { exact: false })
    .selectOption('2');
  await page.getByRole('radio', { name: 'Good / wanted behavior' }).check();
  await page.screenshot({
    path: info.outputPath('conversation-case-form.png'),
    fullPage: true,
  });
  let failOnce = true;
  await page.route('**/api/save', async (route) => {
    if (failOnce) {
      failOnce = false;
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Fixture connection interrupted; retry.',
        }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Submit issue', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('connection interrupted');
  await expect(page.getByLabel('Description', { exact: false })).toHaveValue(
    description,
  );
  await expect(evidence.locator('article')).toHaveCount(4);
  await page.getByRole('button', { name: 'Submit issue', exact: true }).click();
  await expect(page).toHaveURL(/\/issues\/[a-f0-9-]+$/);
  const detail = page.url();
  await expect(evidence.locator('article')).toHaveCount(4);
  await expect(page.locator('.behavior-label')).toHaveText(
    'Good / wanted behavior',
  );
  await page.screenshot({
    path: info.outputPath('conversation-case-detail.png'),
    fullPage: true,
  });
  const result = await (
    await request.get('/api/issues?q=' + encodeURIComponent(description))
  ).json();
  expect(result.items).toHaveLength(1);
  expect(result.items[0].transcript).toBeUndefined();
  expect(result.items[0]).toMatchObject({ behavior: 'good', screenshots: [] });
  expect(JSON.stringify(result)).not.toMatch(
    /owner_id|user_id|@fixtures\.invalid|matchedRuleId/,
  );
  const publicContext = await page.context().browser()!.newContext();
  const visitor = await publicContext.newPage();
  await visitor.goto(detail);
  await expect(
    visitor
      .getByRole('region', { name: 'Attached conversation' })
      .locator('article'),
  ).toHaveCount(4);
  await expect(
    visitor.getByRole('link', { name: 'Edit issue', exact: true }),
  ).toHaveCount(0);
  await publicContext.close();
  await page.getByRole('link', { name: 'Edit issue', exact: true }).click();
  await expect(evidence.locator('article')).toHaveCount(4);
  await page
    .getByLabel('Description', { exact: false })
    .fill(description + ' updated');
  await page.getByRole('radio', { name: 'Bad / unwanted behavior' }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page).toHaveURL(detail);
  expect(await evidence.locator('article p').allTextContents()).toEqual(
    originals,
  );
  await expect(page.locator('.behavior-label')).toHaveText(
    'Bad / unwanted behavior',
  );
  await page.getByRole('button', { name: 'Delete issue', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete this issue?' })
    .getByRole('button', { name: 'Delete issue', exact: true })
    .click();
  await expect(page).toHaveURL(/\/my-issues\?deleted=1$/);
  await page.goto(detail);
  await expect(
    page.getByRole('heading', { name: 'Page not found' }),
  ).toBeVisible();
});

test('chatbot: missing or refreshed snapshots return to Chatbot with guidance', async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole('button', { name: 'Submit an issue', exact: true }),
  ).toBeDisabled();
  await page.goto('/submit');
  await expect(page).toHaveURL(/\/chatbot$/);
  await send(page, 'xyzzy');
  await page
    .getByRole('button', { name: 'Submit an issue', exact: true })
    .click();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue to issue', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Attached conversation' }),
  ).toContainText('do not have a predefined reply');
  await page.reload();
  await expect(page).toHaveURL(/\/chatbot\?evidence=missing$/);
  await expect(page.getByRole('status')).toContainText(
    'snapshot is no longer available',
  );
  await expect(page.locator('input[type=file]')).toHaveCount(0);
});
