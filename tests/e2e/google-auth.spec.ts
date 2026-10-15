import { test, expect } from '@playwright/test';

test('Google OAuth: sign-in and sign-up both use Supabase PKCE and persist a verified session', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of ['signin', 'signup']) {
    await page.goto('/' + path + '?next=%2Fchatbot');
    const button = page.getByRole('button', {
      name: 'Continue with Google',
      exact: true,
    });
    await expect(button).toBeVisible();
    await expect(page.getByLabel('Email address')).toHaveValue('');
    await page.screenshot({
      path: info.outputPath(path + '-google.png'),
      fullPage: true,
    });
    const start = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname === '/auth/google' &&
        res.request().method() === 'POST',
    );
    await button.focus();
    await page.keyboard.press('Enter');
    const response = await start;
    expect(response.status()).toBe(303);
    const authorize = new URL(response.headers().location);
    expect(authorize.pathname).toBe('/auth/v1/authorize');
    expect(authorize.searchParams.get('provider')).toBe('google');
    expect(authorize.searchParams.get('code_challenge')).toBeTruthy();
    expect(
      authorize.searchParams.get('code_challenge_method')?.toLowerCase(),
    ).toBe('s256');
    expect(authorize.searchParams.has('skip_http_redirect')).toBe(false);
    const callback = new URL(authorize.searchParams.get('redirect_to')!);
    expect(callback.origin).toBe('http://127.0.0.1:4173');
    expect(callback.pathname).toBe('/auth/callback');
    expect(callback.searchParams.get('next')).toBe('/chatbot');
    await expect(page).toHaveURL(/\/chatbot$/);
    await expect(page.getByLabel('Message', { exact: true })).toBeEnabled();
    await page.reload();
    await expect(page).toHaveURL(/\/chatbot$/);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('button', { name: 'Your account' }).click();
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  }
  expect(errors).toEqual([]);
});

test('Google OAuth: rejects cross-site starts, unsafe destinations, callbacks without verifier and code replay', async ({
  page,
}) => {
  const request = page.context().request;
  const denied = await request.post('/auth/google', {
    form: { next: '/chatbot' },
    headers: { origin: 'https://evil.invalid' },
    maxRedirects: 0,
  });
  expect(denied.status()).toBe(403);
  const wrongMethod = await request.get('/auth/google', { maxRedirects: 0 });
  expect(wrongMethod.status()).toBe(405);
  const started = await request.post('/auth/google', {
    form: { next: '//evil.invalid' },
    headers: { origin: 'http://127.0.0.1:4173' },
    maxRedirects: 0,
  });
  expect(started.status()).toBe(303);
  const authorize = new URL(started.headers().location);
  expect(
    new URL(authorize.searchParams.get('redirect_to')!).searchParams.get(
      'next',
    ),
  ).toBe('/submit');
  const provider = await request.get(authorize.toString(), { maxRedirects: 0 });
  expect(provider.status()).toBe(302);
  const callback = provider.headers().location;
  const other = await page.context().browser()!.newContext();
  const stolen = await other.request.get(callback, { maxRedirects: 0 });
  expect(stolen.status()).toBe(303);
  expect(stolen.headers().location).toContain('/signin?authError=oauth');
  const protectedPage = await other.request.get(
    'http://127.0.0.1:4173/chatbot',
    { maxRedirects: 0 },
  );
  expect(protectedPage.headers().location).toBe('/signin?next=%2Fchatbot');
  await other.close();
  await page.goto(callback);
  await expect(page).toHaveURL(/\/submit$/);
  const replay = await request.get(callback, { maxRedirects: 0 });
  expect(replay.headers().location).toContain('/signin?authError=oauth');
});

test('Google OAuth: cancellation and expired links show a safe retry message and retain the intended page', async ({
  page,
}) => {
  await page.goto(
    '/auth/callback?provider=google&error=access_denied&error_description=private-provider-detail&next=%2Fmy-cases',
  );
  await expect(page).toHaveURL(/\/signin\?authError=oauth&next=%2Fmy-cases$/);
  await expect(page.getByRole('alert')).toContainText(
    'Google sign-in was canceled',
  );
  await expect(page.locator('body')).not.toContainText(
    'private-provider-detail',
  );
  await expect(page.locator('.google-auth input[name=next]')).toHaveValue(
    '/my-cases',
  );
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page).toHaveURL(/\/my-cases$/);
  await page.goto(
    '/auth/callback?provider=google&code=invalid&next=%2Fchatbot',
  );
  await expect(page).toHaveURL(/\/signin\?authError=oauth&next=%2Fchatbot$/);
  await expect(page.getByRole('alert')).toContainText('use email and password');
});
