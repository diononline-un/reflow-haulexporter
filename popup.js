// Agent Order Exporter – Popup Script

const statusEl       = document.getElementById('status');
const fromInput      = document.getElementById('from');
const toInput        = document.getElementById('to');
const btnCopy        = document.getElementById('btnCopy');
const btnSave        = document.getElementById('btnSaveRange');
const btnLoad        = document.getElementById('btnLoadRange');
const savedRangeEl    = document.getElementById('savedRange');
const savedRangeValue = savedRangeEl.querySelector('strong');
const siteBadge       = document.getElementById('siteBadge');
const siteLabel       = document.getElementById('siteLabel');
const siteIndicator   = document.getElementById('siteIndicator');
const filterPointsRow = document.getElementById('filterPointsRow');
const filterPointsCb  = document.getElementById('filterPoints');

const STORAGE_KEY    = 'agent_last_haul';  // { gtbuy: 'IGT...', acbuy: 'AO...' }

// ── Site Detection ───────────────────────────────────────────────────────────

let currentAgent = null; // 'gtbuy' | 'acbuy' | null
let currentTabId = null;

async function detectSite() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab  = tabs[0];
  if (!tab) return;

  currentTabId = tab.id;
  const url = tab.url || '';

  if (url.includes('gtbuy.com')) {
    currentAgent = 'gtbuy';
    siteBadge.className = 'badge badge-gtbuy';
    siteBadge.textContent = 'GTBuy';
    siteLabel.textContent = 'GTBuy';
    siteIndicator.classList.add('active');
    filterPointsRow.style.display = 'none';
    fromInput.placeholder = 'IGT2604090790001698';
  } else if (url.includes('acbuy.com')) {
    currentAgent = 'acbuy';
    siteBadge.className = 'badge badge-acbuy';
    siteBadge.textContent = 'ACBuy';
    siteLabel.textContent = 'ACBuy';
    siteIndicator.classList.add('active');
    filterPointsRow.style.display = 'flex';
    fromInput.placeholder = 'AO03038006045';
  } else if (url.includes('cnfans.com')) {
    currentAgent = 'cnfans';
    siteBadge.className = 'badge badge-cnfans';
    siteBadge.textContent = 'CNFans';
    siteLabel.textContent = 'CNFans';
    siteIndicator.classList.add('active');
    filterPointsRow.style.display = 'none';
    fromInput.placeholder = 'CNF1845247177084942';
  } else {
    currentAgent = null;
    siteLabel.textContent = 'gtbuy.com, acbuy.com oder cnfans.com öffnen';
    btnCopy.disabled = true;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(msg, type = '') {
  statusEl.textContent = msg;
  statusEl.className   = type;
}

function toTSV(items) {
  const header = ['Order Nr', 'Datum', 'Artikelname', 'Quantity', 'Unit Price', 'Status', 'Link'];
  const rows   = items.map(i => [
    i.orderNo  || '',
    i.date     || i.orderDate || '',
    i.name,
    i.quantity || i.qty,
    i.unitPrice || i.price,
    i.status,
    i.link     || ''
  ]);
  return [header, ...rows].map(r => r.join('\t')).join('\n');
}

function getStorageKey() {
  return `${STORAGE_KEY}_${currentAgent}`;
}

// ── Export ───────────────────────────────────────────────────────────────────

btnCopy.addEventListener('click', async () => {
  if (!currentAgent) return;

  const from         = fromInput.value.trim();
  const to           = toInput.value.trim();
  const filterPoints = currentAgent === 'acbuy' && filterPointsCb.checked;

 