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
