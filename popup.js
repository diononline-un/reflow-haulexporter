// Reflow Haul Exporter – Popup Script

// ── Translations ──────────────────────────────────────────────────────────────

const TRANSLATIONS = {
  de: {
    subtitle:          'Haul Exporter',
    noSite:            'gtbuy.com, acbuy.com oder cnfans.com öffnen',
    rangeLabel:        'Bestellbereich',
    fromLabel:         'Von Bestellnr.',
    toLabel:           'Bis Bestellnr.',
    btnCopy:           'In Zwischenablage kopieren',
    saveRange:         'Bereich speichern',
    loadRange:         'Bereich laden',
    savedRangeText:    'Gespeicherter Bereich:',
    filterPointsLabel: 'Punkte-Bestellungen filtern',
    hintText:          'Neueste Bestellnr. bei "Von", älteste bei "Bis". Leer lassen für alle.',
    loading:           'Lade Bestellungen…',
    copied:            'Kopiert!',
    noItems:           'Keine Bestellungen gefunden.',
    error:             'Fehler: ',
  },
  en: {
    subtitle:          'Haul Exporter',
    noSite:            'Open gtbuy.com, acbuy.com or cnfans.com',
    rangeLabel:        'Order Range',
    fromLabel:         'From Order Nr.',
    toLabel:           'To Order Nr.',
    btnCopy:           'Copy to Clipboard',
    saveRange:         'Save Range',
    loadRange:         'Load Range',
    savedRangeText:    'Saved range:',
    filterPointsLabel: 'Filter point orders',
    hintText:          'Newest order nr. at "From", oldest at "To". Leave empty for all.',
    loading:           'Loading orders…',
    copied:            'Copied!',
    noItems:           'No orders found.',
    error:             'Error: ',
  }
};

let currentLang = 'de';

function t(key) {
  return (TRANSLATIONS[currentLang] || TRANSLATIONS.de)[key] || key;
}

function applyTranslations() {
  document.documentElement.lang = currentLang;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  // siteLabel is dynamic – only update when no site is active
  if (!currentAgent) {
    siteLabel.textContent = t('noSite');
  }
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const statusEl        = document.getElementById('status');
const fromInput       = document.getElementById('from');
const toInput         = document.getElementById('to');
const btnCopy         = document.getElementById('btnCopy');
const btnSave         = document.getElementById('btnSaveRange');
const btnLoad         = document.getElementById('btnLoadRange');
const savedRangeEl    = document.getElementById('savedRange');
const savedRangeValue = savedRangeEl.querySelector('strong');
const siteBadge       = document.getElementById('siteBadge');
const siteLabel       = document.getElementById('siteLabel');
const siteIndicator   = document.getElementById('siteIndicator');
const filterPointsRow = document.getElementById('filterPointsRow');
const filterPointsCb  = document.getElementById('filterPoints');
const langBtn         = document.getElementById('langBtn');
const langDropdown    = document.getElementById('langDropdown');

const STORAGE_KEY = 'agent_last_haul';

// ── Language selector ─────────────────────────────────────────────────────────

function setLang(lang) {
  currentLang = lang;
  document.getElementById('langDe').classList.toggle('active', lang === 'de');
  document.getElementById('langEn').classList.toggle('active', lang === 'en');
  langDropdown.classList.remove('open');
  applyTranslations();
  chrome.storage.local.set({ haul_lang: lang });
}

langBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  langDropdown.classList.toggle('open');
});

document.addEventListener('click', () => langDropdown.classList.remove('open'));

document.getElementById('langDe').addEventListener('click', () => setLang('de'));
document.getElementById('langEn').addEventListener('click', () => setLang('en'));

// ── Site Detection ────────────────────────────────────────────────────────────

let currentAgent = null;
let currentTabId = null;

async function detectSite() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab  = tabs[0];
  if (!tab) return;

  currentTabId = tab.id;
  const url    = tab.url || '';

  if (url.includes('gtbuy.com')) {
    currentAgent = 'gtbuy';
    siteBadge.className   = 'badge badge-gtbuy';
    siteBadge.textContent = 'GTBuy';
    siteLabel.textContent = 'GTBuy';
    siteIndicator.classList.add('active');
    filterPointsRow.style.display = 'none';
    fromInput.placeholder = 'IGT2604090790001698';
  } else if (url.includes('acbuy.com')) {
    currentAgent = 'acbuy';
    siteBadge.className   = 'badge badge-acbuy';
    siteBadge.textContent = 'ACBuy';
    siteLabel.textContent = 'ACBuy';
    siteIndicator.classList.add('active');
    filterPointsRow.style.display = 'flex';
    fromInput.placeholder = 'AO03038006045';
  } else if (url.includes('cnfans.com')) {
    currentAgent = 'cnfans';
    siteBadge.className   = 'badge badge-cnfans';
    siteBadge.textContent = 'CNFans';
    siteLabel.textContent = 'CNFans';
    siteIndicator.classList.add('active');
    filterPointsRow.style.display = 'none';
    fromInput.placeholder = 'CNF1845247177084942';
  } else {
    currentAgent = null;
    siteLabel.textContent = t('noSite');
    btnCopy.disabled = true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className   = type;
}

function toTSV(items) {
  const header = ['Order Nr', 'Date', 'Item Name', 'Quantity', 'Unit Price', 'Status', 'Link'];
  const rows   = items.map(i => [
    i.orderNo   || '',
    i.date      || i.orderDate || '',
    i.name,
    i.quantity  || i.qty,
    i.unitPrice || i.price,
    i.status,
    i.link      || ''
  ]);
  return [header, ...rows].map(r => r.join('\t')).join('\n');
}

function getStorageKey() {
  return `${STORAGE_KEY}_${currentAgent}`;
}

function updateSavedRangeDisplay(from, to) {
  if (from || to) {
    savedRangeValue.textContent = `${from || '–'} → ${to || '–'}`;
    savedRangeEl.style.display  = 'flex';
  } else {
    savedRangeEl.style.display = 'none';
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

btnCopy.addEventListener('click', async () => {
  if (!currentAgent) return;

  const from         = fromInput.value.trim();
  const to           = toInput.value.trim();
  const filterPoints = currentAgent === 'acbuy' && filterPointsCb.checked;

  setStatus(t('loading'));
  btnCopy.disabled = true;

  try {
    const response = await chrome.tabs.sendMessage(currentTabId, {
      action: 'fetchOrders',
      from, to, filterPoints
    });

    if (!response?.ok) throw new Error(response?.error || 'Unknown error');

    if (!response.items.length) {
      setStatus(t('noItems'));
      return;
    }

    const tsv = toTSV(response.items);
    await navigator.clipboard.writeText(tsv);
    setStatus(`${t('copied')} (${response.items.length})`, 'ok');
  } catch (err) {
    setStatus(`${t('error')}${err.message}`, 'error');
  } finally {
    if (currentAgent) btnCopy.disabled = false;
  }
});

// ── Save / Load Range ─────────────────────────────────────────────────────────

btnSave.addEventListener('click', () => {
  const from = fromInput.value.trim();
  const to   = toInput.value.trim();
  chrome.storage.local.set({ [getStorageKey()]: { from, to } });
  updateSavedRangeDisplay(from, to);
});

btnLoad.addEventListener('click', () => {
  chrome.storage.local.get(getStorageKey(), (data) => {
    const saved = data[getStorageKey()];
    if (saved) {
      fromInput.value = saved.from || '';
      toInput.value   = saved.to   || '';
    }
  });
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  const { haul_lang } = await chrome.storage.local.get('haul_lang');
  if (haul_lang && TRANSLATIONS[haul_lang]) {
    currentLang = haul_lang;
    document.getElementById('langDe').classList.toggle('active', currentLang === 'de');
    document.getElementById('langEn').classList.toggle('active', currentLang === 'en');
  }

  await detectSite();
  applyTranslations();

  if (currentAgent) {
    btnCopy.disabled = false;
    const stored = await chrome.storage.local.get(getStorageKey());
    const range  = stored[getStorageKey()];
    if (range) updateSavedRangeDisplay(range.from, range.to);
  }
}

init();
