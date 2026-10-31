import { checkAll, normalizeName, validateInput, PLATFORMS, STATUS, STATUS_LABEL } from './checker.js';
import { ICONS } from './icons.js';

const form = document.getElementById('search');
const input = document.getElementById('name');
const errorBox = document.getElementById('error');
const results = document.getElementById('results');
const checkedName = document.getElementById('checked-name');
const summary = document.getElementById('summary');
const rowTemplate = document.getElementById('row-template');
const chipTemplate = document.getElementById('chip-template');

const GROUPS = ['domains', 'social'];
const lists = Object.fromEntries(GROUPS.map((group) => [group, document.getElementById(`list-${group}`)]));
const listTitles = Object.fromEntries(GROUPS.map((group) => [group, document.getElementById(`${group}-title`)]));
const boxes = new Map();

const SUMMARY_TEXT = {
  [STATUS.AVAILABLE]: 'available',
  [STATUS.LIKELY]: 'likely available',
  [STATUS.TAKEN]: 'taken',
  [STATUS.MANUAL]: 'to check manually',
  [STATUS.UNKNOWN]: 'unknown',
  [STATUS.INVALID]: 'not allowed',
};

const NOTHING_SELECTED = 'Pick at least one domain or social media platform to check.';

// The results on screen. Rows follow the checkboxes; each check gets an attempt number so stale answers are dropped.
let current = null;
let attemptCounter = 0;

const displayUrl = (url) => url.replace(/^https:\/\/(www\.)?/, '');

// ---------------------------------------------------------------- selection

function buildPickers() {
  for (const platform of PLATFORMS) {
    const chip = chipTemplate.content.firstElementChild.cloneNode(true);
    const box = chip.querySelector('input');
    box.value = platform.id;
    box.checked = platform.defaultChecked;
    if (platform.group === 'social') chip.querySelector('.chip-icon').innerHTML = ICONS[platform.icon] || '';
    chip.querySelector('.chip-label').textContent = platform.label;
    document.getElementById(`chips-${platform.group}`).append(chip);
    boxes.set(platform.id, box);
  }
}

const selectedPlatforms = () => PLATFORMS.filter((p) => boxes.get(p.id).checked);

/** `?domains=com,io&social=x,github` picks exactly those; a missing parameter keeps the defaults. */
function readSelection(params) {
  for (const group of GROUPS) {
    if (!params.has(group)) continue;
    const ids = new Set(params.get(group).toLowerCase().split(',').map((id) => id.trim()));
    for (const p of PLATFORMS) if (p.group === group) boxes.get(p.id).checked = ids.has(p.id);
  }
}

function syncUrl() {
  const params = new URLSearchParams(window.location.search);
  if (current) params.set('name', current.name);
  for (const group of GROUPS) {
    const platforms = PLATFORMS.filter((p) => p.group === group);
    if (platforms.every((p) => boxes.get(p.id).checked === p.defaultChecked)) {
      params.delete(group);
    } else {
      params.set(group, platforms.filter((p) => boxes.get(p.id).checked).map((p) => p.id).join(','));
    }
  }
  const query = params.toString().replace(/%2C/gi, ',');
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
}

// ---------------------------------------------------------------- results

function createRow(platform, name) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  row.dataset.platform = platform.id;
  row.querySelector('.icon').innerHTML = ICONS[platform.icon] || '';
  row.querySelector('.label').textContent = platform.label;
  const link = row.querySelector('.link');
  const url = platform.url(name);
  link.href = url;
  link.textContent = displayUrl(url);
  const retry = row.querySelector('.retry');
  retry.innerHTML = ICONS.refresh;
  retry.setAttribute('aria-label', `Check ${platform.label} again`);
  return row;
}

function updateRow(row, res) {
  row.dataset.status = res.status;
  row.querySelector('.badge').textContent = STATUS_LABEL[res.status] || res.status;
  row.querySelector('.note').textContent = res.note || '';
  row.querySelector('.via').textContent = res.via ? `via ${res.via}` : '';
  // aria-disabled instead of disabled keeps keyboard focus on the button while it re-checks.
  row.querySelector('.retry').setAttribute('aria-disabled', String(res.status === STATUS.CHECKING));
  const avatar = row.querySelector('.avatar');
  if (typeof res.avatar === 'string' && res.avatar.startsWith('https://')) {
    avatar.src = res.avatar;
    avatar.hidden = false;
  } else {
    avatar.removeAttribute('src');
    avatar.hidden = true;
  }
}

function updateSummary() {
  const { states } = current;
  if (!states.size) {
    summary.textContent = NOTHING_SELECTED;
    return;
  }
  const counts = {};
  for (const res of states.values()) counts[res.status] = (counts[res.status] || 0) + 1;
  const pending = counts[STATUS.CHECKING] || 0;
  if (pending) {
    summary.textContent = `Checking… ${states.size - pending} of ${states.size} done`;
    return;
  }
  summary.textContent = Object.keys(SUMMARY_TEXT)
    .filter((status) => counts[status])
    .map((status) => `${counts[status]} ${SUMMARY_TEXT[status]}`)
    .join(' · ');
}

function updateResults() {
  for (const group of GROUPS) {
    const empty = !lists[group].children.length;
    lists[group].hidden = empty;
    listTitles[group].hidden = empty;
  }
  const busy = [...current.states.values()].some((res) => res.status === STATUS.CHECKING);
  results.setAttribute('aria-busy', String(busy));
  updateSummary();
}

function setResult(id, res) {
  current.states.set(id, res);
  updateRow(current.rows.get(id), res);
}

/** Starts (or restarts) the checks for `platforms` in one batch, so Instagram can reuse the Threads lookup. */
function startChecks(platforms) {
  if (!platforms.length) return;
  const run = current;
  const attempts = new Map();
  for (const p of platforms) {
    attempts.set(p.id, ++attemptCounter);
    run.attempts.set(p.id, attemptCounter);
    setResult(p.id, { status: STATUS.CHECKING });
  }
  updateResults();
  checkAll(run.name, {
    platforms,
    onResult(id, res) {
      if (run !== current || run.attempts.get(id) !== attempts.get(id)) return;
      setResult(id, res);
      updateResults();
    },
  });
}

function addRows(platforms) {
  for (const platform of platforms) {
    const list = lists[platform.group];
    const row = createRow(platform, current.name);
    // Keep the display order of PLATFORMS when rows are added later.
    const next = PLATFORMS.slice(PLATFORMS.indexOf(platform) + 1)
      .map((p) => current.rows.get(p.id))
      .find((r) => r && r.parentElement === list);
    list.insertBefore(row, next || null);
    current.rows.set(platform.id, row);
  }
}

function removeRow(id) {
  current.rows.get(id).remove();
  current.rows.delete(id);
  current.states.delete(id);
  current.attempts.delete(id);
}

/** Brings the result rows in line with the checkboxes: removes unchecked ones and checks newly picked ones. */
function applySelection() {
  if (errorBox.textContent === NOTHING_SELECTED && selectedPlatforms().length) clearError();
  syncUrl();
  if (!current) return;
  const wanted = new Set(selectedPlatforms().map((p) => p.id));
  for (const id of [...current.rows.keys()]) if (!wanted.has(id)) removeRow(id);
  const added = PLATFORMS.filter((p) => wanted.has(p.id) && !current.rows.has(p.id));
  addRows(added);
  startChecks(added);
  updateResults();
}

function retry(id) {
  const state = current && current.states.get(id);
  if (!state || state.status === STATUS.CHECKING) return;
  startChecks(PLATFORMS.filter((p) => p.id === id));
}

// ---------------------------------------------------------------- form

function showError(message, { badInput = true } = {}) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  if (badInput) input.setAttribute('aria-invalid', 'true');
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
  input.removeAttribute('aria-invalid');
}

function run(rawName) {
  const name = normalizeName(rawName);
  const problem = validateInput(name);
  if (problem) {
    showError(problem);
    input.focus();
    return;
  }
  const platforms = selectedPlatforms();
  if (!platforms.length) {
    showError(NOTHING_SELECTED, { badInput: false });
    return;
  }
  clearError();
  input.value = name;
  current = { name, rows: new Map(), states: new Map(), attempts: new Map() };
  for (const list of Object.values(lists)) list.replaceChildren();
  checkedName.textContent = name;
  document.title = `${name} — Startup Name Checker`;
  syncUrl();
  addRows(platforms);
  results.hidden = false;
  startChecks(platforms);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  run(input.value);
});

form.addEventListener('change', (event) => {
  if (event.target.matches('.chip input')) applySelection();
});

form.addEventListener('click', (event) => {
  const button = event.target.closest('[data-select]');
  if (!button) return;
  const { group } = button.closest('[data-group]').dataset;
  for (const p of PLATFORMS) if (p.group === group) boxes.get(p.id).checked = button.dataset.select === 'all';
  applySelection();
});

results.addEventListener('click', (event) => {
  const button = event.target.closest('.retry');
  if (button) retry(button.closest('.row').dataset.platform);
});

input.addEventListener('input', clearError);

buildPickers();
const params = new URLSearchParams(window.location.search);
readSelection(params);
const initialName = params.get('name');
if (initialName) {
  input.value = initialName;
  run(initialName);
} else {
  input.focus();
}
