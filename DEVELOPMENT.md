# Reflow · Haul Exporter — Development Reference

This document captures every technical decision, finding, failure, and lesson learned during development. The goal: a future Claude session (or human developer) can pick this up and add a new agent in one shot without re-investigating solved problems.

---

## Architecture Overview

```
popup.html / popup.js         ← UI + orchestration
    │
    ├── chrome.tabs.sendMessage(tabId, { action: 'fetchOrders', from, to })
    │
    ├── content-gtbuy.js       ← injected on gtbuy.com
    ├── content-acbuy.js       ← injected on acbuy.com
    └── content-cnfans.js      ← injected on cnfans.com
```

**Why one content script per domain?**  
Each agent has a completely different DOM structure, authentication mechanism, and pagination system. A unified script would be a mess of conditionals. Separate files keep each agent self-contained and independently testable.

**Why MV3 (Manifest V3)?**  
Chrome is deprecating MV2. MV3 uses `chrome.scripting.executeScript` instead of `background.js` persistent background pages. All async communication goes through `chrome.tabs.sendMessage` → `chrome.runtime.onMessage`.

**Data flow:**  
Content script returns `{ ok: true, items: [...] }` → popup filters (Points-Mall) → `toTSV()` → clipboard → Google Sheets paste.

**Storage:**  
`chrome.storage.local` per agent key: `agent_last_haul_gtbuy`, `agent_last_haul_acbuy`, `agent_last_haul_cnfans`. Avoids cross-agent collisions.

---

## Item Data Model

Every content script must return items with this shape:

```js
{
  orderNo:   string,   // e.g. "IGT2604090790001698"
  date:      string,   // e.g. "2026-04-09" (or orderDate for GTBuy)
  name:      string,   // product name, max 100 chars
  quantity:  number,   // units
  price:     string,   // e.g. "$12.50" or "Points: 13" (or unitPrice for GTBuy)
  status:    string,   // e.g. "In Transit"
  link:      string,   // product URL or "" if unavailable
}
```

`popup.js → toTSV()` maps: `i.unitPrice || i.price`, `i.quantity || i.qty`, `i.date || i.orderDate`.  
**Don't rename these fields** — the dual-key fallback is intentional to keep GTBuy's API field names natural.

---

## Per-Agent Technical Reference

---

### GTBuy (gtbuy.com)

**Approach: Direct REST API** ✅ Clean, fast, no DOM dependency.

**Endpoint:**
```
GET https://test-api.gtbuy.com/order/listV2
Params: orderNo='', pageNo=N, pageSize=20, status='', hideCancelOrder=false
```

**Auth header (critical):**
```
X-Access-Token: <JWT from localStorage.USER_TOKEN>
```
Also send: `gtbuy-Client-Type: WEB`, `lang: en_US`, `currency: USD`, `browser_device_id`.

**Wrong headers investigated and rejected:**
- `Authorization: Bearer <token>` → 401
- `x-token: <token>` → 401  
- `userToken: <token>` → 401  
- Cookie-only (no header) → 401  
The correct header was found by intercepting live XHR in DevTools Network tab.

**Response structure:**
```js
json.result = {
  records: [
    {
      orderNo: "IGT2604090790001698",
      orderTime: "2026-04-09 14:22:10",
      statusName: "In Transit",
      itemList: [
        {
          subject: "Product name",
          quantity: 2,
          price: "$12.50",
          orderStatusName: "In Transit",
          // Link fields — try all of these, one will have the URL:
          // goodsUrl, itemUrl, productUrl, link, goodsId, itemId, spuId
        }
      ]
    }
  ],
  pages: 4   // total page count
}
```

**Product links:** The API likely returns a `goodsId` or similar field. Current code tries:  
`item.goodsUrl || item.itemUrl || item.productUrl || item.link || (goodsId ? 'https://gtbuy.com/productDetail?id=${goodsId}' : '')`  
If links come out empty: open DevTools → Network → filter `listV2` → inspect one record's itemList item to find the actual field name.

**Pagination:** API has `result.pages` (total pages). Loop `pageNo` from 1 to `pages`. Simple and reliable.

**Range filter logic:** Order numbers like `IGT2604...` are lexicographically sortable. String comparison `orderNo > fromOrderNr` correctly identifies "too new". `orderNo < toOrderNr` means "too old → stop". Return early on too-old to avoid loading unnecessary pages.

---

### ACBuy (acbuy.com)

**Approach: DOM scraping** ⚠️ API was investigated but blocked by encryption.

**Why not API:**  
The API endpoint `/prefix-api/store-order/api/userOrderList` uses AES-CBC encryption for both request body and response. The AES key `ed3645d9771c548eafd592b3a284f475` was found in the JS bundle but decryption of captured responses consistently failed with "Malformed UTF-8 data". Multiple modes tried: CBC with IV, ECB, passphrase-based. Conclusion: key derivation or IV handling is non-trivial. DOM scraping was the pragmatic choice.

**DOM structure (as of April 2026):**
```
.order-item
  .order           → "Order No.: AO03038006045"
  .create-time     → "Creation Time: 2026-03-15 10:22"
  .product-item (one per product line)
    .el-row.item-row
      .el-col[0]   → item number + name + specs (Color, Size, etc.)
      .el-col[1]   → unit price ("$12.50" or "Points: 13")
      .el-col[2]   → quantity ("x 2")
      .el-col[3]   → status (first line)
```

**Name extraction:** `col0.innerText` is multiline. Skip: first line (item number like `AO03038...`), lines starting with `Color`, `Size`, `Tag`, `Remarks`, lines matching `/^[A-Z]{2}\d{8,}/`. Take the first remaining line with length > 4.

**Points-Mall detection:** `col1.innerText` starts with `"Points"` or is `"$0"` / `"0"`. Filtered in popup.js (not content script) so the user can toggle it without re-fetching.

**Product link:** `cols[0].querySelector('a[href]')?.href`

**Pagination:** Uses Element Plus (iView/View-Design) pagination.
- Total count: match `Total (\d+)` from `document.body.innerText`, divide by page size
- Current page: `.el-pager .number.is-active` or `.el-pager li.active`
- Navigate: find `<li>` in `.el-pager` matching target page number text, click it. If not visible (ellipsis), use `.btn-next` button
- Wait: poll `getCurrentPage()` every 150ms, up to 40 tries, then +300ms settle

**DO:** Always navigate to page 1 before starting (user may be mid-pagination).  
**DON'T:** Use `.el-pagination__total` directly — its format varies. Parse body text instead.

---

### CNFans (cnfans.com)

**Approach: DOM scraping** ⚠️ API investigated but requires internal WordPress nonce.

**Why not API:**  
CNFans runs on WordPress with WooCommerce. The REST endpoint `GET https://cnfans.com/wp-json/openapi/v1/order/list` returns `{"code":"rest_no_route","message":"No route was found matching the URL and request method."}` for any external call. Even with valid JWT (`localStorage.token`) and cookies attached, the route is not registered for external access. WordPress REST API routes can be private — this one requires an internal `_wpnonce` that is only available server-side.

**DOM structure (as of April 2026):**
```
.order-item
  .order-no       → "Order No. CNF1845247177084942"
  .order-date     → "Creation Time 2026-01-15 10:22:31"
  .order-handler  → action buttons (status inference)
  .product-detail (one per product)
                  → multiline innerText:
                     Line 1: product name
                     "Color: Black/White"
                     "Size: XL"  
                     "$12.50"
                     "x2"
                     "Contact Seller" (sometimes)
```

**Name extraction:** Split `prod.innerText` by `\n`, find first line not starting with `Color`, `Size`, `$`, `x\d`, `Contact`, and length > 3.

**Status inference:** CNFans doesn't always show a status label directly. Instead, look at action buttons (`.order-handler`). Buttons like "Track Package" → In Transit, "Confirm Receipt" → Arrived, etc. Exclude "Details", "Pay", "Delete", "Cancel" from status candidates.

**Product link:** `prod.querySelector('a[href]')?.href` — falls back to `.product-wrap, .product-box, .product-info, .order-product` ancestors.

**Pagination:** Uses Naive UI (`n-pagination`):
- Current page: `.n-pagination-item--active` or `.n-pagination-item.is-active`
- Next button: `Array.from(querySelectorAll('.n-pagination-item--button'))[1]` (index 0 = prev, index 1 = next)
- Disabled check: `.n-pagination-item--disabled` class or `aria-disabled="true"`
- Wait: poll current page number every 150ms, up to 30 tries, then +400ms settle

**Tech stack:** Vue 3 + Vite + Naive UI. DOM is reactive; always wait for re-render after page click.

**DO:** Handle single-page case (user may have fewer than one page of orders — pagination buttons may not exist). The `isNextDisabled()` check handles this gracefully.  
**DON'T:** Try to intercept fetch/XHR — CNFans may use cached responses or service workers, making network interception unreliable.

---

## Adding a New Agent — Step-by-Step

1. **Investigate the API** (30 min max):
   - Open DevTools → Network → XHR/Fetch tab
   - Reload the orders page, look for the order list request
   - Check: is the response readable JSON? If yes, use API approach (see GTBuy pattern)
   - If encrypted or 401 regardless of headers: use DOM approach (see ACBuy/CNFans pattern)

2. **Create `content-{agent}.js`:**
   - If API: replicate GTBuy structure — `getHeaders()`, `fetchPage(n)`, `fetchAllOrders(from, to)`
   - If DOM: replicate ACBuy/CNFans structure — `scrapeCurrentPage()`, pagination helpers, `fetchAllOrders(from, to)`
   - Always return items matching the [data model](#item-data-model)
   - Always implement the `ping` action in the message listener (for future health checks)

3. **Update `manifest.json`:**
   - Add domain to `host_permissions`
   - Add entry in `content_scripts`

4. **Update `popup.js` → `detectSite()`:**
   - Add `else if (url.includes('domain.com'))` block
   - Set `currentAgent`, badge class, badge text, site label, `filterPointsRow` display, `fromInput.placeholder`
   - Call `siteIndicator.classList.add('active')`

5. **Update `popup.html`:**
   - Add `.badge-{agent}` CSS class with appropriate brand color

6. **Test checklist:**
   - [ ] Extension reloaded in `chrome://extensions/`
   - [ ] Agent tab open and logged in
   - [ ] Badge shows correct agent name
   - [ ] Green dot appears in site indicator
   - [ ] Export with empty range → all orders
   - [ ] Export with From/To range → correct subset
   - [ ] Save range → reload popup → saved value shows
   - [ ] Load range → To field populated
   - [ ] Link column contains valid URLs (or empty if not available)

---

## Known Issues & Limitations

| Issue | Agent | Status | Notes |
|-------|-------|--------|-------|
| Product links may be empty | GTBuy | Open | API field name unknown — check DevTools Network response |
| ACBuy pagination ellipsis | ACBuy | Partial | If many pages, page buttons show `...` — handled via next-button fallback |
| CNFans status inference | CNFans | Partial | Inferred from buttons, not a direct status label — may miss edge cases |
| AES decryption of ACBuy API | ACBuy | Won't fix | Key `ed3645d9771c548eafd592b3a284f475` found but CBC/ECB both failed |
| CNFans REST API nonce | CNFans | Won't fix | Requires server-side WordPress nonce, not accessible to content scripts |
| `content.js` (old file) | All | Harmless | Old unified script, superseded by per-agent scripts. Cannot delete from sandbox. Ignored by manifest. |

---

## Color / Brand Reference (Reflow)

```
Background:      #0d1117
Card background: #0f172a
Border:          #1e293b
Primary:         #6366f1  (indigo)
Primary hover:   #4f46e5
Text primary:    #f8fafc
Text secondary:  #64748b
Text muted:      #334155

Status colors:
  GTBuy badge:   bg #312e81  text #a5b4fc  border #4338ca
  ACBuy badge:   bg #14532d  text #86efac  border #16a34a
  CNFans badge:  bg #7f1d1d  text #fca5a5  border #dc2626

Status messages:
  ok:    text #86efac  border #14532d  bg #052e16
  error: text #fca5a5  border #7f1d1d  bg #150505
  busy:  text #fbbf24  border #78350f
```

---

## Version History

| Version | Changes |
|---------|---------|
| 1.0 | GTBuy only, direct API, basic TSV export |
| 2.0 | Added ACBuy (DOM scraping), Points-Mall filter, haul range memory |
| 3.0 | Added CNFans (DOM scraping), per-agent storage keys, multi-badge UI |
| 3.1 | Reflow branding, product link column, updated badge design |
