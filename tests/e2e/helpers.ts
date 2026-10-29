import { expect, type Page } from '@playwright/test';
export async function signin(
  page: Page,
  email = 'citizen@fixtures.invalid',
  next = '/chatbot',
) {
  await page.goto('/signin?next=' + encodeURIComponent(next));
  await expect(page.locator('form[data-ready=true]')).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page
    .getByRole('button', { name: 'Send verification code', exact: true })
    .click();
  await expect(page.getByLabel('Verification code')).toBeVisible();
  await page.getByLabel('Verification code').fill('012345');
  await page
    .getByRole('button', { name: 'Verify and continue', exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'),
  );
}
export async function send(page: Page, text: string) {
  const count = await page.locator('.chat-message').count();
  await page.getByLabel('Message', { exact: true }).fill(text);
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.locator('.chat-message')).toHaveCount(count + 2);
}
