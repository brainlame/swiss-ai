import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { send, signin } from './helpers';

const email = () => 'tour-' + randomUUID() + '@fixtures.invalid';
const tutorial = (page: Page) => page.getByRole('complementary', { name: /./ });
const mainNav = (page: Page) =>
  page.getByRole('navigation', { name: 'Main navigation' });

async function reachForm(page: Page) {
  const tour = tutorial(page);
  await expect(tour).toContainText('Step 1 of 6');
  await expect(tour.getByRole('progressbar')).toHaveAttribute('value', '1');
  await expect(tour.getByRole('progressbar')).toHaveAttribute('max', '14');
  await tour.getByRole('button', { name: 'Start tour' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('#principles-heading')).toHaveClass(
    /tutorial-target/,
  );
  await expect(tour.getByRole('progressbar')).toHaveAttribute('value', '2');
  await expect
    .poll(async () => {
      const panel = await tour.boundingBox();
      const heading = await page.locator('#principles-heading').boundingBox();
      return !!panel && !!heading && panel.y + panel.height < heading.y;
    })
    .toBe(true);
  await tour.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(tour).toContainText('Step 3 of 6');
  await mainNav(page).getByRole('link', { name: 'Chatbot' }).click();
  await expect(page.locator('.chat-composer')).toHaveClass(/tutorial-target/);
  await expect(tour.getByRole('progressbar')).toHaveAttribute('value', '4');
  const viewport = page.viewportSize();
  const compact = viewport && viewport.width < 500;
  if (compact) {
    await page.getByRole('textbox', { name: 'Message', exact: true }).click();
    await page.setViewportSize({ width: viewport.width, height: 330 });
  }
  await send(page, 'Hello, this is a practice conversation.');
  if (compact) await page.setViewportSize(viewport);
  await expect(tour).toContainText('Step 4 of 6');
  await send(page, 'Hello again, this is the second exchange.');
  await page
    .getByRole('button', { name: 'Submit an issue', exact: true })
    .click();
  await expect(page.locator('.selection-controls')).toHaveClass(
    /tutorial-target/,
  );
  await page.getByLabel('First exchange').selectOption('0');
  await page.getByLabel('Last exchange').selectOption('0');
  await tour.getByRole('button', { name: 'Next', exact: true }).click();
  await page
    .getByRole('button', { name: 'Continue to issue', exact: true })
    .click();
  await expect(tour).toContainText('Step 5 of 6');
  await expect(
    page.getByText('Hello, this is a practice conversation.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Hello again, this is the second exchange.', {
      exact: true,
    }),
  ).toHaveCount(0);
}

test('new account completes the tutorial through a real issue submission', async ({
  page,
}) => {
  await signin(page, email(), '/chatbot');
  await reachForm(page);
  const tour = tutorial(page);
  const next = tour.getByRole('button', { name: 'Next', exact: true });
  await page.getByRole('radio', { name: 'Good / wanted behavior' }).check();
  await next.click();
  await expect(page.locator('#description')).toHaveClass(/tutorial-target/);
  await page
    .locator('#description')
    .fill('The chatbot responded to my greeting.');
  await next.click();
  await expect(page.locator('#improvement')).toHaveClass(/tutorial-target/);
  await page.locator('#improvement').fill('Answer simple greetings directly.');
  await next.click();
  await expect(page.locator('#constitution')).toHaveClass(/tutorial-target/);
  await next.click();
  const submit = page.getByRole('button', {
    name: 'Submit issue',
    exact: true,
  });
  await submit.click();
  await expect(tour).toContainText('Step 5 of 6');
  await expect(page).toHaveURL(/\/submit/);
  await page.locator('#constitution').selectOption('1');
  await submit.click();
  await expect(page).toHaveURL(/\/issues\/[\da-f-]+$/);
  await expect(tour).toContainText('Step 6 of 6');
  await mainNav(page).getByRole('link', { name: 'All Issues' }).click();
  await expect(page).toHaveURL('/issues');
  await expect(
    tour.getByRole('button', { name: 'Finish', exact: true }),
  ).toBeVisible();
  await tour.getByRole('button', { name: 'Finish' }).click();
  await expect(tour).toHaveCount(0);
});

test('new account can skip submission, stay dismissed on return, and replay', async ({
  page,
}) => {
  const address = email();
  await signin(page, address, '/chatbot');
  await reachForm(page);
  let saves = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/save')) saves++;
  });
  const tour = tutorial(page);
  await tour.getByRole('button', { name: 'Skip submission' }).click();
  await mainNav(page).getByRole('link', { name: 'All Issues' }).click();
  await expect(page).toHaveURL('/issues');
  await expect(
    tour.getByRole('button', { name: 'Finish', exact: true }),
  ).toBeVisible();
  await expect(tour).toContainText('Step 6 of 6');
  await tour.getByRole('button', { name: 'Skip tour' }).click();
  expect(saves).toBe(0);
  await page.getByRole('button', { name: 'Account' }).click();
  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(
    page.getByRole('link', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('tutorial:v1:')) localStorage.removeItem(key);
  });
  await signin(page, address, '/');
  await expect(tour).toHaveCount(0);
  await page.getByRole('button', { name: 'Replay tutorial' }).click();
  await expect(tour).toContainText('Step 1 of 6');
  await tour.getByRole('button', { name: 'Skip tour' }).click();
  await expect(tour).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Replay tutorial' }),
  ).toBeFocused();
});
