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

### Terminology & data-driven defaults (Phase B, part 2)
- Page headers match their menu entries: erp-view list pages (Pesanan Penjualan/Pembelian,
  Barang & Stok, Surat Jalan, Daftar Aset, Pajak & PPN, Pengaturan Umum) and injected pages
  in asset/bank/master/tax/report/budget/inventory/settings extras, adjust-view,
  warehouse-view ("AI Business Analysis" → "Analisis Bisnis").
- No preset stone categories in the product: inventory filter categories
  (`FILTER_OPTIONS.inventory` getter) and item-category defaults come from the data
  (`_itemCategoryList`); unused `ITEM_CATEGORIES` removed; neutral placeholders.
- Warehouse and financial-report tabs use the segmented control.

## Verifying in a browser without signing in

`harness.local/ui.html` (git-ignored by `*.local`) boots the classic bundle with the app's
demo data, like the smoke test. Open `http://localhost:8088/harness.local/ui.html`, drive it
with `NSANav.open('<menu label>')`. Delete the folder when the revamp is done.

## Next (in order)

1. Browser pass in the harness: dark theme, collapsed sidebar + popover, drawer ≤768px,
   document detail (modal and document tabs), ledger, invoices, forms.
2. Remaining findings: T-20 settings "[object Object]", T-21 search, T-24 import backup
   JSON card, T-34 docNum, hardcoded inline colors (#FF3B30, #34C759, #3B82F6 …) → tokens,
   emoji icons (Daftar Laporan, empty states).
3. Dashboard rebuild (T-22, docs/09 §4) from ledger, Balances and the audit log; charts use
   `--chart-*` tokens.
4. Demo data generator (T-35) in `src/core/db.js` defaults — realistic and internally
   consistent; keep the product domain of the existing demo items; no tile/ceramic workflows.
5. Docs sync: 08 statuses → "Diperbaiki"; 05 §5; 02/09 as implemented (tax entries gated by
   the `tax` module); 04 (`journalVouchers`); ARSITEKTUR + PROJECT_STRUCTURE (view-tabs
   removed, navigate chain).
6. Final summary for the user: firestore rules/functions need a manual deploy; open
   decisions requiring confirmation; remove `harness.local/`.
