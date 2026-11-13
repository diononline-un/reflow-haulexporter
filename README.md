> **Umgezogen.** Dieses Projekt lebt weiter im Sammelrepo [reseller-toolbelt](https://github.com/diononline-un/reseller-toolbelt) unter dem Ordner `haul-exporter`. Dieses Repo ist archiviert und bekommt keine Updates mehr.

# Reflow · Haul Exporter

Chrome extension that exports order data from agent shopping sites (GTBuy, ACBuy, CNFans) as TSV directly into Google Sheets. Built as a companion tool to the **Reflow** haul-tracking app.

---

## Supported Agents

| Agent  | Order Page URL                   | Method       | Notes                          |
|--------|----------------------------------|--------------|--------------------------------|
| GTBuy  | gtbuy.com/user/order             | Direct API   | Fast, no DOM dependency        |
| ACBuy  | acbuy.com/member/order           | DOM scraping | API is AES-encrypted           |
| CNFans | cnfans.com/my-account/orders     | DOM scraping | WordPress nonce blocks REST API|

The extension auto-detects which agent is active based on the current tab URL and adapts the UI accordingly.

---

## Installation (30 seconds)

1. Open Chrome → paste `chrome://extensions/` into the address bar
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `reflow-haulexporter` folder
5. The RF icon appears in the Chrome toolbar

To update after code changes: click the ↺ reload button on the extension card in `chrome://extensions/`.

---

## Usage

1. Log into the agent site and navigate to the orders page
2. Click the RF extension icon — agent is auto-detected (green dot = active)
3. Optionally set a **Range** (From / To order number) to limit the export
4. Click **In Zwischenablage kopieren** (copy to clipboard)
5. Open Google Sheets → click cell A1 → **Ctrl+V**

### Exported columns

| Column    | Description                        |
|-----------|------------------------------------|
| Order Nr  | Order number                       |
| Datum     | Order date                         |
| Artikelname | Product name                     |
| Quantity  | Units ordered                      |
| Unit Price| Price per unit (e.g. `$12.50`)    |
| Status    | Order status                       |
| Link      | Direct product URL (where available)|

---

## Haul Range Filter

The range filter lets you export only new orders since the last haul, avoiding duplicates in your sheet.

**Workflow:**
1. After exporting: click **"Von"-Nr als letzten Haul merken** → saves the newest order number per agent
2. Next haul: click **Gespeicherte Range laden** → the "Bis" (To) field is pre-filled
3. Export → only orders *newer* than the saved marker are included

**How order number sorting works:**  
All three agents use order numbers that are lexicographically sortable in chronological order (e.g. `IGT2604...` > `IGT2603...`). The range filter does a simple string comparison, no date parsing needed.

---

## ACBuy: Points-Mall Orders

ACBuy mixes regular USD orders with free Points-Mall reward orders. The checkbox **"Points-Mall Orders ausschließen"** (default: on) filters these out.

- **On** → only real USD purchases exported
- **Off** → all orders including free rewards

Points-Mall orders are identified by a price that starts with `Points`, `$0`, or `0`.

---

## File Structure

```
reflow-haulexporter/
├── manifest.json          # Extension config (MV3)
├── popup.html             # Extension popup UI (Reflow branded)
├── popup.js               # Popup logic: site detection, export, range memory
├── content-gtbuy.js       # GTBuy: direct API fetcher
├── content-acbuy.js       # ACBuy: DOM scraper + auto-pagination
├── content-cnfans.js      # CNFans: DOM scraper + Naive UI pagination
├── icon.png               # 128px icon (indigo, matches Reflow brand)
├── README.md              # This file
└── DEVELOPMENT.md         # Technical decisions, findings, dos/don'ts
```

---

## Adding More Agents

See [`DEVELOPMENT.md`](./DEVELOPMENT.md) for the full technical playbook — API investigation steps, DOM scraping patterns, and architecture decisions documented with rationale, so new agents can be added without starting from scratch.

Quick checklist for a new agent:
1. Create `content-{agent}.js` following the existing template
2. Add domain to `manifest.json` → `host_permissions` and `content_scripts`
3. Add detection block in `popup.js` → `detectSite()`
4. Add CSS badge class in `popup.html`
5. Test: reload extension, open agent tab, export
