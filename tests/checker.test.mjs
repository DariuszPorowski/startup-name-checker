import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkAll, normalizeName, validateInput, PLATFORMS, STATUS } from '../site/checker.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const html = (status) => new Response('<!doctype html><title>x</title>', { status, headers: { 'content-type': 'text/html' } });
const jina = (data) => json(200, { code: 200, status: 20000, data });
// What a browser reports for a CORS-blocked or unreachable response.
const blocked = () => new TypeError('Failed to fetch');

/** Fake fetch: the first route whose prefix matches the URL answers; anything else fails like a CORS error. */
function mockFetch(routes) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    for (const [prefix, answer] of routes) {
      if (url.startsWith(prefix)) {
        const res = typeof answer === 'function' ? answer(url) : answer;
        if (res instanceof Error) throw res;
        return res.clone();
      }
    }
    throw blocked();
  };
  fetch.calls = calls;
  return fetch;
}

async function check(ids, name, routes) {
  const list = [].concat(ids);
  const fetch = mockFetch(routes);
  const out = await checkAll(name, { fetch, platforms: PLATFORMS.filter((p) => list.includes(p.id)) });
  return { ...out[list.at(-1)], calls: fetch.calls };
}

describe('normalizeName', () => {
  for (const [input, expected] of [
    ['  AcmeRocket ', 'acmerocket'],
    ['@acme', 'acme'],
    ['Acme Rocket', 'acmerocket'],
    ['acme.com', 'acme'],
    ['acme.app', 'acme'],
    ['https://www.acme.com/', 'acme'],
    ['acme.io', 'acme.io'],
    [undefined, ''],
  ]) {
    test(`${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => assert.equal(normalizeName(input), expected));
  }
});

describe('validateInput', () => {
  test('accepts a plain name', () => assert.equal(validateInput('acme_rocket.io-1'), null));
  test('rejects empty input', () => assert.match(validateInput(''), /enter a name/i));
  test('rejects symbols', () => assert.match(validateInput('acme!'), /only letters/i));
  test('rejects very long names', () => assert.match(validateInput('a'.repeat(64)), /63/));
});

describe('platform rules', () => {
  const invalidFor = async (name) => {
    const out = await checkAll(name, { fetch: mockFetch([]), platforms: PLATFORMS.filter((p) => p.id !== 'instagram') });
    return Object.keys(out).filter((id) => out[id].status === STATUS.INVALID).sort();
  };

  test('underscores are not valid in domains, GitHub, Facebook or LinkedIn', async () => {
    assert.deepEqual(await invalidFor('acme_rocket'), ['app', 'com', 'facebook', 'github', 'linkedin']);
  });

  test('hyphens are only valid for domains, GitHub, YouTube and LinkedIn', async () => {
    assert.deepEqual(await invalidFor('acme-rocket'), ['facebook', 'threads', 'tiktok', 'x']);
  });

  test('X handles are limited to 15 characters', async () => {
    assert.ok((await invalidFor('acmerocketlaunch')).includes('x'));
  });

  test('short names are rejected where platforms require a minimum length', async () => {
    assert.deepEqual(await invalidFor('ab'), ['facebook', 'youtube']);
  });

  test('IDN-style double hyphens are rejected for domains', async () => {
    const invalid = await invalidFor('ab--cd');
    assert.ok(invalid.includes('com') && invalid.includes('app'));
  });
});

describe('domains', () => {
  test('.com is available when the registry has no record', async () => {
    const r = await check('com', 'acme', [['https://rdap.verisign.com/com/v1/domain/acme.com', json(404, {})]]);
    assert.equal(r.status, STATUS.AVAILABLE);
    assert.equal(r.via, 'Verisign RDAP');
  });

  test('.app is taken with its registration date', async () => {
    const body = { objectClassName: 'domain', events: [{ eventAction: 'registration', eventDate: '2018-05-01T12:00:00Z' }] };
    const r = await check('app', 'acme', [['https://pubapi.registry.google/rdap/domain/acme.app', json(200, body)]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.match(r.note, /2018-05-01/);
  });

  test('falls back to rdap.org when the registry is unreachable', async () => {
    const r = await check('com', 'acme', [['https://rdap.org/domain/acme.com', json(404, {})]]);
    assert.equal(r.status, STATUS.AVAILABLE);
    assert.equal(r.via, 'rdap.org');
  });

  test('falls back to DNS: NXDOMAIN means likely available', async () => {
    const r = await check('com', 'acme', [['https://dns.google/resolve?name=acme.com', json(200, { Status: 3 })]]);
    assert.equal(r.status, STATUS.LIKELY);
  });

  test('is unknown when every source fails', async () => {
    const r = await check('com', 'acme', []);
    assert.equal(r.status, STATUS.UNKNOWN);
  });
});

describe('GitHub', () => {
  test('404 means available', async () => {
    const r = await check('github', 'acme', [['https://api.github.com/users/acme', json(404, { message: 'Not Found' })]]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('an organization means taken, with avatar', async () => {
    const body = { login: 'acme', type: 'Organization', name: 'Acme Inc', avatar_url: 'https://avatars.githubusercontent.com/u/1' };
    const r = await check('github', 'acme', [['https://api.github.com/users/acme', json(200, body)]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'Organization: Acme Inc');
    assert.equal(r.avatar, body.avatar_url);
  });

  test('rate limiting is reported as unknown', async () => {
    const r = await check('github', 'acme', [['https://api.github.com/users/acme', json(403, { message: 'API rate limit exceeded' })]]);
    assert.equal(r.status, STATUS.UNKNOWN);
    assert.match(r.note, /limit/i);
  });
});

describe('X', () => {
  test('oEmbed 200 means taken', async () => {
    const r = await check('x', 'jack', [['https://publish.x.com/oembed?url=https://x.com/jack', json(200, { url: 'https://x.com/jack' })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.match(r.note, /@jack/);
  });

  test('oEmbed 404 means available', async () => {
    const r = await check('x', 'acme', [['https://publish.x.com/oembed', html(404)]]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('oEmbed 404 is overruled when FxTwitter knows the account (e.g. protected)', async () => {
    const r = await check('x', 'acme', [
      ['https://publish.x.com/oembed', html(404)],
      ['https://api.fxtwitter.com/acme', json(200, { code: 200, user: { screen_name: 'acme', name: 'Acme Corp' } })],
    ]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'Account: Acme Corp');
  });

  test('falls back to FxTwitter, which reports suspended accounts', async () => {
    const r = await check('x', 'acme', [
      ['https://api.fxtwitter.com/acme', json(404, { code: 404, message: 'User is suspended', reason: 'suspended' })],
    ]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.match(r.note, /suspended/);
  });

  test('is unknown when both sources fail', async () => {
    const r = await check('x', 'acme', [['https://publish.x.com/oembed', html(503)]]);
    assert.equal(r.status, STATUS.UNKNOWN);
  });
});

describe('YouTube', () => {
  test('unavatar 404 means available', async () => {
    const r = await check('youtube', 'acme', [['https://unavatar.io/youtube/acme', json(404, {})]]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('unavatar 200 means taken, with avatar', async () => {
    const r = await check('youtube', 'acme', [['https://unavatar.io/youtube/acme', json(200, { url: 'https://yt3.ggpht.com/a' })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.avatar, 'https://yt3.ggpht.com/a');
  });

  test('falls back to Jina Reader when unavatar is rate limited', async () => {
    const routes = (data) => [
      ['https://unavatar.io/', json(429, {})],
      ['https://r.jina.ai/https://www.youtube.com/@acme', jina(data)],
    ];
    const missing = await check('youtube', 'acme', routes({ title: '404 Not Found', httpStatus: 404 }));
    assert.equal(missing.status, STATUS.AVAILABLE);
    const found = await check('youtube', 'acme', routes({ title: 'Acme', warning: 'Target URL returned error 401: Unauthorized' }));
    assert.equal(found.status, STATUS.TAKEN);
    const consent = await check('youtube', 'acme', routes({ title: 'Before you continue to YouTube' }));
    assert.equal(consent.status, STATUS.UNKNOWN);
  });
});

describe('TikTok', () => {
  test('oEmbed 200 means taken', async () => {
    const body = { author_name: 'Acme', author_url: 'https://www.tiktok.com/@acme' };
    const r = await check('tiktok', 'acme', [['https://www.tiktok.com/oembed?url=https://www.tiktok.com/@acme', json(200, body)]]);
    assert.equal(r.status, STATUS.TAKEN);
  });

  test('a blocked oEmbed falls back to Jina Reader', async () => {
    const page = (title) => [['https://r.jina.ai/https://www.tiktok.com/@acme', jina({ title })]];
    const missing = await check('tiktok', 'acme', page('Couldn’t find this account. Visit TikTok to discover more.'));
    assert.equal(missing.status, STATUS.AVAILABLE);
    const found = await check('tiktok', 'acme', page('Acme Corp (@acme) | TikTok'));
    assert.equal(found.status, STATUS.TAKEN);
    assert.equal(found.note, 'Account: Acme Corp');
  });

  test('is likely available when only the unknown profile fails while TikTok itself answers', async () => {
    const r = await check('tiktok', 'acme', [
      ['https://www.tiktok.com/oembed?url=https://www.tiktok.com/@tiktok', json(200, { author_url: 'https://www.tiktok.com/@tiktok' })],
    ]);
    assert.equal(r.status, STATUS.LIKELY);
  });

  test('is unknown when TikTok is unreachable', async () => {
    assert.equal((await check('tiktok', 'acme', [])).status, STATUS.UNKNOWN);
  });
});

describe('Threads and Instagram', () => {
  const threadsPage = (data) => [['https://r.jina.ai/https://www.threads.com/@acme', jina(data)]];

  test('a Threads profile marks both Threads and Instagram as taken', async () => {
    const routes = threadsPage({ title: 'Acme (@acme) • Threads, Say more', finalUrl: 'https://www.threads.com/@acme' });
    const out = await checkAll('acme', { fetch: mockFetch(routes), platforms: PLATFORMS.filter((p) => ['instagram', 'threads'].includes(p.id)) });
    assert.equal(out.threads.status, STATUS.TAKEN);
    assert.equal(out.instagram.status, STATUS.TAKEN);
  });

  test('a login redirect leaves both to be checked manually', async () => {
    const routes = threadsPage({ title: 'Threads • Log in', finalUrl: 'https://www.threads.com/login/?next=%2F%40acme' });
    const out = await checkAll('acme', { fetch: mockFetch(routes), platforms: PLATFORMS.filter((p) => ['instagram', 'threads'].includes(p.id)) });
    assert.equal(out.threads.status, STATUS.MANUAL);
    assert.match(out.threads.note, /No public Threads profile/);
    assert.equal(out.instagram.status, STATUS.MANUAL);
  });

  test('Instagram on its own is a manual check and makes no requests', async () => {
    const r = await check('instagram', 'acme', []);
    assert.equal(r.status, STATUS.MANUAL);
    assert.equal(r.calls.length, 0);
  });
});

describe('Facebook', () => {
  const graph = 'https://graph.facebook.com/acmerocket/picture';

  test('a public Page means taken', async () => {
    const r = await check('facebook', 'acmerocket', [[graph, json(200, { data: { url: 'https://scontent.xx.fbcdn.net/a.jpg', is_silhouette: false } })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.avatar, 'https://scontent.xx.fbcdn.net/a.jpg');
  });

  test('a silhouette picture is not shown', async () => {
    const r = await check('facebook', 'acmerocket', [[graph, json(200, { data: { url: 'https://x/a.jpg', is_silhouette: true } })]]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.avatar, undefined);
  });

  test('error 100 means likely available', async () => {
    const r = await check('facebook', 'acmerocket', [[graph, json(400, { error: { code: 100, message: 'does not exist' } })]]);
    assert.equal(r.status, STATUS.LIKELY);
  });

  test('other errors are unknown', async () => {
    const r = await check('facebook', 'acmerocket', [[graph, json(400, { error: { code: 4, message: 'rate limit' } })]]);
    assert.equal(r.status, STATUS.UNKNOWN);
  });
});

describe('LinkedIn', () => {
  const page = (data) => ['https://r.jina.ai/https://www.linkedin.com/company/acme', jina(data)];

  test('a 404 page means available', async () => {
    const r = await check('linkedin', 'acme', [page({ title: 'LinkedIn', warning: 'Target URL returned error 404: Not Found' })]);
    assert.equal(r.status, STATUS.AVAILABLE);
  });

  test('a company title means taken', async () => {
    const r = await check('linkedin', 'acme', [page({ title: 'Acme Inc | LinkedIn', httpStatus: 200 })]);
    assert.equal(r.status, STATUS.TAKEN);
    assert.equal(r.note, 'Company: Acme Inc');
  });

  test('login walls fall back to Microlink', async () => {
    const r = await check('linkedin', 'acme', [
      page({ title: 'LinkedIn Login, Sign in | LinkedIn', httpStatus: 200 }),
      ['https://api.microlink.io/', json(200, { status: 'success', statusCode: 404, data: { title: 'LinkedIn' } })],
    ]);
    assert.equal(r.status, STATUS.AVAILABLE);
    assert.equal(r.via, 'Microlink');
  });

  test('is unknown when nothing answers', async () => {
    assert.equal((await check('linkedin', 'acme', [])).status, STATUS.UNKNOWN);
  });
});

describe('checkAll', () => {
  test('reports every platform once and only sends CORS-safe requests', async () => {
    const fetch = mockFetch([]);
    const seen = [];
    const out = await checkAll('acmerocket', { fetch, onResult: (id, r) => seen.push([id, r.status]) });
    assert.deepEqual(seen.map(([id]) => id).sort(), PLATFORMS.map((p) => p.id).sort());
    assert.deepEqual(Object.keys(out).sort(), PLATFORMS.map((p) => p.id).sort());
    for (const { url, init } of fetch.calls) {
      assert.match(url, /^https:\/\//);
      assert.equal(init.credentials, 'omit');
      assert.deepEqual(Object.keys(init.headers || {}).filter((h) => h.toLowerCase() !== 'accept'), [], url);
    }
  });

  test('every request goes to a host allowed by the page CSP', async () => {
    const { readFile } = await import('node:fs/promises');
    const page = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
    const allowed = /connect-src ([^;]+);/.exec(page)[1].trim().split(/\s+/);
    const fetch = mockFetch([]);
    await checkAll('acmerocket', { fetch });
    for (const { url } of fetch.calls) {
      assert.ok(allowed.includes(new URL(url).origin), `${new URL(url).origin} is missing from connect-src`);
    }
  });

  test('a crashing check is reported as unknown', async () => {
    const boom = { id: 'boom', group: 'social', label: 'Boom', url: () => '', check: () => { throw new Error('boom'); } };
    const out = await checkAll('acme', { fetch: mockFetch([]), platforms: [boom] });
    assert.equal(out.boom.status, STATUS.UNKNOWN);
  });

  test('timeouts are handled like failures', async () => {
    const timeout = () => Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const r = await check('github', 'acme', [['https://api.github.com/', timeout]]);
    assert.equal(r.status, STATUS.UNKNOWN);
  });
});
