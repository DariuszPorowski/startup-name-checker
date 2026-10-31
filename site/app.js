import { checkAll, normalizeName, validateInput, PLATFORMS, STATUS, STATUS_LABEL } from './checker.js';
import { ICONS } from './icons.js';

const form = document.getElementById('search');
const input = document.getElementById('name');
const errorBox = document.getElementById('error');
const results = document.getElementById('results');
const checkedName = document.getElementById('checked-name');
const summary = document.getElementById('summary');
const rowTemplate = document.getElementById('row-template');
const lists = {
  domains: document.getElementById('list-domains'),
  social: document.getElementById('list-social'),
};

const SUMMARY_TEXT = {
  [STATUS.AVAILABLE]: 'available',
  [STATUS.LIKELY]: 'likely available',
  [STATUS.TAKEN]: 'taken',
  [STATUS.MANUAL]: 'to check manually',
  [STATUS.UNKNOWN]: 'unknown',
  [STATUS.INVALID]: 'not allowed',
};

let currentRun = 0;

const displayUrl = (url) => url.replace(/^https:\/\/(www\.)?/, '');

function createRow(platform, name) {
  const row = rowTemplate.content.firstElementChild.cloneNode(true);
  row.dataset.platform = platform.id;
  row.querySelector('.icon').innerHTML = ICONS[platform.icon] || '';
  row.querySelector('.label').textContent = platform.label;
  const link = row.querySelector('.link');
  const url = platform.url(name);
  link.href = url;
  link.textContent = displayUrl(url);
  return row;
}

function updateRow(row, res) {
  row.dataset.status = res.status;
  row.querySelector('.badge').textContent = STATUS_LABEL[res.status] || res.status;
  row.querySelector('.note').textContent = res.note || '';
  row.querySelector('.via').textContent = res.via ? `via ${res.via}` : '';
  const avatar = row.querySelector('.avatar');
  if (typeof res.avatar === 'string' && res.avatar.startsWith('https://')) {
    avatar.src = res.avatar;
    avatar.hidden = false;
  } else {
    avatar.removeAttribute('src');
    avatar.hidden = true;
  }
}

function updateSummary(states) {
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

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  input.setAttribute('aria-invalid', 'true');
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
  input.removeAttribute('aria-invalid');
}

function rememberName(name) {
  const url = new URL(window.location.href);
  url.searchParams.set('name', name);
  window.history.replaceState(null, '', url);
  document.title = `${name} — Startup Name Checker`;
}

async function run(rawName) {
  const name = normalizeName(rawName);
  const problem = validateInput(name);
  if (problem) {
    showError(problem);
    input.focus();
    return;
  }
  clearError();
  input.value = name;
  rememberName(name);

  const runId = ++currentRun;
  const rows = new Map();
  const states = new Map();
  for (const list of Object.values(lists)) list.replaceChildren();
  for (const platform of PLATFORMS) {
    const row = createRow(platform, name);
    const state = { status: STATUS.CHECKING };
    updateRow(row, state);
    lists[platform.group].append(row);
    rows.set(platform.id, row);
    states.set(platform.id, state);
  }
  checkedName.textContent = name;
  results.hidden = false;
  results.setAttribute('aria-busy', 'true');
  updateSummary(states);

  await checkAll(name, {
    onResult(id, res) {
      if (runId !== currentRun) return;
      states.set(id, res);
      updateRow(rows.get(id), res);
      updateSummary(states);
    },
  });

  if (runId === currentRun) results.setAttribute('aria-busy', 'false');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  run(input.value);
});

input.addEventListener('input', clearError);

const initialName = new URLSearchParams(window.location.search).get('name');
if (initialName) {
  input.value = initialName;
  run(initialName);
} else {
  input.focus();
}
