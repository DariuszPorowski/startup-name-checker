import { test, expect } from '@playwright/test';

const cors = { 'access-control-allow-origin': '*' };
const json = (status, body) => ({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
const jina = (data) => json(200, { code: 200, status: 20000, data });

/** Fake answers for "acmerocket": every row lands on a different, known status. */
const ACME = [
  ['https://rdap.verisign.com/com/v1/domain/acmerocket.com', json(404, {})],
  ['https://pubapi.registry.google/rdap/domain/acmerocket.app', json(200, { objectClassName: 'domain', events: [{ eventAction: 'registration', eventDate: '2019-03-02T10:00:00Z' }] })],
  ['https://api.github.com/users/acmerocket', json(404, { message: 'Not Found' })],
  ['https://publish.x.com/oembed?url=https://x.com/acmerocket', json(200, { url: 'https://x.com/AcmeRocket' })],
  ['https://unavatar.io/youtube/acmerocket', json(404, {})],
  ['https://r.jina.ai/https://www.tiktok.com/@acmerocket', jina({ title: 'Couldn’t find this account. Visit TikTok to discover more trending creators.' })],
  ['https://r.jina.ai/https://www.threads.com/@acmerocket', jina({ title: 'Acme Rocket (@acmerocket) • Threads, Say more', finalUrl: 'https://www.threads.com/@acmerocket' })],
  ['https://graph.facebook.com/acmerocket/picture', json(400, { error: { code: 100, message: 'Unsupported get request.' } })],
  ['https://r.jina.ai/https://www.linkedin.com/company/acmerocket', jina({ title: 'LinkedIn', warning: 'Target URL returned error 404: Not Found' })],
];

const EXPECTED = {
  com: 'available',
  app: 'taken',
  instagram: 'taken',
  x: 'taken',
  github: 'available',
  youtube: 'available',
  tiktok: 'available',
  threads: 'taken',
  facebook: 'likely',
  linkedin: 'available',
};

/** Routes every external request to the fake answers; anything unmatched fails like a CORS error. */
async function mockServices(page, answers = ACME) {
  const requests = [];
  await page.route(
    (url) => url.hostname !== '127.0.0.1',
    (route) => {
      const url = route.request().url();
      requests.push(url);
      const hit = answers.find(([prefix]) => url.startsWith(prefix));
      return hit ? route.fulfill(hit[1]) : route.abort('failed');
    },
  );
  return requests;
}

/** Collects CSP violations and uncaught errors. */
function watchProblems(page) {
  const problems = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (/content security policy/i.test(msg.text())) problems.push(`csp: ${msg.text()}`);
  });
  return problems;
}

const row = (page, id) => page.locator(`.row[data-platform="${id}"]`);

test('checks a name and shows a result for every place', async ({ page }) => {
  const problems = watchProblems(page);
  await mockServices(page);
  await page.goto('./');

  await page.getByRole('textbox', { name: 'Startup name' }).fill('  @AcmeRocket.com ');
  await page.getByRole('button', { name: 'Check' }).click();

  await expect(page).toHaveURL(/\?name=acmerocket$/);
  await expect(page.getByRole('heading', { name: 'Results for acmerocket' })).toBeVisible();
  await expect(page.locator('.row')).toHaveCount(10);
  for (const [id, status] of Object.entries(EXPECTED)) {
    await expect(row(page, id), id).toHaveAttribute('data-status', status);
  }
  await expect(page.locator('#summary')).toHaveText('5 available · 1 likely available · 4 taken');

  await expect(row(page, 'app')).toContainText('Registered since 2019-03-02');
  await expect(row(page, 'x')).toContainText('@AcmeRocket');
  await expect(row(page, 'instagram')).toContainText('Threads shares Instagram usernames');
  await expect(row(page, 'youtube').getByRole('link')).toHaveAttribute('href', 'https://www.youtube.com/@acmerocket');
  await expect(row(page, 'tiktok').getByRole('link')).toHaveAttribute('href', 'https://www.tiktok.com/@acmerocket');
  await expect(row(page, 'linkedin').getByRole('link')).toHaveText('linkedin.com/company/acmerocket');
  await expect(page.locator('#results')).toHaveAttribute('aria-busy', 'false');
  expect(problems).toEqual([]);
});

test('runs automatically for ?name= links', async ({ page }) => {
  await mockServices(page);
  await page.goto('./?name=AcmeRocket');
  await expect(page.getByRole('textbox', { name: 'Startup name' })).toHaveValue('acmerocket');
  await expect(row(page, 'github')).toHaveAttribute('data-status', 'available');
  await expect(page).toHaveTitle(/^acmerocket — /);
});

test('rejects unusable input without making requests', async ({ page }) => {
  const requests = await mockServices(page);
  await page.goto('./');
  await page.getByRole('textbox', { name: 'Startup name' }).fill('acme!');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(/only letters, numbers/i);
  await expect(page.locator('#results')).toBeHidden();
  expect(requests).toEqual([]);

  await page.getByRole('textbox', { name: 'Startup name' }).fill('acme');
  await expect(page.getByRole('alert')).toBeHidden();
});

test('marks platforms whose username rules the name breaks', async ({ page }) => {
  await mockServices(page, []);
  await page.goto('./?name=acme_rocket');
  for (const id of ['com', 'app', 'github', 'facebook', 'linkedin']) {
    await expect(row(page, id), id).toHaveAttribute('data-status', 'invalid');
  }
  await expect(row(page, 'com')).toContainText('Domains allow letters, numbers and hyphens');
  // Everything else fails (no mocks), which must surface as "unknown" or a manual check — never a guess.
  await expect(page.locator('.row[data-status="checking"]')).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator('.row[data-status="available"], .row[data-status="taken"]')).toHaveCount(0);
});

test('shows avatars from https sources only', async ({ page }) => {
  await mockServices(page, [
    ...ACME.filter(([prefix]) => !prefix.startsWith('https://api.github.com')),
    ['https://api.github.com/users/acmerocket', json(200, { login: 'acmerocket', type: 'User', avatar_url: 'https://avatars.example/acme.svg' })],
    ['https://avatars.example/acme.svg', { status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }],
  ]);
  await page.goto('./?name=acmerocket');
  await expect(row(page, 'github')).toHaveAttribute('data-status', 'taken');
  await expect(row(page, 'github').locator('img.avatar')).toHaveAttribute('src', 'https://avatars.example/acme.svg');
  await expect(row(page, 'com').locator('img.avatar')).toBeHidden();
});

test('a new search replaces the previous results', async ({ page }) => {
  await mockServices(page);
  await page.goto('./?name=acmerocket');
  await expect(row(page, 'github')).toHaveAttribute('data-status', 'available');

  await page.getByRole('textbox', { name: 'Startup name' }).fill('other');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('heading', { name: 'Results for other' })).toBeVisible();
  await expect(page.locator('.row')).toHaveCount(10);
  await expect(row(page, 'github').getByRole('link')).toHaveAttribute('href', 'https://github.com/other');
  await expect(page.locator('.row[data-status="checking"]')).toHaveCount(0, { timeout: 20_000 });
});
