// Agent Order Exporter – CNFans Content Script
// Strategy: DOM scraping (WP REST API requires internal nonce not accessible externally)
// CNFans uses Naive UI pagination (.n-pagination-item) + Vue 3 + Vite

// ── DOM Scraper ──────────────────────────────────────────────────────────────

function scrapeCurrentPage() {
  const items = [];

  document.querySelectorAll('.order-item').forEach(card => {
    // Order metadata
    const orderNo = (card.querySelector('.order-no')?.innerText || '')
      .replace(/Order No[.:]?/i, '').trim();
    const date    = (card.querySelector('.order-date')?.innerText || '')
      .replace(/Creat\w+ Time[:]?/i, '').trim().substring(0, 19);

    // Status: infer from available action buttons
    const handlers  = Array.from(card.querySelectorAll('.order-handler'))
      .map(h => h.innerText.trim())
      .filter(h => h && !h.match(/^\(/) && h !== 'Delete' && h !== 'Cancel');
    const status = handlers.find(h => !h.includes('Details') && !h.includes('Pay'))
      || (handlers.some(h => h.includes('Pay'))    ? 'Pending Payment' :
          handlers.some(h => h.includes('Details')) ? 'Processing' : 'Unknown');

    // Each product in the order
    card.querySelectorAll('.product-detail').forEach(prod => {
      const lines = prod.innerText.trim().split('\n')
        .map(l => l.trim()).filter(Boolean);

      // Name: first line that's not a spec/price/qty/action
      const name = lines.find(l =>
        !l.startsWith('Color') &&
        !l.startsWith('Size') &&
        !l.startsWith('$') &&
        !l.match(/^x\d/) &&
        !l.match(/^Contact/i) &&
        l.length > 3
      ) || '';

      // Price: line starting with "$"
      const priceLine = lines.find(l => l.startsWith('$') || l.startsWith('$ '));
      const price     = priceLine ? priceLine.replace(/\s/g, '') : '';

      // Qty: line matching "x<number>"
      const qtyLine = lines.find(l => l.match(/^x\d/));
      const qty     = parseInt(qtyLine?.replace(/^x/, '') || '1') || 1;

      // Product link: look for <a> within the product block or its nearest wrapper
      const linkEl = prod.querySelector('a[href]')
        || prod.closest('.product-wrap, .product-box, .product-info, .order-product')?.querySelector('a[href]');
      const link   = linkEl ? (linkEl.href || '') : '';

      if (name && orderNo) {
        items.push({ orderNo, date, name: name.substring(0, 100), price, qty, status, link });
      }
    });
  });

  return items;
}

// ── Pagination ────────────────────────────────────────────────────────────────

function getCurrentPage() {
  const active = document.querySelector('.n-pagination-item--active, .n-pagination-item.is-active');
  return parseInt(active?.innerText?.trim()) || 1;
}

function getNextButton() {
  const btns = Array.from(document.querySelectorAll('.n-pagination-item--button'));
  return btns[1] || null; // [0]=prev, [1]=next
}

function isNextDisabled() {
  const btn = getNextButton();
  return !btn || btn.classList.contains('n-pagination-item--disabled') ||
         btn.getAttribute('aria-disabled') === 'true';
}

function clickNext() {
  return new Promise((resolve, reject) => {
    const btn = getNextButton();
    if (!btn || isNextDisabled()) { reject(new Error('No next page')); return; }

    const prevPage = getCurrentPage();
    btn.click();

    let tries = 0;
    const poll = setInterval(() => {
      tries++;
      const newPage = getCurrentPage();
      if (newPage !== prevPage || tries > 30) {
        clearInterval(poll);
        setTimeout(resolve, 400); // settle time
      }
    }, 150);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function fetchAllOrders(fromOrderNr, toOrderNr) {
  const allItems = [];

  // CNFans may load all orders on 1 page – handle both cases
  let page = 1;
  const MAX_PAGES = 50; // safety limit

  // Navigate back to page 1 if needed
  const startPage = getCurrentPage();
  if (startPage > 1) {
    // Click prev until page 1
    const prevBtn = document.querySelector('.n-pagination-item--button');
    for (let i = 0; i < startPage - 1; i++) {
      prevBtn?.click();
      await new Promise(r => setTimeout(r, 500));
    }
  }

  while (page <= MAX_PAGES) {
    const pageItems = scrapeCurrentPage();
    let stopEarly   = false;

    for (const item of pageItems) {
      // Range filter (CNF numbers are roughly chronological descending)
      if (fromOrderNr && item.orderNo > fromOrderNr) continue;
      if (toOrderNr   && item.orderNo < toOrderNr)   { stopEarly = true; break; }
      allItems.push(item);
    }

    if (stopEarly) break;

    // Try to go to next page
    if (isNextDisabled()) break;
    try {
      await clickNext();
      page++;
    } catch (_) {
      break;
    }
  }

  return allItems;
}

// ── Message Listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'fetchOrders') {
    fetchAllOrders(msg.from || '', msg.to || '')
      .then(items => sendResponse({ ok: true, items, agent: 'cnfans' }))
      .catch(err  => sendResponse({ ok: false, error: err.message }));
    return true;
  }
  if (msg.action === 'ping') {
    sendResponse({ ok: true, agent: 'cnfans' });
    return true;
  }
});
