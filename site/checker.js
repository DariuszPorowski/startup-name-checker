// Availability checks for a startup name. Pure logic (no DOM): runs in browsers and Node 18+.
// Every lookup goes straight from the browser to a public, CORS-enabled endpoint — no backend.

export const STATUS = Object.freeze({
  CHECKING: 'checking',
  AVAILABLE: 'available',
  LIKELY: 'likely',
  TAKEN: 'taken',
  MANUAL: 'manual',
  UNKNOWN: 'unknown',
  INVALID: 'invalid',
});

export const STATUS_LABEL = Object.freeze({
  checking: 'Checking…',
  available: 'Available',
  likely: 'Likely available',
  taken: 'Taken',
  manual: 'Check manually',
  unknown: 'Unknown',
  invalid: 'Not allowed',
});

/** Domain endings that can be checked, in display order. */
export const TLDS = Object.freeze([
  'com', 'net', 'org', 'info', 'app', 'dev', 'io', 'co', 'ai', 'so', 'pro', 'cloud', 'tech', 'xyz',
  'design', 'online', 'shop', 'store',
]);

const TLD_SUFFIX = new RegExp(`.\\.(${TLDS.join('|')})$`);

/** Turns user input like " @My Startup ", "https://www.mystartup.design/" into "mystartup", "mystartup.design". */
export function normalizeName(input) {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

/** The domain ending of a name like "acme.design" when it's one that can be checked, otherwise null. */
export function domainEnding(name) {
  const m = TLD_SUFFIX.exec(name);
  return m ? m[1] : null;
}

/** Returns an error message for unusable input, or null when the name can be checked. */
export function validateInput(name) {
  if (!name) return 'Enter a name to check.';
  // A domain ending doesn't count, so the longest domain names (63 characters before the ending) still fit.
  const ending = domainEnding(name);
  if (name.length - (ending ? ending.length + 1 : 0) > 63) {
    return ending ? `Keep the name before .${ending} to 63 characters or fewer.` : 'Keep the name to 63 characters or fewer.';
  }
  if (!/^[a-z0-9._-]+$/.test(name)) return 'Use only letters, numbers, dots, hyphens and underscores.';
  return null;
}

const noEdgeDots = (n) => !n.startsWith('.') && !n.endsWith('.') && !n.includes('..');

// `dot` is what a "." in the name becomes on each platform. It stays where usernames allow periods (as in acme.design)
// and otherwise becomes the separator the platform allows: "_" for handles, "-" for names that are part of a web
// address. Reddit and Hacker News allow both and get "_" like most handles. Facebook ignores periods in usernames and
// rejects domain endings, so there the dot is dropped. Bluesky handles are domain names, so a name with a domain ending
// is checked there as that domain (see `blueskyHandle`).
const RULES = {
  domain: {
    dot: '-',
    test: (n) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(n) && n.slice(2, 4) !== '--',
    hint: 'Domains allow letters, numbers and hyphens (not at the start or end).',
  },
  instagram: {
    dot: '.',
    test: (n) => /^[a-z0-9._]{1,30}$/.test(n) && noEdgeDots(n),
    hint: 'Instagram allows up to 30 letters, numbers, periods and underscores (no leading, trailing or double periods).',
  },
  x: {
    dot: '_',
    test: (n) => /^[a-z0-9_]{1,15}$/.test(n) && !/twitter|admin/.test(n),
    hint: 'X allows up to 15 letters, numbers and underscores, without “twitter” or “admin”.',
  },
  github: {
    dot: '-',
    test: (n) => /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(n),
    hint: 'GitHub allows up to 39 letters, numbers and single hyphens (not at the start or end).',
  },
  youtube: {
    dot: '.',
    test: (n) => /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(n),
    hint: 'YouTube handles are 3–30 letters, numbers, periods, hyphens or underscores, starting and ending with a letter or number.',
  },
  tiktok: {
    dot: '.',
    test: (n) => /^[a-z0-9._]{2,24}$/.test(n) && !n.endsWith('.'),
    hint: 'TikTok allows 2–24 letters, numbers, periods and underscores (not ending with a period).',
  },
  facebook: {
    dot: '',
    test: (n) => /^[a-z0-9.]{5,50}$/.test(n) && noEdgeDots(n) && !/^\d+$/.test(n),
    hint: 'Facebook usernames are 5–50 letters, numbers or periods (not only numbers).',
  },
  linkedin: {
    dot: '.',
    test: (n) => /^[a-z0-9](?:[a-z0-9._-]{0,98}[a-z0-9])?$/.test(n) && n.length >= 2 && !n.includes('linkedin'),
    hint: 'LinkedIn company URLs allow 2–100 letters, numbers, periods, hyphens and underscores, starting and ending with a letter or number.',
  },
  bluesky: {
    dot: '-',
    // Checks the whole handle: NAME.bsky.social, or a domain like acme.design.
    test: (h) =>
      h.endsWith('.bsky.social')
        ? /^[a-z0-9][a-z0-9-]{1,16}[a-z0-9]\.bsky\.social$/.test(h)
        : RULES.domain.test(h.slice(0, h.lastIndexOf('.'))),
    hint: 'Bluesky handles are NAME.bsky.social, with 3–18 letters, numbers and hyphens (not at the start or end), or a domain name.',
  },
  reddit: {
    dot: '_',
    test: (n) => /^[a-z0-9_-]{3,20}$/.test(n),
    hint: 'Reddit usernames are 3–20 letters, numbers, hyphens and underscores.',
  },
  pinterest: {
    dot: '_',
    test: (n) => /^[a-z0-9_]{3,30}$/.test(n),
    hint: 'Pinterest usernames are 3–30 letters, numbers and underscores.',
  },
  twitch: {
    dot: '_',
    test: (n) => /^[a-z0-9][a-z0-9_]{3,24}$/.test(n),
    hint: 'Twitch usernames are 4–25 letters, numbers and underscores (not starting with an underscore).',
  },
  discord: {
    dot: '-',
    test: (n) => /^[a-z0-9-]{2,32}$/.test(n),
    hint: 'Discord invite links allow 2–32 letters, numbers and hyphens.',
  },
  telegram: {
    dot: '_',
    test: (n) => /^[a-z][a-z0-9_]{3,30}[a-z0-9]$/.test(n),
    hint: 'Telegram usernames are 5–32 letters, numbers and underscores, starting with a letter.',
  },
  mastodon: {
    dot: '_',
    test: (n) => /^[a-z0-9_]{1,30}$/.test(n),
    hint: 'Mastodon usernames allow up to 30 letters, numbers and underscores.',
  },
  tumblr: {
    dot: '-',
    test: (n) => /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(n),
    hint: 'Tumblr blog names allow up to 32 letters, numbers and hyphens (not at the start or end).',
  },
  substack: {
    dot: '-',
    test: (n) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(n),
    hint: 'Substack addresses allow letters, numbers and hyphens (not at the start or end).',
  },
  hackernews: {
    dot: '_',
    test: (n) => /^[a-z0-9_-]{2,15}$/.test(n),
    hint: 'Hacker News usernames are 2–15 letters, numbers, hyphens and underscores.',
  },
};

const result = (status, note, extra = {}) => ({ status, note, ...extra });

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * GET that never throws. Cross-origin responses without CORS headers surface as
 * `{ status: 0, error: 'network' }` because browsers hide them from scripts.
 * `body` is the parsed JSON, or undefined when the response isn't JSON.
 * With `redirect: 'manual'`, `redirected` tells whether the server answered with a redirect.
 */
async function get(ctx, url, { timeout = 15000, headers, redirect } = {}) {
  try {
    const res = await ctx.fetch(url, {
      headers,
      redirect,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: timeoutSignal(timeout),
    });
    // Browsers hide manual redirects behind an opaque response; Node shows the 3xx itself.
    const redirected = res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400);
    let body;
    try {
      body = await res.json();
    } catch {
      body = undefined;
    }
    return { ok: res.ok, status: res.status, body, redirected };
  } catch (err) {
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return { ok: false, status: 0, body: undefined, redirected: false, error: timedOut ? 'timeout' : 'network' };
  }
}

/** Fetches a page through Jina Reader (r.jina.ai), which reports the target's HTTP status and title. */
async function readPage(ctx, url) {
  const r = await get(ctx, `https://r.jina.ai/${url}`, { timeout: 30000, headers: { Accept: 'application/json' } });
  const data = r.body && r.body.data;
  if (!r.ok || !data) return { ok: false, rateLimited: r.status === 429, title: '', finalUrl: '', httpStatus: 0 };
  let httpStatus = Number(data.httpStatus) || 0;
  const warned = /returned error (\d{3})/.exec(String(data.warning || ''));
  if (!httpStatus && warned) httpStatus = Number(warned[1]);
  return { ok: true, title: String(data.title || '').trim(), finalUrl: String(data.finalUrl || data.url || ''), httpStatus };
}

const failed = (what = 'The lookup failed') => result(STATUS.UNKNOWN, `${what} — try again in a minute or open the link.`);

// ---------------------------------------------------------------- domains

const RDAP_ORG = { base: 'https://rdap.org/', via: 'rdap.org' };
const IDENTITY_DIGITAL = { base: 'https://rdap.identitydigital.services/rdap/', via: 'Identity Digital RDAP' };
const GOOGLE_REGISTRY = { base: 'https://pubapi.registry.google/rdap/', via: 'Google Registry RDAP' };
const RADIX = { base: 'https://rdap.radix.host/rdap/', via: 'Radix RDAP' };

// Registry RDAP servers from the IANA bootstrap file (https://data.iana.org/rdap/dns.json); all of them send CORS headers.
// .io isn't listed there, but its registry (Identity Digital) answers anyway. .co and .so have no public RDAP, so only
// DNS is left.
const RDAP = {
  com: [{ base: 'https://rdap.verisign.com/com/v1/', via: 'Verisign RDAP' }, RDAP_ORG],
  net: [{ base: 'https://rdap.verisign.com/net/v1/', via: 'Verisign RDAP' }, RDAP_ORG],
  org: [{ base: 'https://rdap.publicinterestregistry.org/rdap/', via: 'Public Interest Registry RDAP' }, RDAP_ORG],
  info: [IDENTITY_DIGITAL, RDAP_ORG],
  app: [GOOGLE_REGISTRY, RDAP_ORG],
  dev: [GOOGLE_REGISTRY, RDAP_ORG],
  io: [IDENTITY_DIGITAL],
  co: [],
  ai: [IDENTITY_DIGITAL, RDAP_ORG],
  so: [],
  pro: [IDENTITY_DIGITAL, RDAP_ORG],
  cloud: [{ base: 'https://rdap.registry.cloud/rdap/', via: '.cloud registry RDAP' }, RDAP_ORG],
  tech: [RADIX, RDAP_ORG],
  xyz: [{ base: 'https://rdap.centralnic.com/xyz/', via: 'CentralNic RDAP' }, RDAP_ORG],
  design: [{ base: 'https://rdap.nic.design/', via: '.design registry RDAP' }, RDAP_ORG],
  online: [RADIX, RDAP_ORG],
  // GMO answers an unregistered .shop with a 404 titled "Error in processing request"; it still means "not registered".
  shop: [{ base: 'https://rdap.gmoregistry.net/rdap/', via: 'GMO Registry RDAP' }, RDAP_ORG],
  store: [RADIX, RDAP_ORG],
};

async function checkDomain(name, tld, ctx) {
  const domain = `${name}.${tld}`;
  for (const { base, via } of RDAP[tld] || []) {
    const r = await get(ctx, `${base}domain/${domain}`);
    // rdap.org also answers 404 when it doesn't know a registry for the TLD.
    const noService = r.body && /no rdap service/i.test(String(r.body.title || ''));
    if (r.status === 404 && !noService) return result(STATUS.AVAILABLE, 'Not registered', { via });
    if (r.ok && r.body && r.body.objectClassName === 'domain') {
      const reg = (r.body.events || []).find((e) => e.eventAction === 'registration');
      const since = reg && reg.eventDate ? ` since ${String(reg.eventDate).slice(0, 10)}` : '';
      return result(STATUS.TAKEN, `Registered${since}`, { via });
    }
  }
  const dns = await get(ctx, `https://dns.google/resolve?name=${domain}&type=NS`);
  if (dns.ok && dns.body) {
    const why = RDAP[tld] && RDAP[tld].length ? 'registry lookup unavailable' : `.${tld} has no public registry lookup`;
    if (dns.body.Status === 3) return result(STATUS.LIKELY, `No DNS records (${why})`, { via: 'Google DNS' });
    if (dns.body.Status === 0) return result(STATUS.TAKEN, 'Domain exists in DNS', { via: 'Google DNS' });
  }
  return failed('Registry lookup failed');
}

// ---------------------------------------------------------------- social

async function checkGitHub(name, ctx) {
  const via = 'GitHub API';
  const r = await get(ctx, `https://api.github.com/users/${name}`);
  if (r.status === 404) return result(STATUS.AVAILABLE, 'No user or organization with this name', { via });
  if (r.ok && r.body && r.body.login) {
    const kind = r.body.type === 'Organization' ? 'Organization' : 'User';
    return result(STATUS.TAKEN, `${kind}: ${r.body.name || r.body.login}`, { via, avatar: r.body.avatar_url });
  }
  if (r.status === 403 || r.status === 429) {
    return result(STATUS.UNKNOWN, 'GitHub API limit reached (60 lookups/hour) — try later or open the link.', { via });
  }
  return failed();
}

async function checkX(name, ctx) {
  const r = await get(ctx, `https://publish.x.com/oembed?url=https://x.com/${name}`);
  if (r.ok && r.body) {
    const handle = String(r.body.url || '').split('/').pop() || name;
    return result(STATUS.TAKEN, `Account @${handle} exists`, { via: 'X oEmbed' });
  }
  // oEmbed can't embed protected accounts either, so a 404 is confirmed with FxTwitter first.
  const f = await get(ctx, `https://api.fxtwitter.com/${name}`);
  if (f.ok && f.body && f.body.user) {
    return result(STATUS.TAKEN, `Account: ${f.body.user.name || f.body.user.screen_name}`, { via: 'FxTwitter' });
  }
  if (f.body && f.body.reason === 'suspended') return result(STATUS.TAKEN, 'Account exists (suspended)', { via: 'FxTwitter' });
  if (r.status === 404) return result(STATUS.AVAILABLE, 'No account with this handle', { via: 'X oEmbed' });
  return failed();
}

const isErrorTitle = (title) => !title || /^(404|error)|not found|before you continue|captcha|sign in|log in/i.test(title);

async function checkYouTube(name, ctx) {
  const u = await get(ctx, `https://unavatar.io/youtube/${name}?fallback=false&json`);
  if (u.status === 404) return result(STATUS.AVAILABLE, 'No channel with this handle', { via: 'unavatar.io' });
  if (u.ok && u.body && u.body.url) return result(STATUS.TAKEN, 'Channel exists', { via: 'unavatar.io', avatar: u.body.url });

  const page = await readPage(ctx, `https://www.youtube.com/@${name}`);
  if (page.ok && page.httpStatus === 404) return result(STATUS.AVAILABLE, 'No channel with this handle', { via: 'Jina Reader' });
  if (page.ok && !isErrorTitle(page.title)) return result(STATUS.TAKEN, `Channel: ${page.title}`, { via: 'Jina Reader' });
  return failed(page.rateLimited ? 'Lookup rate limit reached' : undefined);
}

async function checkTikTok(name, ctx) {
  const oembed = (handle) => get(ctx, `https://www.tiktok.com/oembed?url=https://www.tiktok.com/@${handle}`);
  const r = await oembed(name);
  if (r.ok && r.body && r.body.author_url) {
    return result(STATUS.TAKEN, `Account: ${r.body.author_name || name}`, { via: 'TikTok oEmbed' });
  }
  // TikTok answers unknown users with a 400 that lacks CORS headers, so the browser only sees a failure.
  const page = await readPage(ctx, `https://www.tiktok.com/@${name}`);
  if (page.ok && /couldn.t find this account/i.test(page.title)) {
    return result(STATUS.AVAILABLE, 'No account with this username', { via: 'Jina Reader' });
  }
  if (page.ok && page.title.toLowerCase().includes(`(@${name})`)) {
    return result(STATUS.TAKEN, `Account: ${page.title.split(' (@')[0]}`, { via: 'Jina Reader' });
  }
  const canary = await oembed('tiktok');
  if (canary.ok) return result(STATUS.LIKELY, 'TikTok returned no profile for this username', { via: 'TikTok oEmbed' });
  return failed();
}

async function checkThreads(name, ctx) {
  const page = await readPage(ctx, `https://www.threads.com/@${name}`);
  if (page.ok && page.title.toLowerCase().includes(`(@${name})`)) {
    return result(STATUS.TAKEN, `Profile: ${page.title.split(' (@')[0]}`, { via: 'Jina Reader' });
  }
  if (page.ok && /\/login/.test(page.finalUrl)) {
    return result(STATUS.MANUAL, 'No public Threads profile found. Threads uses Instagram usernames, so it depends on Instagram.', {
      via: 'Jina Reader',
    });
  }
  return result(STATUS.MANUAL, 'Threads could not be checked automatically — open the link to check.');
}

async function checkInstagram(name, ctx, dependsOn) {
  // Reuse the Threads row's lookup when it runs alongside; otherwise (or on retry) look Threads up directly.
  const threads = (await dependsOn('threads')) || (await checkThreads(name, ctx));
  if (threads && threads.status === STATUS.TAKEN) {
    return result(STATUS.TAKEN, 'In use — this handle has a Threads profile, and Threads shares Instagram usernames.', {
      via: 'Threads',
    });
  }
  return result(STATUS.MANUAL, 'Instagram blocks automated lookups from browsers — open the link to check.');
}

async function checkFacebook(name, ctx) {
  const via = 'Facebook Graph API';
  const r = await get(ctx, `https://graph.facebook.com/${name}/picture?redirect=false&type=small`);
  if (r.ok && r.body && r.body.data) {
    const avatar = r.body.data.is_silhouette ? undefined : r.body.data.url;
    return result(STATUS.TAKEN, 'A public Page uses this username', { via, avatar });
  }
  if (r.body && r.body.error && r.body.error.code === 100) {
    return result(STATUS.LIKELY, 'No public Page found (personal profiles can’t be checked)', { via });
  }
  return failed();
}

async function checkLinkedIn(name, ctx) {
  const url = `https://www.linkedin.com/company/${name}`;
  // Login walls and sign-up pages are titled "… | LinkedIn" too, so ignore those.
  const isCompanyTitle = (t) => / \| LinkedIn$/.test(t) && !/^(linkedin|sign up|sign in|log in|join)\b/i.test(t);

  const page = await readPage(ctx, url);
  if (page.ok && page.httpStatus === 404) return result(STATUS.AVAILABLE, 'No company page at this URL', { via: 'Jina Reader' });
  if (page.ok && isCompanyTitle(page.title)) {
    return result(STATUS.TAKEN, `Company: ${page.title.replace(/ \| LinkedIn$/, '')}`, { via: 'Jina Reader' });
  }

  const m = await get(ctx, `https://api.microlink.io/?url=${encodeURIComponent(url)}`, { timeout: 30000 });
  const data = m.body || {};
  if (m.ok && data.statusCode === 404) return result(STATUS.AVAILABLE, 'No company page at this URL', { via: 'Microlink' });
  if (m.ok && data.statusCode === 200 && isCompanyTitle(String((data.data && data.data.title) || ''))) {
    return result(STATUS.TAKEN, `Company: ${data.data.title.replace(/ \| LinkedIn$/, '')}`, { via: 'Microlink' });
  }
  return failed('LinkedIn did not answer');
}

async function checkBluesky(handle, ctx) {
  const via = 'Bluesky API';
  const api = 'https://public.api.bsky.app/xrpc/';
  const profile = await get(ctx, `${api}app.bsky.actor.getProfile?actor=${handle}`);
  if (profile.ok && profile.body && profile.body.did) {
    return result(STATUS.TAKEN, `Account: ${profile.body.displayName || handle}`, { via, avatar: profile.body.avatar });
  }
  // Deactivated accounts have no profile but still hold their handle.
  const r = await get(ctx, `${api}com.atproto.identity.resolveHandle?handle=${handle}`);
  if (r.ok && r.body && r.body.did) return result(STATUS.TAKEN, 'Handle in use (no public profile)', { via });
  if (r.status === 400 && r.body && /unable to resolve handle/i.test(String(r.body.message || ''))) {
    // Only the owner of a domain can use it as a handle.
    const note = handle.endsWith('.bsky.social') ? `Nobody uses ${handle}` : `Nobody uses ${handle} — it’s yours if you own the domain`;
    return result(STATUS.AVAILABLE, note, { via });
  }
  return failed();
}

async function checkReddit(name, ctx) {
  const via = 'Reddit API';
  const free = await get(ctx, `https://www.reddit.com/api/username_available.json?user=${name}`);
  if (free.ok && free.body === true) return result(STATUS.AVAILABLE, 'Username can be registered', { via });
  if (free.ok && free.body === false) return result(STATUS.TAKEN, 'Username is taken (deleted accounts keep theirs)', { via });
  const about = await get(ctx, `https://www.reddit.com/user/${name}/about.json`);
  const user = about.ok && about.body && about.body.data;
  if (user && user.name) return result(STATUS.TAKEN, `User u/${user.name}${user.is_suspended ? ' (suspended)' : ''}`, { via });
  if (about.status === 404) return result(STATUS.LIKELY, 'No active user (names of deleted accounts can’t be reused)', { via });
  // Reddit blocks many networks (VPNs, clouds) without CORS headers, so the browser only sees a failure.
  return result(STATUS.MANUAL, 'Reddit blocked the lookup from this network — open the link to check.');
}

async function checkPinterest(name, ctx) {
  const via = 'Pinterest widget API';
  // Both hosts serve the widget API with separate rate limits. Rate-limited answers have no CORS headers.
  for (const host of ['widgets.pinterest.com', 'api.pinterest.com']) {
    const r = await get(ctx, `https://${host}/v3/pidgets/users/${name}/pins/`);
    if (r.ok && r.body && r.body.status === 'success') {
      const user = (r.body.data && r.body.data.user) || {};
      return result(STATUS.TAKEN, `Profile: ${user.full_name || name}`, { via, avatar: user.image_small_url });
    }
    if (r.status === 404 && r.body && r.body.code === 30) return result(STATUS.AVAILABLE, 'No profile with this username', { via });
  }
  return failed();
}

async function checkTwitch(name, ctx) {
  const via = 'ivr.fi';
  const r = await get(ctx, `https://api.ivr.fi/v2/twitch/user?login=${name}`);
  if (r.ok && Array.isArray(r.body)) {
    const user = r.body[0];
    if (!user) return result(STATUS.AVAILABLE, 'No channel with this name', { via });
    const banned = user.banned ? ' (banned)' : '';
    return result(STATUS.TAKEN, `Channel: ${user.displayName || user.login || name}${banned}`, { via, avatar: user.logo });
  }
  return failed();
}

async function checkDiscord(name, ctx) {
  const via = 'Discord API';
  const r = await get(ctx, `https://discord.com/api/v10/invites/${name}`);
  if (r.ok && r.body && r.body.code) {
    const guild = r.body.guild || {};
    const avatar = guild.id && guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : undefined;
    return result(STATUS.TAKEN, guild.name ? `Invite to the server “${guild.name}”` : 'Invite link in use', { via, avatar });
  }
  if (r.status === 404 && r.body && r.body.code === 10006) {
    return result(STATUS.AVAILABLE, 'No server uses this invite link (custom links need a boosted server)', { via });
  }
  return failed();
}

async function checkTelegram(name, ctx) {
  const via = 'Jina Reader';
  const page = await readPage(ctx, `https://t.me/${name}`);
  // t.me shows this generic page for unknown names, which can also be reserved or up for auction.
  if (page.ok && /^Telegram: Contact @/i.test(page.title)) {
    return result(STATUS.LIKELY, 'No public profile, channel, group or bot uses this username', { via });
  }
  // Used names are titled with the profile or channel name, e.g. "Pavel Durov" or "Telegram News".
  if (page.ok && page.httpStatus === 200 && !isErrorTitle(page.title) && !/^Telegram( Messenger)?$/i.test(page.title)) {
    return result(STATUS.TAKEN, `In use by “${page.title.replace(/^Telegram: View /i, '')}”`, { via });
  }
  return failed(page.rateLimited ? 'Lookup rate limit reached' : undefined);
}

async function checkMastodon(name, ctx) {
  const via = 'mastodon.social API';
  const r = await get(ctx, `https://mastodon.social/api/v1/accounts/lookup?acct=${name}`);
  if (r.ok && r.body && r.body.id) {
    const label = r.body.display_name || r.body.acct || name;
    return result(STATUS.TAKEN, `Account: ${label}${r.body.suspended ? ' (suspended)' : ''}`, { via, avatar: r.body.avatar });
  }
  if (r.status === 404) return result(STATUS.AVAILABLE, 'No account with this username on mastodon.social', { via });
  return failed();
}

async function checkTumblr(name, ctx) {
  const via = 'Tumblr API';
  const avatar = `https://api.tumblr.com/v2/blog/${name}/avatar/64`;
  // Existing blogs redirect to their avatar image. Not following it keeps image hosts out of the CSP.
  // Tumblr's CDN caches that redirect with the CORS header of whoever asked first, so ask with a unique URL.
  const r = await get(ctx, `${avatar}?_=${Math.random().toString(36).slice(2)}`, { redirect: 'manual' });
  if (r.redirected || r.ok) return result(STATUS.TAKEN, 'Blog exists', { via, avatar });
  if (r.status === 404) return result(STATUS.AVAILABLE, 'No blog with this name', { via });
  return failed();
}

async function checkSubstack(name, ctx) {
  const page = await readPage(ctx, `https://${name}.substack.com/`);
  if (page.ok && page.httpStatus === 404) return result(STATUS.AVAILABLE, 'No publication at this address', { via: 'Jina Reader' });
  if (page.ok && page.httpStatus === 200 && !isErrorTitle(page.title)) {
    return result(STATUS.TAKEN, `Publication: ${page.title.replace(/ \| Substack$/, '')}`, { via: 'Jina Reader' });
  }
  return failed(page.rateLimited ? 'Lookup rate limit reached' : undefined);
}

async function checkHackerNews(name, ctx) {
  const via = 'Hacker News API';
  const r = await get(ctx, `https://hacker-news.firebaseio.com/v0/user/${name}.json`);
  if (r.ok && r.body && r.body.id) return result(STATUS.TAKEN, `User ${r.body.id} (${r.body.karma ?? 0} karma)`, { via });
  // The API is case-sensitive, so someone could still hold the name with different capitalization.
  if (r.ok && r.body === null) return result(STATUS.LIKELY, 'No user with this exact username', { via });
  return failed();
}

// ---------------------------------------------------------------- registry

// `handle(name)` is the name as the platform needs it; `rule`, `url` and `check` all work with that handle.

// "acme.design" is acme.design itself on .design, and acme-design.com, acme-design.io and so on on the other endings.
const domainLabel = (n, tld) => (domainEnding(n) === tld ? n.slice(0, -tld.length - 1) : n).replace(/\./g, RULES.domain.dot);

// Bluesky handles are domain names. A name with a domain ending is checked as that domain, which its owner can use as
// their handle; any other name as NAME.bsky.social.
const blueskyHandle = (n) => {
  const tld = domainEnding(n);
  return tld ? `${domainLabel(n, tld)}.${tld}` : `${n.replace(/\./g, RULES.bluesky.dot)}.bsky.social`;
};

const domain = (tld) => ({
  id: tld,
  group: 'domains',
  label: `.${tld}`,
  icon: 'domain',
  rule: RULES.domain,
  defaultChecked: tld === 'com',
  handle: (n) => domainLabel(n, tld),
  url: (h) => `https://${h}.${tld}`,
  check: (h, ctx) => checkDomain(h, tld, ctx),
});

const social = (id, label, check, url, { rule = RULES[id], icon = id, defaultChecked = false, handle } = {}) => ({
  id,
  group: 'social',
  label,
  icon,
  rule,
  defaultChecked,
  handle: handle || ((n) => n.replace(/\./g, rule.dot)),
  url,
  check,
});

/** Everything that can be checked, in display order. `defaultChecked` marks what's selected until the user changes it. */
export const PLATFORMS = [
  ...TLDS.map(domain),
  social('instagram', 'Instagram', checkInstagram, (n) => `https://www.instagram.com/${n}`, { defaultChecked: true }),
  social('x', 'X', checkX, (n) => `https://x.com/${n}`, { defaultChecked: true }),
  social('github', 'GitHub', checkGitHub, (n) => `https://github.com/${n}`, { defaultChecked: true }),
  social('youtube', 'YouTube', checkYouTube, (n) => `https://www.youtube.com/@${n}`, { defaultChecked: true }),
  social('tiktok', 'TikTok', checkTikTok, (n) => `https://www.tiktok.com/@${n}`, { defaultChecked: true }),
  social('threads', 'Threads', checkThreads, (n) => `https://www.threads.com/@${n}`, { rule: RULES.instagram, defaultChecked: true }),
  social('facebook', 'Facebook', checkFacebook, (n) => `https://www.facebook.com/${n}`, { defaultChecked: true }),
  social('linkedin', 'LinkedIn', checkLinkedIn, (n) => `https://www.linkedin.com/company/${n}`, { defaultChecked: true }),
  social('bluesky', 'Bluesky', checkBluesky, (h) => `https://bsky.app/profile/${h}`, { handle: blueskyHandle }),
  social('reddit', 'Reddit', checkReddit, (n) => `https://www.reddit.com/user/${n}`),
  social('pinterest', 'Pinterest', checkPinterest, (n) => `https://www.pinterest.com/${n}/`),
  social('twitch', 'Twitch', checkTwitch, (n) => `https://www.twitch.tv/${n}`),
  social('discord', 'Discord', checkDiscord, (n) => `https://discord.gg/${n}`),
  social('telegram', 'Telegram', checkTelegram, (n) => `https://t.me/${n}`),
  social('mastodon', 'Mastodon', checkMastodon, (n) => `https://mastodon.social/@${n}`),
  social('tumblr', 'Tumblr', checkTumblr, (n) => `https://www.tumblr.com/${n}`),
  social('substack', 'Substack', checkSubstack, (n) => `https://${n}.substack.com`),
  social('hackernews', 'Hacker News', checkHackerNews, (n) => `https://news.ycombinator.com/user?id=${n}`),
];

/** The address a platform's result links to: the name as that platform needs it (see `handle`). */
export const linkFor = (platform, name) => platform.url(platform.handle ? platform.handle(name) : name);

/**
 * Runs the checks for `platforms` (default: all) in parallel. `onResult(id, result)` fires as each one settles.
 * Resolves to `{ [platformId]: result }`. Pass a single platform to retry just that one.
 */
export async function checkAll(name, { fetch: fetchImpl, onResult = () => {}, platforms = PLATFORMS } = {}) {
  const ctx = { fetch: fetchImpl || ((...args) => globalThis.fetch(...args)) };
  const settled = new Map();
  for (const p of platforms) {
    let resolve;
    settled.set(p.id, { promise: new Promise((r) => (resolve = r)), resolve });
  }
  const dependsOn = (id) => (settled.has(id) ? settled.get(id).promise : Promise.resolve(null));

  const run = async (p) => {
    const handle = p.handle ? p.handle(name) : name;
    if (p.rule && !p.rule.test(handle)) return result(STATUS.INVALID, p.rule.hint);
    try {
      return await p.check(handle, ctx, dependsOn);
    } catch {
      return failed();
    }
  };

  const entries = await Promise.all(
    platforms.map(async (p) => {
      const r = await run(p);
      settled.get(p.id).resolve(r);
      try {
        onResult(p.id, r);
      } catch (err) {
        console.error(err);
      }
      return [p.id, r];
    }),
  );
  return Object.fromEntries(entries);
}
