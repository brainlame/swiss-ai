import { test, expect } from '@playwright/test';
import { signin } from './helpers';
test('email codes: existing and new accounts, leading zero, verified session, signout and retired routes', async ({
  page,
}, info) => {
  for (const email of [
    'citizen@fixtures.invalid',
    'new-' + Date.now() + '@fixtures.invalid',
  ]) {
    await signin(page, email, '/my-issues');
    if (email.startsWith('citizen'))
      await expect(page.locator('.case-card')).not.toHaveCount(0);
    else await expect(page.locator('.case-card')).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL(/\/my-issues$/);
    await page.getByRole('button', { name: 'Account', exact: true }).click();
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    const response = await page
      .context()
      .request.get('/my-issues', { maxRedirects: 0 });
    expect(response.status()).toBe(303);
  }
  for (const path of ['/signup', '/reset-password', '/forgot-password']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/signin\?next=%2Fchatbot$/);
    await expect(page.locator('input[type=password]')).toHaveCount(0);
  }
  await page.screenshot({
    path: info.outputPath('email-signin.png'),
    fullPage: true,
  });
});
test('email codes: incorrect/expired codes, resend cooldown, changing email, delivery error and safe return', async ({
  page,
}, info) => {
  await page.goto('/signin?next=//evil.invalid');
  await expect(page.locator('form[data-ready=true]')).toBeVisible();
  await page.getByLabel('Email address').fill('citizen@fixtures.invalid');
  await page
    .getByRole('button', { name: 'Send verification code', exact: true })
    .click();
  const code = page.getByLabel('Verification code');
  await expect(code).toHaveAttribute('type', 'text');
  await expect(code).toHaveAttribute('inputmode', 'numeric');
  await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(
    page.getByRole('button', { name: /Resend code in/ }),
  ).toBeDisabled();
  await code.fill('999999');
  await page
    .getByRole('button', { name: 'Verify and continue', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'incorrect or has expired',
  );
  await page.reload();
  await expect(code).toBeVisible();
  await page.screenshot({
    path: info.outputPath('email-code.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Use a different email' }).click();
  await page
    .getByLabel('Email address')
    .fill('delivery-failure@fixtures.invalid');
  await page
    .getByRole('button', { name: 'Send verification code', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('could not send');
  await page.getByLabel('Email address').fill('citizen@fixtures.invalid');
  await page
    .getByRole('button', { name: 'Send verification code', exact: true })
    .click();
  await page.getByLabel('Verification code').fill('012345');
  await page
    .getByRole('button', { name: 'Verify and continue', exact: true })
    .click();
  await expect(page).toHaveURL(/\/chatbot$/);
});
