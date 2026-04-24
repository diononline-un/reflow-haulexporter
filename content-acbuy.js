// Agent Order Exporter – ACBuy Content Script
// Strategy: DOM scraping + auto-pagination (API uses AES encryption, DOM is reliable)

// ── DOM Scraper ─────────────────────────────────────────────────────────────

function scrapeCurrentPage() {
  const items = [];

  document.querySelectorAll('.order-item').forEach(card => {
    // Order metadata
    const orderNoEl = Array.from(card.querySelectorAll('.order'))
      .find(el => el.textContent.includes('Order No.'));
    const orderNo = (orderNoEl?.textContent || '')
      .replace('Order No.:', '').replace('Order No.', '').trim();

    const dateEl = card.querySelector('.create-time');
    const date   = (dateEl?.textContent || '')
      .replace('Creation Time:', '').trim().substring(0, 20);

    // Each product row
    card.querySelectorAll('.product-item').forEach(prod => {
      const cols = prod.querySelectorAll('.el-row.item-row > .el-col');
      if (cols.length < 4) return;

      // col 0: [itemNo, name, specs, ...]
      const col0Lines = (cols[0]?.innerText || '').trim().split('\n')
        .map(l => l.trim()).filter(Boolean);

      // Skip the item-No line (starts with AI/AO + digits), take next non-spec line
      const name = col0Lines.find((l, i) => i > 0 &&
        !l.match(/^[A-Z]{2}\d{8,}/) &&
        !l.startsWith('Color') && !l.startsWith('Size') &&
        !l.startsWith('Tag') && !l.startsWith('Remarks') &&
        l.length > 4
      ) || col0Lines[1] || '';

      // col 1: Unit Price ("$12.50" or "Points: 13")
      const priceRaw = (cols[1]?.innerText || '').trim();
      const priceNum = priceRaw.match(/\$([\d.]+)/)?.[1]
        || priceRaw.match(/[\d.]+/)?.[0]
        || priceRaw;
      const priceLabel = priceRaw.startsWith('Points') ? priceRaw : `$${priceNum}`;

      // col 2: Qty ("x 3" → 3)
      const qtyRaw = (cols[2]?.innerText || '').trim();
      const qty    = parseInt(qtyRaw.replace('x', '').trim()) || 1;

      // col 3: Status
      const status = (cols[3]?.innerText || '').trim().split('\n')[0].trim();

      // Product link: usually on the item thumbnail or name <a> tag in col 0
      const linkEl = cols[0]?.querySelector('a[href]');
      const link   = linkEl ? (linkEl.href || '') : '';

      if (name) {
        items.push({ orderNo, date, name: name.substring(0, 100), price: priceLabel, qty, status, link });
      }
    });
  });

  return items;
}

// ── Pagination ───────────────────────────────────────────────────────────────

function getTotalPages() {
  // "Total 160  10/page" → 16 pages
  const totalText = document.body.innerText.match(/Total\s+(\d+)/);
  const perPage   = document.querySelector('[class*="page-size"] .el-select__selected-item, .el-pagination__sizes .el-select__label')
    ?.textContent?.match(/\d+/)?.[0] || '10';
  if (!totalText) return 1;
  return Math.ceil(parseInt(totalText[1]) / parseInt(perPage));
}

function getCurrentPage() {
  const active = document.querySelector('.el-pager .number.is-active, .el-pager li.active');
  return parseInt(active?.textContent?.trim()) || 1;
}

function clickPage(pageNum) {
  return new Promise((resolve, reject) => {
    // Find the pagination button for this page number
    const btns = Array.from(document.querySelectorAll('.el-pager li, .el-pager .number'));
    const btn  = btns.find(b => b.textContent.trim() === String(pageNum));

    if (!btn) {
      // Try "next" button if target is next page
      const next = document.querySelector('.el-pagination .btn-next, [aria-label="Go to next page"]');
      if (next && !next.disabled) { next.click(); }
      else { reject(new Error(`Page ${pageNum} button not found`)); return; }
    } else {
      btn.click();
    }

    // Wait for DOM to update (orders re-render)
    let tries = 0;
    const poll = setInterval(() => {
      tries++;
      if (getCurrentPage() === pageNum || tries > 40) {
        clearInterval(poll);
        setTimeout(resolve, 300); // extra settle time
      }
    }, 150);
  });
}

// ── Main Export Function ─────────────────────────────────────────────────────

async function fetchAllOrders(fromOrderNr, toOrderNr) {
  const allItems  = [];
  const totalPages = getTotalPages();
  const startPage  = 1;

  // Navigate to page 1 first
  const cur = getCurrentPage();
  if (cur !== 1) await clickPage(1);

  for (let page = 1; page <= totalPages; page++) {
    if (page > 1) await clickPage(page);

    const pageItems = scrapeCurrentPage();
    let done = false;

    for (const item of pageItems) {
      const orderNo = item.orderNo;

      // Range filter: ACBuy order nos are like AO03038006045 (roughly chronological desc)
      if (fromOrderNr && orderNo > fromOrderNr) continue;  // too new
      if (toOrderNr   && orderNo < toOrderNr)  { done = true; break; } // too old

      allItems.push(item);
    }

    if (done) break;
  }

  return allItems;
}

// ── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'fetchOrders') {
    fetchAllOrders(msg.from || '', msg.to || '')
      .then(items => sendResponse({ ok: true, items, agent: 'acbuy' }))