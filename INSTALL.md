# Agent Order Exporter v3.0 – Installation

## Chrome installieren (30 Sekunden)

1. Chrome öffnen → `chrome://extensions/` in die Adressleiste
2. Oben rechts **"Entwicklermodus"** einschalten
3. **"Entpackte Erweiterung laden"** klicken
4. Den `gtbuy-exporter`-Ordner auswählen → OK

Fertig. Das Extension-Icon erscheint in der Toolbar.

---

## Unterstützte Agents

| Agent  | URL                             | Methode        |
|--------|---------------------------------|----------------|
| GTBuy  | gtbuy.com/user/order            | Direkte API    |
| ACBuy  | acbuy.com/member/order          | DOM-Scraping   |
| CNFans | cnfans.com/my-account/orders    | DOM-Scraping   |

Die Extension erkennt automatisch welcher Agent aktiv ist und passt sich an.

---

## Benutzung

1. Den jeweiligen Order-Tab öffnen (eingeloggt)
2. Extension-Icon klicken → Agent wird automatisch erkannt
3. Optional: **Von / Bis Order-Nr** für Haul-Filter setzen
4. **"In Zwischenablage"** klicken
5. Google Sheets → Zelle A1 → **Strg+V**

---

## ACBuy: Points-Mall Orders

ACBuy vermischt reguläre Bestellungen mit kostenlosen Points-Mall Orders (Prämien).
Die Extension hat eine **"Points-Mall Orders ausschließen"**-Option (Standard: an).

- **An** → Nur echte USD-Bestellungen werden exportiert
- **Aus** → Alle Bestellungen inkl. Prämien

---

## Haul-Workflow (neuen Haul vom alten trennen)

1. Nach dem ersten Export: **"Letzten Haul me