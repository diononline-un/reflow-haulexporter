---
status: in-development
progress: 85
version: "3.1.0"
tags: [chrome-extension, scraping, tsv-export, reflow]
scope: "Chrome Extension, die Bestellungen von GTBuy, ACBuy und CNFans als TSV exportiert, direkt einfügbar in Google Sheets."
last_updated: "2026-08-13"
next_steps:
  - Manifest-Fehler INSTALL.md referenziert veralteten Ordnernamen gtbuy-exporter, auf reflow-haulexporter angleichen
  - Scraper der drei Agent-Sites auf aktuelle DOM-/API-Änderungen prüfen
  - Weitere Agent-Sites nach DEVELOPMENT.md-Playbook ergänzen
  - Export-Testlauf in Chrome gegen alle drei Agents wiederholen
---

# Aktueller Stand
- GTBuy-Export läuft über direkte API, ACBuy und CNFans per DOM-Scraping inkl. Auto-Pagination
- Haul-Range-Filter (Von/Bis Order-Nr) mit gespeichertem Haul-Marker funktioniert
- ACBuy Points-Mall-Filter standardmäßig aktiv
- Keine TODO/FIXME im Code, letzter Commit v3.1.0; Wartung abhängig von Änderungen der Agent-Webseiten
- INSTALL.md teilweise veraltet (alter Ordnername gtbuy-exporter), README aktuell
