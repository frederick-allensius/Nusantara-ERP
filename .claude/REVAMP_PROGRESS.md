# Revamp progress log

Work branch: `revamp/ui-and-accounting` — one checkpoint commit per finished step.
Update this file at every checkpoint so work can resume from it.

Decisions and findings live in `docs/` (Indonesian): 02 navigation map · 03 transaction
flows · 04 accounting rules · 05 status & correction model · 08 technical findings (T-xx)
· 09 UX findings (U-xx) & visual direction · MEETING_KIT.

## Working rules

- UI copy and Markdown in Indonesian; English only where the term is more familiar
  (Sales Order, PPN, e-Faktur, Job Costing, Recycle Bin).
- Preserve functionality, improve clarity: no feature removal. Entries hidden from the
  menu are listed in docs/02 §2 and stay reachable in code (menu-router ROUTES).
- No invented business requirements or business-specific terminology. Anything that
  cannot be determined from code/docs is marked **REQUIRES USER CONFIRMATION**.
- Documentation and UI describe the product only — no narrative about how the project
  came about.
- Accounting integrity over UI simplicity; no fake KPIs or meaningless charts.
- `tests/classic-bundle-smoke.test.ts` must stay green: every `#view-*` in app.html
  renders; every `NSAMenu.routes` label handles (> 40 routes).
- Markdown notes outside the repo (`D:\1. Work\ERP-Lisa-Kenneth\*.md`) stay untouched.

## Verify

```bash
npx vitest run && npx tsc --noEmit && npx eslint . && npx vite build
```

Dev server: `.claude/launch.json` → `dev-local-quiet` (port 8088, `/app.html`). Signing in
needs credentials — the assistant does not type passwords; ask the user to sign in in the
Browser pane, otherwise rely on the tests.

## Done

### Documentation & meeting kit
- `docs/01–10`, `MEETING_KIT.md`, `README.md`, `ARSITEKTUR.md`, `API.md`, `DEPLOYMENT.md`;
  root README / QUICK_START / PROJECT_STRUCTURE rewritten; obsolete plan/spec docs removed.

### Accounting & stock integrity (Phase A)
- `core/gl.js` posting rules (docs/04): revenue/AR/PPN once per order↔invoice chain,
  PO receipt vs PI, DP logs not double-posted, Kas & Bank journals (other payment,
  deposit, bank transfer), tax-inclusive totals, rounding; manual JVs mirrored in
  `journalVouchers`.
- `core/balances.js` (new): one outstanding figure per chain, aging, due dates, status.
- Status transitions + Cancelled (`src/classic/core/doc-registry.js`); cancel/reversal
  flows for orders, invoices, settlements, returns, receipts, adjustments.
- Stock moves only through Warehouse (`src/core/stock.js` helpers), decimal quantities,
  delete guards, string ids.
- Rewritten views: invoice-view, return-view, quotation-view; fixes in erp-crud,
  sales-purchase-extras, bank-extras, budget-gl-extras, financial-reports, report-extras
  (Rekap PPN), notifications, doc-migrate, integrity (period lock), rbac collections,
  db collections, firestore.rules, functions/backup.js.
- Tests: `tests/accounting-integrity.test.ts`; typings in rbac/twofa tests.
- Fixed: T-01…T-05, T-07…T-17, T-23, T-25…T-28, T-31, T-39, T-41, T-42, T-43, most of
  T-32/T-38; T-29 partly.

### Navigation, shell & design system (Phase B, part 1)
- `ui/nav.js` rewritten: `MENU_CONFIG` = Ringkasan · Penjualan · Pembelian · Persediaan ·
  Kas & Bank · Akuntansi · Aset Tetap · Laporan · Data Master · Pengaturan (docs/02 §4).
  Accordion groups, collapsed icon mode (`nsa_nav_collapsed`) with popover, drawer on
  ≤768px, page context in the topbar + `document.title`, entry resolution that keeps the
  clicked entry highlighted (T-18). API: `window.NSANav.open(label)`,
  `.markActive(label)`, `.toggleCollapsed()`.
- `core/menu-router.js`: Indonesian labels, route args, openers in lazy chunks are
  invoked after `ensureView` (`LAZY_GLOBALS`).
- `core/rbac.js`: new `GROUP_MODULE` keys; `applyNavGating` gates each entry by its
  `data-module`.
- Openers: `_ledgerExtras.openTab(tab, filter)` (+ journal source filter),
  `_warehouseExtras.openTab(tab)`, `_masterExtras.openCustomers/openSuppliers`
  (`modules/master.js` lists one of them via `window._masterSection`). In-page tabs sync
  the menu (invoices, returns, quotations, financial reports, ledger, warehouse).
- Page tab bar (`ui/view-tabs.js`) removed. `ui/doc-tabs.js`: module header above the
  tabs, strip hidden while no document is open, max 5 tabs, styles moved to style.css.
- `app.html`: new shell (sidebar head/nav/foot, page context, search, Indonesian login),
  Inter + JetBrains Mono, unused view containers removed.
- Theme: `public/theme-init.js` follows the OS theme without a saved choice; nav.js follows
  OS changes and emits `nsa:themechange` (dashboard charts re-init).
- `src/core/auth.js`: no prefilled username (T-33). Notifications link to menu entries
  (`menu:<label>`). settings.js: user name targets `#topbar-username`.
- `style.css` rebuilt: light/dark palettes (tokens incl. `--primary-strong`,
  `--danger-strong`, `--chart-*`), base, sidebar, topbar, login, page header, cards, stat
  row, tables, badges, buttons, forms, filters, segmented tabs, document tabs, modal,
  toast, notification/user menu, empty/error states, notices, detail/balance/accounting
  effect/aging/summary blocks. `mobile.css`: old flyout/rail rules removed, drawer sizing.
- navigate wrap chain is now: lazy-views → rbac → doc-tabs → ui/nav.js.

## Next (in order)

1. Browser check (light/dark, collapsed, drawer) once a signed-in session is available.
2. Terminology sweep of page headers still in English/old names — erp-view secHdr
   (Pembelian, Inventori, Logistik, Penjualan, Perpajakan, Laporan); asset-extras (Asset per
   Location, Fixed Asset Edited, FA Disposition, Asset Transfer); bank-extras (Bank
   Statement, Bank Reconcile, SmartLink e-Banking); master-extras (Employee, Contact,
   Customer/Supplier Category); tax-extras (e-Faktur CTAS, Tax Invoice Email, e-Faktur
   Legacy); report-extras (AI Business Analysis → Analisis Bisnis, emoji icons in Daftar
   Laporan); budget-gl-extras (Anggaran (Budget), Budget vs Actual, Transfer Budget);
   business-specific stone wording/defaults in renderInventory and inventory-extras (T-32).
3. Remaining findings: T-20 settings "[object Object]", T-21 search, T-24 import backup
   JSON card, T-34 docNum, hardcoded inline colors (#FF3B30, #34C759, #3B82F6 …) → tokens.
4. Dashboard rebuild (T-22, docs/09 §4) from ledger, Balances and the audit log; charts use
   `--chart-*` tokens.
5. Demo data generator (T-35) in `src/core/db.js` defaults.
6. Docs sync: 08 statuses → "Diperbaiki"; 05 §5; 02/09 as implemented (tax entries gated by
   the `tax` module); 04 (`journalVouchers`); ARSITEKTUR + PROJECT_STRUCTURE (view-tabs
   removed, navigate chain).
7. Final summary for the user: firestore rules/functions need a manual deploy; open
   decisions requiring confirmation.
