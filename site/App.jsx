import { useEffect, useRef, useState } from 'react';
import {
  ActionMenu,
  Avatar,
  Box,
  Button,
  Checkbox,
  CheckboxGroup,
  FAQ,
  FormControl,
  Heading,
  IconButton,
  InlineCode,
  InlineLink,
  Label,
  Text,
  TextInput,
  ThemeProvider,
  UnorderedList,
} from '@primer/react-brand/esm';
import { DeviceDesktopIcon, GlobeIcon, MarkGithubIcon, MoonIcon, SearchIcon, SunIcon, SyncIcon } from '@primer/octicons-react';
import { checkAll, domainEnding, linkFor, normalizeName, validateInput, PLATFORMS, STATUS, STATUS_LABEL, TLDS } from './checker.js';
import { BRAND_ICONS, EVEN_ODD_ICONS } from './icons.js';

const REPO_URL = 'https://github.com/DariuszPorowski/startup-name-checker';
// Also read by public/theme.js, which applies the saved theme before the page is drawn.
const THEME_KEY = 'startup-name-checker:color-mode';

const GROUPS = [
  { id: 'domains', title: 'Domains', all: 'All domains', none: 'None of the domains' },
  { id: 'social', title: 'Social media', all: 'All social media', none: 'None of the social media' },
];

const SUMMARY_TEXT = {
  [STATUS.AVAILABLE]: 'available',
  [STATUS.LIKELY]: 'likely available',
  [STATUS.TAKEN]: 'taken',
  [STATUS.MANUAL]: 'to check manually',
  [STATUS.UNKNOWN]: 'unknown',
  [STATUS.INVALID]: 'not allowed',
};

const STATUS_COLOR = {
  [STATUS.CHECKING]: 'default',
  [STATUS.AVAILABLE]: 'green',
  [STATUS.LIKELY]: 'lime',
  [STATUS.TAKEN]: 'red',
  [STATUS.MANUAL]: 'yellow',
  [STATUS.UNKNOWN]: 'gray',
  [STATUS.INVALID]: 'purple',
};

const LEGEND = [
  [STATUS.AVAILABLE, 'The service confirmed nobody uses the name.'],
  [STATUS.LIKELY, 'No trace found, but the service can’t fully confirm it.'],
  [STATUS.TAKEN, 'The name is already in use.'],
  [STATUS.MANUAL, 'The service blocks automated checks — open the link.'],
  [STATUS.UNKNOWN, 'The lookup failed or hit a rate limit — try again later.'],
  [STATUS.INVALID, 'The name breaks the platform’s username rules.'],
];

const THEMES = [
  { value: 'auto', label: 'System', icon: DeviceDesktopIcon },
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
];

const NOTHING_SELECTED = 'Pick at least one domain or social media platform to check.';
const DEFAULT_SELECTION = PLATFORMS.filter((p) => p.defaultChecked).map((p) => p.id);
const SOCIAL_COUNT = PLATFORMS.filter((p) => p.group === 'social').length;
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' };

const displayUrl = (url) => url.replace(/^https:\/\/(www\.)?/, '');
const sameItems = (a, b) => a.size === b.size && [...a].every((id) => b.has(id));

// ---------------------------------------------------------------- page address

/** `?domains=com,io&social=x,github` picks exactly those; a missing parameter keeps the defaults. */
function readSelection(params) {
  const selected = new Set(DEFAULT_SELECTION);
  for (const { id: group } of GROUPS) {
    if (!params.has(group)) continue;
    const ids = new Set(params.get(group).toLowerCase().split(',').map((id) => id.trim()));
    for (const p of PLATFORMS) {
      if (p.group !== group) continue;
      if (ids.has(p.id)) selected.add(p.id);
      else selected.delete(p.id);
    }
  }
  return selected;
}

/** Keeps the checked name and the selection in the address, so it can be bookmarked or shared. */
function syncUrl(name, selected) {
  const params = new URLSearchParams(window.location.search);
  if (name) params.set('name', name);
  for (const { id: group } of GROUPS) {
    const platforms = PLATFORMS.filter((p) => p.group === group);
    if (platforms.every((p) => selected.has(p.id) === p.defaultChecked)) {
      params.delete(group);
    } else {
      params.set(group, platforms.filter((p) => selected.has(p.id)).map((p) => p.id).join(','));
    }
  }
  const query = params.toString().replace(/%2C/gi, ',');
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, '', url);
  }
}

// ---------------------------------------------------------------- theme

function readColorMode() {
  try {
    const mode = window.localStorage.getItem(THEME_KEY);
    return mode === 'light' || mode === 'dark' ? mode : 'auto';
  } catch {
    return 'auto';
  }
}

/** Remembers a light or dark choice in this browser; "System" forgets it. */
function saveColorMode(mode) {
  try {
    if (mode === 'auto') window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    // Storage is blocked: the choice lasts until the page is closed.
  }
}

function ThemeMenu({ mode, onChange }) {
  const current = THEMES.find((t) => t.value === mode) || THEMES[0];
  return (
    <ActionMenu selectionVariant="single" onSelect={onChange} menuAlignment="end" size="small">
      <ActionMenu.IconButton icon={current.icon} aria-label={`Theme: ${current.label}`} variant="invisible" />
      <ActionMenu.Overlay aria-label="Theme">
        {THEMES.map(({ value, label, icon: Icon }) => (
          <ActionMenu.Item key={value} value={value} selected={value === mode}>
            <span className="theme-option">
              <Icon />
              {label}
            </span>
          </ActionMenu.Item>
        ))}
      </ActionMenu.Overlay>
    </ActionMenu>
  );
}

// ---------------------------------------------------------------- icons

function BrandIcon({ name, size = 16 }) {
  const d = BRAND_ICONS[name];
  if (!d) return null;
  return (
    <svg className="brand-icon" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      <path d={d} fillRule={EVEN_ODD_ICONS.has(name) ? 'evenodd' : undefined} />
    </svg>
  );
}

const PlatformIcon = ({ platform, size }) =>
  platform.group === 'domains' ? <GlobeIcon size={size} /> : <BrandIcon name={platform.icon} size={size} />;

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" />
      <path d="M9 16.5l4.6 4.6L23.2 11.4" />
    </svg>
  );
}

// ---------------------------------------------------------------- selection

function Picker({ group, selected, onToggle, onSetGroup }) {
  return (
    <Box className="picker" padding={16} borderRadius="large" borderWidth="thin" borderColor="default" borderStyle="solid" backgroundColor="subtle">
      <CheckboxGroup>
        <CheckboxGroup.Label>{group.title}</CheckboxGroup.Label>
        <div className="picker-actions">
          <Button type="button" variant="subtle" size="small" aria-label={group.all} onClick={() => onSetGroup(group.id, true)}>
            All
          </Button>
          <Button type="button" variant="subtle" size="small" aria-label={group.none} onClick={() => onSetGroup(group.id, false)}>
            None
          </Button>
        </div>
        <div className="chips">
          {PLATFORMS.filter((p) => p.group === group.id).map((p) => (
            <FormControl key={p.id} id={`pick-${p.id}`} className="chip">
              <Checkbox value={p.id} checked={selected.has(p.id)} onChange={(event) => onToggle(p.id, event.target.checked)} />
              <FormControl.Label>
                {p.group === 'social' && <BrandIcon name={p.icon} />}
                {p.label}
              </FormControl.Label>
            </FormControl>
          ))}
        </div>
      </CheckboxGroup>
    </Box>
  );
}

// ---------------------------------------------------------------- results

function ResultRow({ platform, name, result, onRetry }) {
  const url = linkFor(platform, name);
  const { status } = result;
  const avatar = typeof result.avatar === 'string' && result.avatar.startsWith('https://') ? result.avatar : null;
  return (
    <li className="row" data-platform={platform.id} data-status={status}>
      <span className="row-icon">
        <PlatformIcon platform={platform} size={20} />
      </span>
      <div className="row-main">
        <div className="row-title">
          <Text as="span" size="200" weight="semibold">
            {platform.label}
          </Text>
          <InlineLink className="link" href={url} {...EXTERNAL}>
            {displayUrl(url)}
          </InlineLink>
        </div>
        <Text as="div" size="100" className="note">
          {result.note || ''}
        </Text>
        <Text as="div" size="100" variant="muted" className="via">
          {result.via ? `via ${result.via}` : ''}
        </Text>
      </div>
      {avatar && <Avatar className="avatar" src={avatar} alt="" size={32} referrerPolicy="no-referrer" />}
      <Label className="badge" color={STATUS_COLOR[status]} size="small">
        {STATUS_LABEL[status] || status}
      </Label>
      <span className="row-retry">
        {status !== STATUS.INVALID && (
          // While checking, the button shows a spinner and ignores clicks but keeps keyboard focus.
          // The summary above already announces progress, so the button stays quiet.
          <IconButton
            type="button"
            icon={SyncIcon}
            aria-label={`Check ${platform.label} again`}
            variant="invisible"
            size="small"
            loading={status === STATUS.CHECKING}
            loadingAnnouncement=""
            tooltipDirection="w"
            onClick={() => onRetry(platform.id)}
          />
        )}
      </span>
    </li>
  );
}

function summarize(rows, results) {
  if (!rows.length) return NOTHING_SELECTED;
  const counts = {};
  for (const p of rows) {
    const status = results.get(p.id)?.status ?? STATUS.CHECKING;
    counts[status] = (counts[status] || 0) + 1;
  }
  const pending = counts[STATUS.CHECKING] || 0;
  if (pending) return `Checking… ${rows.length - pending} of ${rows.length} done`;
  return Object.keys(SUMMARY_TEXT)
    .filter((status) => counts[status])
    .map((status) => `${counts[status]} ${SUMMARY_TEXT[status]}`)
    .join(' · ');
}

function Results({ run, rows, results, onRetry }) {
  const busy = rows.some((p) => (results.get(p.id)?.status ?? STATUS.CHECKING) === STATUS.CHECKING);
  return (
    <section id="results" className="results" aria-labelledby="results-title" aria-busy={busy}>
      <div className="results-head">
        <Heading as="h2" size="5" id="results-title">
          Results for <span className="checked-name">{run.name}</span>
        </Heading>
        <Text as="p" size="200" variant="muted" id="summary" aria-live="polite">
          {summarize(rows, results)}
        </Text>
      </div>
      {GROUPS.map((group) => {
        // A name like "acme.design" puts that exact domain first; the other endings check acme-design.com and so on.
        const groupRows = rows.filter((p) => p.group === group.id).sort((a, b) => (b.id === run.ending) - (a.id === run.ending));
        if (!groupRows.length) return null;
        return (
          <div key={group.id} className="result-group">
            <Heading as="h3" size="6" id={`${group.id}-title`}>
              {group.title}
            </Heading>
            <ul id={`list-${group.id}`} className="list" aria-labelledby={`${group.id}-title`}>
              {groupRows.map((p) => (
                <ResultRow key={p.id} platform={p} name={run.name} result={results.get(p.id) ?? { status: STATUS.CHECKING }} onRetry={onRetry} />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- about

function About() {
  return (
    <FAQ className="about">
      <FAQ.Heading as="h2" size="5" align="start">
        How it works
      </FAQ.Heading>
      <FAQ.Item>
        <FAQ.Question as="h3">Is the name I check stored anywhere?</FAQ.Question>
        <FAQ.Answer>
          <p>
            No. Every lookup goes directly from your browser to a public service — there is no backend, nothing is stored,
            and nothing is tracked. The only thing the page remembers is a light or dark theme you pick, and that stays in
            your browser.
          </p>
        </FAQ.Answer>
      </FAQ.Item>
      <FAQ.Item>
        <FAQ.Question as="h3">Where do the results come from?</FAQ.Question>
        <FAQ.Answer>
          <UnorderedList>
            <UnorderedList.Item>
              <strong>Domain endings</strong> — the registry’s official RDAP service: Verisign for .com and .net, Public
              Interest Registry for .org, Identity Digital for .info, .io, .ai and .pro, Google Registry for .app and .dev,
              the .cloud and .design registries, Radix for .tech, .online and .store, CentralNic for .xyz and GMO Registry
              for .shop. When one doesn’t answer, rdap.org and Google Public DNS are asked instead. <strong>.co</strong>{' '}
              and <strong>.so</strong> have no public registry lookup, so they’re checked through DNS only.
            </UnorderedList.Item>
            <UnorderedList.Item>
              <strong>GitHub</strong> — GitHub REST API. <strong>X</strong> — X oEmbed, falling back to FxTwitter.
            </UnorderedList.Item>
            <UnorderedList.Item>
              <strong>YouTube</strong> — Unavatar. <strong>TikTok</strong> — TikTok oEmbed. <strong>Facebook</strong> —
              Graph API (detects public Pages only; personal profiles can’t be checked).
            </UnorderedList.Item>
            <UnorderedList.Item>
              <strong>Bluesky, Reddit, Pinterest, Discord, Mastodon, Tumblr, Hacker News</strong> — their public APIs.{' '}
              <strong>Twitch</strong> — ivr.fi. Bluesky checks <InlineCode>NAME.bsky.social</InlineCode> (or the domain
              itself, for a name like <InlineCode>acme.design</InlineCode>), Mastodon checks
              mastodon.social and Discord checks custom invite links (<InlineCode>discord.gg/NAME</InlineCode>). Reddit
              blocks some networks, such as VPNs — then open the link.
            </UnorderedList.Item>
            <UnorderedList.Item>
              <strong>Threads, LinkedIn, Telegram, Substack</strong> and fallbacks — the public page is read through Jina
              Reader (or Microlink).
            </UnorderedList.Item>
            <UnorderedList.Item>
              <strong>Instagram</strong> blocks automated lookups, so open the link to check. If the handle has a Threads
              profile, it’s marked taken because Threads shares Instagram usernames.
            </UnorderedList.Item>
          </UnorderedList>
        </FAQ.Answer>
      </FAQ.Item>
      <FAQ.Item>
        <FAQ.Question as="h3">What do the results mean?</FAQ.Question>
        <FAQ.Answer>
          <dl className="legend">
            {LEGEND.map(([status, text]) => (
              <div key={status}>
                <dt>
                  <Label color={STATUS_COLOR[status]} size="small">
                    {STATUS_LABEL[status]}
                  </Label>
                </dt>
                <dd>
                  <Text size="200" variant="muted">
                    {text}
                  </Text>
                </dd>
              </div>
            ))}
          </dl>
        </FAQ.Answer>
      </FAQ.Item>
      <FAQ.Item>
        <FAQ.Question as="h3">How do I choose what to check?</FAQ.Question>
        <FAQ.Answer>
          <p>
            Tick the domain endings and platforms under the search box — .com and the eight biggest social networks are
            picked until you change it. Your choice is kept in the page address, so you can bookmark or share it. Use the
            refresh button on a result to check just that one again.
          </p>
        </FAQ.Answer>
      </FAQ.Item>
      <FAQ.Item>
        <FAQ.Question as="h3">Can the name include a domain ending, like acme.design?</FAQ.Question>
        <FAQ.Answer>
          <p>
            Yes. <InlineCode>acme.design</InlineCode> is checked as that exact domain (its ending is ticked for you), and the
            other endings as <InlineCode>acme-design.com</InlineCode>, <InlineCode>acme-design.io</InlineCode> and so on. Any
            other dots become hyphens too, so <InlineCode>acme.rocket.design</InlineCode> checks{' '}
            <InlineCode>acme-rocket.design</InlineCode>.
          </p>
          <p>
            On social platforms the dot stays wherever usernames allow it — Instagram, Threads, TikTok, YouTube and
            LinkedIn. Bluesky handles are domain names, so Bluesky checks <InlineCode>acme.design</InlineCode> itself, which
            whoever owns the domain can use. Elsewhere the dot becomes the separator the platform uses: an underscore on X,
            Reddit, Pinterest, Twitch, Telegram, Mastodon and Hacker News, and a hyphen on GitHub, Discord, Tumblr and
            Substack. Facebook ignores periods in usernames, so there it’s left out (<InlineCode>acmedesign</InlineCode>).
            Each result links to the exact address that was checked.
          </p>
        </FAQ.Answer>
      </FAQ.Item>
      <FAQ.Item>
        <FAQ.Question as="h3">Why is a result unknown?</FAQ.Question>
        <FAQ.Answer>
          <p>
            Free services limit how often they can be used (for example GitHub: 60 lookups/hour, Unavatar: 25/day, Jina
            Reader: 20/minute), and some refuse lookups from certain networks. Try that result again later. Results are
            best effort — always confirm before you commit to a name.
          </p>
        </FAQ.Answer>
      </FAQ.Item>
    </FAQ>
  );
}

// ---------------------------------------------------------------- page

export default function App() {
  const [initialParams] = useState(() => new URLSearchParams(window.location.search));
  const [name, setName] = useState(() => initialParams.get('name') || '');
  const [selected, setSelected] = useState(() => readSelection(initialParams));
  const [error, setError] = useState(null);
  const [run, setRun] = useState(null);
  const [results, setResults] = useState(() => new Map());
  const [colorMode, setColorMode] = useState(readColorMode);

  // The run on screen and an attempt number per check, so answers for an older run or attempt are dropped.
  const runRef = useRef(null);
  const attemptCounter = useRef(0);
  const inputRef = useRef(null);
  const started = useRef(false);

  const rows = run ? PLATFORMS.filter((p) => selected.has(p.id)) : [];

  /** Starts (or restarts) the checks for `platforms` in one batch, so Instagram can reuse the Threads lookup. */
  function startChecks(current, platforms) {
    if (!platforms.length) return;
    const attempts = new Map();
    for (const p of platforms) {
      attempts.set(p.id, ++attemptCounter.current);
      current.attempts.set(p.id, attemptCounter.current);
    }
    setResults((prev) => {
      const next = new Map(prev);
      for (const p of platforms) next.set(p.id, { status: STATUS.CHECKING });
      return next;
    });
    checkAll(current.name, {
      platforms,
      onResult(id, res) {
        if (runRef.current !== current || current.attempts.get(id) !== attempts.get(id)) return;
        setResults((prev) => new Map(prev).set(id, res));
      },
    });
  }

  function startRun(rawName) {
    const clean = normalizeName(rawName);
    const problem = validateInput(clean);
    if (problem) {
      setError({ message: problem, badInput: true });
      inputRef.current?.focus();
      return;
    }
    // A name like "acme.design" is checked as that exact domain, so its ending gets ticked.
    const ending = domainEnding(clean);
    const picked = ending && !selected.has(ending) ? new Set(selected).add(ending) : selected;
    const platforms = PLATFORMS.filter((p) => picked.has(p.id));
    if (!platforms.length) {
      setError({ message: NOTHING_SELECTED, badInput: false });
      return;
    }
    if (picked !== selected) setSelected(picked);
    setError(null);
    setName(clean);
    const current = { name: clean, ending, attempts: new Map() };
    runRef.current = current;
    setRun(current);
    setResults(new Map());
    startChecks(current, platforms);
  }

  /** Brings the results in line with the checkboxes: drops unticked ones and checks newly ticked ones. */
  function applySelection(next) {
    if (sameItems(next, selected)) return;
    setSelected(next);
    if (error?.message === NOTHING_SELECTED && next.size) setError(null);
    const current = runRef.current;
    if (!current) return;
    const removed = [...selected].filter((id) => !next.has(id));
    for (const id of removed) current.attempts.delete(id);
    if (removed.length) {
      setResults((prev) => {
        const kept = new Map(prev);
        for (const id of removed) kept.delete(id);
        return kept;
      });
    }
    startChecks(current, PLATFORMS.filter((p) => next.has(p.id) && !selected.has(p.id)));
  }

  function toggle(id, checked) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    applySelection(next);
  }

  function setGroup(group, checked) {
    const next = new Set(selected);
    for (const p of PLATFORMS) {
      if (p.group !== group) continue;
      if (checked) next.add(p.id);
      else next.delete(p.id);
    }
    applySelection(next);
  }

  function retry(id) {
    const current = runRef.current;
    const state = results.get(id);
    if (!current || !state || state.status === STATUS.CHECKING) return;
    startChecks(current, PLATFORMS.filter((p) => p.id === id));
  }

  function changeColorMode(mode) {
    setColorMode(mode);
    saveColorMode(mode);
  }

  // Check the name from the address once, when the page opens (the guard keeps React's development double-run out).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const initialName = initialParams.get('name');
    if (initialName) startRun(initialName);
    else inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncUrl(run?.name, selected);
  }, [run, selected]);

  useEffect(() => {
    if (run) document.title = `${run.name} — Startup Name Checker`;
  }, [run]);

  // The page background and native controls outside the app follow the same theme.
  useEffect(() => {
    document.documentElement.dataset.colorMode = colorMode;
  }, [colorMode]);

  const badInput = Boolean(error?.badInput);

  return (
    <ThemeProvider colorMode={colorMode} className="app">
      <header className="container topbar">
        <a className="brand" href="./">
          <Logo />
          <Text as="span" size="200" weight="semibold">
            Startup Name Checker
          </Text>
        </a>
        <div className="topbar-actions">
          <IconButton as="a" href={REPO_URL} {...EXTERNAL} icon={MarkGithubIcon} aria-label="Source on GitHub" variant="invisible" />
          <ThemeMenu mode={colorMode} onChange={changeColorMode} />
        </div>
      </header>

      <main className="container">
        <div className="hero">
          <Heading as="h1" size="3">
            Is your startup name free?
          </Heading>
          <Text as="p" size="300" variant="muted">
            Check {TLDS.length} domain endings and {SOCIAL_COUNT} social platforms at once — right in your browser.
          </Text>
        </div>

        <form
          role="search"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            startRun(name);
          }}
        >
          <div className="search">
            <FormControl id="name" fullWidth size="large" validationStatus={badInput ? 'error' : undefined}>
              <FormControl.Label visuallyHidden>Startup name</FormControl.Label>
              <TextInput
                ref={inputRef}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (error) setError(null);
                }}
                placeholder="e.g. acmerocket"
                maxLength={100}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                leadingVisual={<SearchIcon />}
              />
              <FormControl.Hint>
                Letters, numbers, dots, hyphens and underscores. A name like <InlineCode>acme.design</InlineCode> checks that
                exact domain — elsewhere the dot becomes what each platform allows, like <InlineCode>acme-design.com</InlineCode>{' '}
                or <InlineCode>@acme_design</InlineCode>.
              </FormControl.Hint>
              {badInput && <FormControl.Validation role="alert">{error.message}</FormControl.Validation>}
            </FormControl>
            <Button type="submit" variant="primary" size="large">
              Check
            </Button>
          </div>

          <CheckboxGroup className="pickers">
            <CheckboxGroup.Label visuallyHidden>What to check</CheckboxGroup.Label>
            {GROUPS.map((group) => (
              <Picker key={group.id} group={group} selected={selected} onToggle={toggle} onSetGroup={setGroup} />
            ))}
            {error && !badInput && (
              <CheckboxGroup.Validation variant="error" role="alert">
                {error.message}
              </CheckboxGroup.Validation>
            )}
          </CheckboxGroup>
        </form>

        {run && <Results run={run} rows={rows} results={results} onRetry={retry} />}

        <About />
      </main>

      <footer className="container">
        <div className="footer">
          <Text as="p" size="100" variant="muted">
            No backend, no cookies, no tracking. The name you check is sent straight from your browser to the services that
            answer the lookups. Avatars provided by{' '}
            <InlineLink href="https://unavatar.io" {...EXTERNAL}>
              Unavatar
            </InlineLink>
            .
          </Text>
          <Text as="p" size="100" variant="muted">
            <InlineLink href={REPO_URL} {...EXTERNAL}>
              Source on GitHub
            </InlineLink>{' '}
            · Built with{' '}
            <InlineLink href="https://primer.style/brand" {...EXTERNAL}>
              Primer Brand
            </InlineLink>{' '}
            · Not affiliated with any of the services checked.
          </Text>
        </div>
      </footer>
    </ThemeProvider>
  );
}
