import { test, expect } from '@playwright/test';
import { PLATFORMS, TLDS } from '../../site/checker.js';

const cors = { 'access-control-allow-origin': '*' };
const json = (status, body) => ({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
const jina = (data) => json(200, { code: 200, status: 20000, data });
const registered = (date) => json(200, { objectClassName: 'domain', events: [{ eventAction: 'registration', eventDate: `${date}T10:00:00Z` }] });

/** Fake answers for "acmerocket": every row lands on a known status. */
const ACME = [
  ['https://rdap.verisign.com/com/v1/domain/acmerocket.com', json(404, {})],
  ['https://rdap.verisign.com/net/v1/domain/acmerocket.net', registered('2015-07-01')],
  ['https://rdap.publicinterestregistry.org/rdap/domain/acmerocket.org', json(404, {})],
  ['https://rdap.identitydigital.services/rdap/domain/acmerocket.info', json(404, {})],
  ['https://pubapi.registry.google/rdap/domain/acmerocket.app', registered('2019-03-02')],
  ['https://pubapi.registry.google/rdap/domain/acmerocket.dev', registered('2020-02-28')],
  ['https://rdap.identitydigital.services/rdap/domain/acmerocket.io', json(404, {})],
  ['https://dns.google/resolve?name=acmerocket.co', json(200, { Status: 3 })],
  ['https://rdap.identitydigital.services/rdap/domain/acmerocket.ai', registered('2023-01-15')],
  ['https://dns.google/resolve?name=acmerocket.so', json(200, { Status: 3 })],
  ['https://rdap.identitydigital.services/rdap/domain/acmerocket.pro', json(404, {})],
  ['https://rdap.registry.cloud/rdap/domain/acmerocket.cloud', json(404, {})],
  ['https://rdap.radix.host/rdap/domain/acmerocket.tech', registered('2021-06-30')],
  ['https://rdap.centralnic.com/xyz/domain/acmerocket.xyz', json(404, {})],
  ['https://rdap.nic.design/domain/acmerocket.design', registered('2022-04-12')],
  ['https://rdap.radix.host/rdap/domain/acmerocket.online', json(404, {})],
  ['https://rdap.gmoregistry.net/rdap/domain/acmerocket.shop', json(404, { errorCode: 404, title: 'Error in processing request' })],
  ['https://rdap.radix.host/rdap/domain/acmerocket.store', registered('2017-09-18')],
  ['https://api.github.com/users/acmerocket', json(404, { message: 'Not Found' })],
  ['https://publish.x.com/oembed?url=https://x.com/acmerocket', json(200, { url: 'https://x.com/AcmeRocket' })],
  ['https://unavatar.io/youtube/acmerocket', json(404, {})],
  ['https://r.jina.ai/https://www.tiktok.com/@acmerocket', jina({ title: 'Couldn’t find this account. Visit TikTok to discover more trending creators.' })],
  ['https://r.jina.ai/https://www.threads.com/@acmerocket', jina({ title: 'Acme Rocket (@acmerocket) • Threads, Say more', finalUrl: 'https://www.threads.com/@acmerocket' })],
  ['https://graph.facebook.com/acmerocket/picture', json(400, { error: { code: 100, message: 'Unsupported get request.' } })],
  ['https://r.jina.ai/https://www.linkedin.com/company/acmerocket', jina({ title: 'LinkedIn', warning: 'Target URL returned error 404: Not Found' })],
  ['https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=acmerocket.bsky.social', json(200, { did: 'did:plc:acme', displayName: 'Acme Rocket' })],
  ['https://www.reddit.com/api/username_available.json?user=acmerocket', json(200, true)],
  ['https://widgets.pinterest.com/v3/pidgets/users/acmerocket/pins/', json(404, { status: 'failure', code: 30, message: 'User not found.' })],
  ['https://api.ivr.fi/v2/twitch/user?login=acmerocket', json(200, [])],
  ['https://discord.com/api/v10/invites/acmerocket', json(200, { code: 'acmerocket', guild: { id: '1', name: 'Acme Rocket', icon: null } })],
  ['https://r.jina.ai/https://t.me/acmerocket', jina({ title: 'Telegram: Contact @acmerocket', httpStatus: 200 })],
  ['https://mastodon.social/api/v1/accounts/lookup?acct=acmerocket', json(404, { error: 'Record not found' })],
  ['https://api.tumblr.com/v2/blog/acmerocket/avatar/64', { status: 302, headers: { ...cors, location: 'https://64.media.tumblr.com/acme.png' } }],
  ['https://r.jina.ai/https://acmerocket.substack.com/', jina({ title: '', warning: 'Target URL returned error 404: Not Found' })],
  ['https://hacker-news.firebaseio.com/v0/user/acmerocket.json', json(200, null)],
];

const EXPECTED = {
  com: 'available',
  net: 'taken',
  org: 'available',
  info: 'available',
  app: 'taken',
  dev: 'taken',
  io: 'available',
  co: 'likely',
  ai: 'taken',
  so: 'likely',
  pro: 'available',
  cloud: 'available',
  tech: 'taken',
  xyz: 'available',
  design: 'taken',
  online: 'available',
  shop: 'available',
  store: 'taken',
  instagram: 'taken',
  x: 'taken',
  github: 'available',
  youtube: 'available',
  tiktok: 'available',
  threads: 'taken',
  facebook: 'likely',
  linkedin: 'available',
  bluesky: 'taken',
  reddit: 'available',
  pinterest: 'available',
  twitch: 'available',
  discord: 'taken',
  telegram: 'likely',
  mastodon: 'available',
  tumblr: 'taken',
  substack: 'available',
  hackernews: 'likely',
};

const DEFAULTS = PLATFORMS.filter((p) => p.defaultChecked).map((p) => p.id);
const SOCIAL = PLATFORMS.filter((p) => p.group === 'social').map((p) => p.id);
const ALL = `domains=${TLDS.join(',')}&social=${SOCIAL.join(',')}`;

/** Routes every external request to the fake answers; anything unmatched fails like a CORS error. */
async function mockServices(page, answers = ACME) {
  const requests = [];
  await page.route(
    (url) => url.hostname !== '127.0.0.1',
    async (route) => {
      const url = route.request().url();
      requests.push(url);
      const hit = answers.find(([prefix]) => url.startsWith(prefix));
      if (!hit) return route.abort('failed');
      return route.fulfill(typeof hit[1] === 'function' ? await hit[1](url) : hit[1]);
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
const rowIds = (page, selector = '.row') => page.locator(selector).evaluateAll((els) => els.map((el) => el.dataset.platform));
const checkButton = (page) => page.getByRole('button', { name: 'Check', exact: true });
const settled = (page) => expect(page.locator('.row[data-status="checking"]')).toHaveCount(0, { timeout: 20_000 });
// Primer hides the native checkbox and draws its own box on top, so people click that box or the label.
const clickLabel = (page, text) => page.locator('.chips').getByText(text, { exact: true }).click();
const THEME_KEY = 'startup-name-checker:color-mode';
const themeButton = (page) => page.getByRole('button', { name: /^Theme: / });
const pageBackground = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const savedTheme = (page) => page.evaluate((key) => localStorage.getItem(key), THEME_KEY);
const WHITE = 'rgb(255, 255, 255)';
const BLACK = 'rgb(0, 0, 0)';

test('checks a name against the default selection', async ({ page }) => {
  const problems = watchProblems(page);
  const requests = await mockServices(page);
  await page.goto('./');

  await expect(page.getByRole('checkbox', { name: '.com' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '.net' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Instagram' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Bluesky' })).not.toBeChecked();

  await page.getByRole('textbox', { name: 'Startup name' }).fill('  @AcmeRocket.com ');
  await checkButton(page).click();

  await expect(page).toHaveURL(/\?name=acmerocket$/);
  await expect(page.getByRole('heading', { name: 'Results for acmerocket' })).toBeVisible();
  expect(await rowIds(page)).toEqual(DEFAULTS);
  for (const id of DEFAULTS) await expect(row(page, id), id).toHaveAttribute('data-status', EXPECTED[id]);
  await expect(page.locator('#summary')).toHaveText('5 available · 1 likely available · 3 taken');

  await expect(row(page, 'x')).toContainText('@AcmeRocket');
  await expect(row(page, 'instagram')).toContainText('Threads shares Instagram usernames');
  await expect(row(page, 'youtube').getByRole('link')).toHaveAttribute('href', 'https://www.youtube.com/@acmerocket');
  await expect(row(page, 'tiktok').getByRole('link')).toHaveAttribute('href', 'https://www.tiktok.com/@acmerocket');
  await expect(row(page, 'linkedin').getByRole('link')).toHaveText('linkedin.com/company/acmerocket');
  await expect(page.locator('#results')).toHaveAttribute('aria-busy', 'false');
  const unselected = /publicinterestregistry|registry\.google|identitydigital|registry\.cloud|radix|centralnic|nic\.design|gmoregistry|bsky|ivr\.fi|discord|tumblr/;
  expect(requests.filter((url) => unselected.test(url))).toEqual([]);
  expect(problems).toEqual([]);
});

test('checks every domain and platform', async ({ page }) => {
  const problems = watchProblems(page);
  await mockServices(page);
  await page.goto('./?name=acmerocket');
  await settled(page);

  await page.getByRole('button', { name: 'All domains' }).click();
  await page.getByRole('button', { name: 'All social media' }).click();
  await expect(page).toHaveURL(new RegExp(`\\?name=acmerocket&${ALL}$`));
  expect(await rowIds(page, '#list-domains .row')).toEqual([...TLDS]);
  expect(await rowIds(page, '#list-social .row')).toEqual(SOCIAL);
  for (const [id, status] of Object.entries(EXPECTED)) await expect(row(page, id), id).toHaveAttribute('data-status', status);
  await expect(page.locator('#summary')).toHaveText('18 available · 5 likely available · 13 taken');

  await expect(row(page, 'net')).toContainText('Registered since 2015-07-01');
  await expect(row(page, 'tech')).toContainText('Registered since 2021-06-30');
  await expect(row(page, 'xyz')).toContainText('via CentralNic RDAP');
  await expect(row(page, 'design')).toContainText('Registered since 2022-04-12');
  await expect(row(page, 'shop')).toContainText('via GMO Registry RDAP');
  await expect(row(page, 'store')).toContainText('via Radix RDAP');
  await expect(row(page, 'co')).toContainText('.co has no public registry lookup');
  await expect(row(page, 'so')).toContainText('.so has no public registry lookup');
  await expect(row(page, 'bluesky').getByRole('link')).toHaveAttribute('href', 'https://bsky.app/profile/acmerocket.bsky.social');
  await expect(row(page, 'discord')).toContainText('Acme Rocket');
  await expect(row(page, 'tumblr').locator('.avatar img')).toHaveAttribute('src', 'https://api.tumblr.com/v2/blog/acmerocket/avatar/64');
  expect(problems).toEqual([]);
});

test('every external link opens in a new tab', async ({ page }) => {
  await mockServices(page);
  await page.goto(`./?name=acmerocket&${ALL}`);
  await expect(page.locator('.row')).toHaveCount(PLATFORMS.length);
  const links = await page.locator('a[href]').evaluateAll((els) => els.map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
  const external = links.filter((link) => !link.href.startsWith('http://127.0.0.1'));
  expect(external.length).toBeGreaterThan(PLATFORMS.length);
  for (const link of external) {
    expect(link.target, link.href).toBe('_blank');
    expect(link.rel, link.href).toBe('noopener noreferrer');
  }
});

test('restores the selection from the address', async ({ page }) => {
  await mockServices(page);
  await page.goto('./?name=AcmeRocket&domains=ai,io,bogus&social=bluesky,x');
  await expect(page.getByRole('textbox', { name: 'Startup name' })).toHaveValue('acmerocket');
  await expect(page).toHaveTitle(/^acmerocket — /);
  expect(await rowIds(page)).toEqual(['io', 'ai', 'x', 'bluesky']);
  await expect(page.getByRole('checkbox', { name: '.com' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: '.io' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Instagram' })).not.toBeChecked();
  await expect(page).toHaveURL(/\?name=acmerocket&domains=io,ai&social=x,bluesky$/);
  await expect(row(page, 'bluesky')).toHaveAttribute('data-status', 'taken');
});

test('ticking a box adds its result and unticking removes it, without re-checking the rest', async ({ page }) => {
  const requests = await mockServices(page);
  await page.goto('./?name=acmerocket');
  await settled(page);
  const before = requests.length;

  await clickLabel(page, '.net');
  await expect(page.getByRole('checkbox', { name: '.net' })).toBeChecked();
  await expect(row(page, 'net')).toHaveAttribute('data-status', 'taken');
  expect(await rowIds(page, '#list-domains .row')).toEqual(['com', 'net']);
  await expect(page).toHaveURL(/\?name=acmerocket&domains=com,net$/);

  // Primer's drawn box passes clicks on to the real checkbox.
  await page.locator('#pick-x + span').click();
  await expect(page.getByRole('checkbox', { name: 'X', exact: true })).not.toBeChecked();
  await expect(row(page, 'x')).toHaveCount(0);
  await expect(page).toHaveURL(/&social=instagram,github,youtube,tiktok,threads,facebook,linkedin$/);
  await expect(page.locator('#summary')).toHaveText('5 available · 1 likely available · 3 taken');
  expect(requests.slice(before)).toEqual(['https://rdap.verisign.com/net/v1/domain/acmerocket.net']);
});

test('needs at least one domain or platform', async ({ page }) => {
  const requests = await mockServices(page);
  await page.goto('./?name=acmerocket');
  await settled(page);

  await page.getByRole('button', { name: 'None of the domains' }).click();
  await expect(page.getByRole('heading', { name: 'Domains', exact: true })).toBeHidden();
  await expect(page.locator('#list-domains')).toBeHidden();
  await page.getByRole('button', { name: 'None of the social media' }).click();
  await expect(page.locator('.row')).toHaveCount(0);
  await expect(page.locator('#summary')).toHaveText(/Pick at least one domain or social media platform/);

  const before = requests.length;
  await checkButton(page).click();
  await expect(page.getByRole('alert')).toHaveText(/Pick at least one domain or social media platform/);
  expect(requests.length).toBe(before);

  const github = page.getByRole('checkbox', { name: 'GitHub' });
  await github.focus();
  await page.keyboard.press('Space');
  await expect(github).toBeChecked();
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(row(page, 'github')).toHaveAttribute('data-status', 'available');
  await expect(page.locator('#summary')).toHaveText('1 available');
});

test('retry re-checks just that one result', async ({ page }) => {
  let github = json(403, { message: 'API rate limit exceeded' });
  const requests = await mockServices(page, [['https://api.github.com/users/acmerocket', () => github], ...ACME]);
  await page.goto('./?name=acmerocket');
  await settled(page);
  await expect(row(page, 'github')).toHaveAttribute('data-status', 'unknown');
  const before = requests.length;

  let release;
  github = new Promise((resolve) => (release = resolve)).then(() => json(404, { message: 'Not Found' }));
  const retry = row(page, 'github').getByRole('button', { name: 'Check GitHub again' });
  await retry.click();
  await expect(row(page, 'github')).toHaveAttribute('data-status', 'checking');
  await expect(retry).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#results')).toHaveAttribute('aria-busy', 'true');
  // Playwright won't click an aria-disabled button, so fire the click directly: it must be ignored while checking.
  await retry.dispatchEvent('click');
  release();

  await expect(row(page, 'github')).toHaveAttribute('data-status', 'available');
  await expect(retry).toBeFocused();
  await expect(retry).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('#results')).toHaveAttribute('aria-busy', 'false');
  expect(requests.slice(before)).toEqual(['https://api.github.com/users/acmerocket']);
  await expect(page.locator('#summary')).toHaveText('5 available · 1 likely available · 3 taken');
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
  for (const id of ['com', 'github', 'facebook', 'linkedin']) {
    await expect(row(page, id), id).toHaveAttribute('data-status', 'invalid');
  }
  await expect(row(page, 'com')).toContainText('Domains allow letters, numbers and hyphens');
  await expect(row(page, 'com').getByRole('button', { name: 'Check .com again' })).toBeHidden();
  // Everything else fails (no mocks), which must surface as "unknown" or a manual check — never a guess.
  await settled(page);
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
  await expect(row(page, 'github').locator('.avatar img')).toHaveAttribute('src', 'https://avatars.example/acme.svg');
  await expect(row(page, 'com').locator('.avatar img')).toBeHidden();
});

test('a new search replaces the previous results and keeps the selection', async ({ page }) => {
  await mockServices(page);
  await page.goto('./?name=acmerocket&social=github');
  await expect(row(page, 'github')).toHaveAttribute('data-status', 'available');

  await page.getByRole('textbox', { name: 'Startup name' }).fill('other');
  await checkButton(page).click();
  await expect(page.getByRole('heading', { name: 'Results for other' })).toBeVisible();
  expect(await rowIds(page)).toEqual(['com', 'github']);
  await expect(row(page, 'github').getByRole('link')).toHaveAttribute('href', 'https://github.com/other');
  await expect(page).toHaveURL(/\?name=other&social=github$/);
  await settled(page);
});

test('follows the system theme until a theme is picked, and remembers the pick', async ({ page }) => {
  const problems = watchProblems(page);
  await mockServices(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('./');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-color-mode', 'auto');
  await expect(themeButton(page)).toHaveAccessibleName('Theme: System');
  expect(await pageBackground(page)).toBe(BLACK);
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await pageBackground(page)).toBe(WHITE);

  await themeButton(page).click();
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(html).toHaveAttribute('data-color-mode', 'dark');
  await expect(themeButton(page)).toHaveAccessibleName('Theme: Dark');
  expect(await pageBackground(page)).toBe(BLACK);
  expect(await savedTheme(page)).toBe('dark');

  await page.reload();
  await expect(html).toHaveAttribute('data-color-mode', 'dark');
  await expect(themeButton(page)).toHaveAccessibleName('Theme: Dark');
  expect(await pageBackground(page)).toBe(BLACK);

  await themeButton(page).click();
  await page.getByRole('menuitemradio', { name: 'Light' }).click();
  await expect(html).toHaveAttribute('data-color-mode', 'light');
  expect(await pageBackground(page)).toBe(WHITE);
  expect(await savedTheme(page)).toBe('light');

  await themeButton(page).click();
  await page.getByRole('menuitemradio', { name: 'System' }).click();
  await expect(html).toHaveAttribute('data-color-mode', 'auto');
  await expect(themeButton(page)).toHaveAccessibleName('Theme: System');
  expect(await savedTheme(page)).toBeNull();
  expect(problems).toEqual([]);
});

test('applies a saved theme before the app has loaded', async ({ page }) => {
  await mockServices(page);
  await page.addInitScript((key) => localStorage.setItem(key, 'dark'), THEME_KEY);
  // Keep the app bundle from loading: only the small theme script runs.
  await page.route(/\/assets\/.*\.js$/, (route) => route.abort());
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark');
  await expect(page.locator('#root')).toBeEmpty();
  expect(await pageBackground(page)).toBe(BLACK);
});
