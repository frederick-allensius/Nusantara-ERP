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

### Findings fixed after the navigation work
- T-20 settings identity (name + role, calm account card), T-21 global search (party fields,
  invoices, delivery orders), T-24 backup import card (uses `erpBackup.importFromFile`, then
  reloads), T-34 `docNum` shows numbers as stored.

### Ringkasan / dashboard (T-22)
- `modules/dashboard.js` rebuilt: KPI tiles — Kas & bank (`GL.trialBalance`, CASH_BANK),
  Piutang/Hutang (`Balances.summary`), Penjualan bulan ini + laba kotor (REVENUE/COGS
  journal lines, vs last month); 6-month sales vs purchases chart from journals using
  `--chart-*` tokens; Perlu tindakan (statuses); Jatuh tempo terdekat; Stok menipis;
  Aktivitas terbaru (audit log, falls back to latest documents); company data checklist
  until complete; "Atur Tampilan" hides blocks per browser (`nsa_dash_hidden_v2`).
- `ui/doc-tabs.js`: a document opens as a tab only inside its own module view; from the
  dashboard, finance summary or other pages it opens as a dialog.

### Demo data (T-35)
- `src/core/demo-data.js` (new): `buildDemoData(now)` generates five months plus the current
  month relative to today, deterministic (seeded). Same product family as before (bulk
  materials, Ton/M3), fictional parties. Stock moves only through receipts, deliveries,
  returns, adjustments and transfers; orders take free stock only; items are reordered at a
  reorder level; salaries go through payroll runs plus payment vouchers; cash receipts are
  deposited Kas → BCA; one opening voucher carries opening cash, bank and inventory. Cases
  for the dashboard and the meeting demo: overdue receivable and payable, low stock, open
  orders in every status, a return, a down payment, a quotation converted to an order.
- `src/core/db.js`: old in-file seed removed. `emptyData` (structure only) fills keys missing
  from saved or imported data, so demo records are never injected into existing data;
  `initialData()` = demo dataset (empty when `VITE_SEED_DEMO=false`) for first run, Reset
  Data and the empty-Firestore seed (which also merges bank accounts, categories, units).
- `DocEngine.nextNumber(type, date, { docs })` scans the given documents for types outside
  the registry (OP/OD/BT in bank-extras, ADJ, JV), so a number is never issued twice.
- Tests: `tests/demo-data.test.ts` (stock, dates/numbers, links, payroll, invoice status,
  balanced ledger, inventory = stock value, no cash/bank account overdrawn on any day, demo
  cases); doc-engine `docs` option. Tuned against ten dates (month starts and ends).
- A browser that already has local data keeps it; the new demo data appears on a fresh
  store or after Reset Data.

### UI polish and figures that were misleading
- Hardcoded colors in `public/classic/**` → tokens (`--success/-bg`, `--danger/-bg`,
  `--warning/-bg`, `--info/-bg`, `--primary`, `--surface-sunken`, `--muted` …), so extras
  pages follow light and dark themes. Script: 307 replacements; SVG `stroke="#…"` →
  `currentColor` + token. Left as is: print/PDF templates (fixed colors on paper) and the
  unused Chart.js code in erp-view.js (task chip suggested to remove it).
- Emoji icons and markers → line icons or plain text: Daftar Laporan (icon per category,
  `.report-card-icon`), empty states (`.empty-state`), sync dialogs, warnings, buttons.
  The `⚠ Tujuan diubah` prefix stays: erp-crud.js stores and filters notes by it.
- Ringkasan: "Penjualan bulan ini" compares with the same days of last month
  (`_dashMonthly(months, throughDay)`), not the whole previous month.
- Analisis Bisnis (report-extras `openAIAnalysis`): figures now come from journals (revenue,
  cost of sales, purchases), invoices plus delivered orders without an invoice (top
  customers/items, without PPN) and `Balances.summary` (receivables). Before it summed all
  orders incl. drafts/cancelled and PPN, used purchases as cost, read a missing
  `customerName` field and shifted months through `toISOString()`. Findings are factual
  statements (no advice), month to date vs the same days last month.
- Uang Muka Penjualan/Pembelian show the order number (not the internal id); DP and
  Penggajian labels in Indonesian.

### Documentation synced with the code
- 08: all findings `Diperbaiki` except T-06 and T-44 (decision needed); T-27 still needs the
  Firestore rules/functions deploy; §E describes the demo generator; current test status.
- 05: §2/§3 marked as review findings; §5 lists the correction rules now in place.
- 02: Rekap PPN and Analisis Bisnis rows as implemented; tax entries follow the `tax` module.
- 04: `journalVouchers`, balance sheet and aging rows, demo opening voucher. 09: tabs
  decision and dashboard blocks as implemented, visual direction status. 01: evidence rows
  point to `demo-data.js`.
- ARSITEKTUR / PROJECT_STRUCTURE: view-tabs removed, navigate chain, `initialData` /
  `emptyData`, `demo-data.js`, `nextNumber({ docs })`, test list. MEETING_KIT: demo
  preparation, demo cases, presenter note.
- docs/pitch SKRIP_DEMO and FAQ_SANGGAHAN: menu names, login (username `admin`), and
  capabilities that exist now (roles, 2FA, printing, read-only API). The sample outputs in
  `docs/pitch/OUTPUT_LAPORAN.md` and the PDF/XLSX/PPTX files still show the earlier demo
  data and labels; regenerating them needs the user's go-ahead.

## Verifying in a browser without signing in

`harness.local/ui.html` (git-ignored by `*.local`) boots the classic bundle with the app's
demo data, like the smoke test. Open `http://localhost:8088/harness.local/ui.html`, drive it
with `NSANav.open('<menu label>')`. Delete the folder when the revamp is done.

## Next (in order)

Browser pass done in the harness: light/dark, collapsed sidebar + popover, drawer ≤768px,
document tab, ledger, sales list, dashboard.

1. Optional: inline-styled tables and stat cards in extras pages → shared classes. The
   pages already use the theme tokens and look consistent; low priority.
2. `public/classic/core/erp-view.js` has an uncommitted removal of unused chart code made by
   a separate session (task "Remove dead chart code from erp-view.js"); tests pass with it.
   Commit it on its own once that session is done — do not sweep it in with `git add -u`.
3. Final summary for the user: firestore rules/functions need a manual deploy; open
   decisions requiring confirmation; pitch sample outputs; remove `harness.local/`.

## Session 2026-10-03 — friend's branch + meeting requirements (DONE)

Requirements: `D:\1. Work\ERP-Lisa-Kenneth\meeting notes 14092026.txt` + recording
`meeting 14092026.mkv`. Requirement → solution → status: `docs/11-KEBUTUHAN-MEETING-14-SEP-2026.md`
(§8 lists the owner decisions still open). Security/cloud/PC: `docs/12-*`.

Commits (branch revamp/ui-and-accounting, oldest first):
- 282703c merge origin/feat/trading-refactor-pipeline (weighbridge receipts, Rekonsiliasi, SJ
  validation, funnels, Laporan per Periode, Entri Harian, dual-view). All remote branches merged.
- 3427750 text size (rem, Normal/Besar/Sangat besar). a02771d Ekspor Coretax XML.
- b22c01a trading core (trading.js, gl buildPickupJournals, balances unbilled trips, SO/PO Closed,
  DO Cancelled, menu group Pengambilan).
- 2997581 docs 11 + 12. 48020df Arsip Excel (archive-export.js). 11b1c71 per-user Akses menu.
- 0627f7a Tagih Pelanggan / Tagihan Supplier. 12319a6 trips writable with purchases OR sales
  (rbac recordModules, rules canWriteDoc); PO/SO auto-close only when the user may edit them.
- b311178 Kas & Bank recap/categories/bank charges. 6e8851d receive grid + per-receipt PI +
  GL.receivedNotInvoiced. 7886321 trading demo data. a6c67bb trip HPP follows the covering PI.
- 1344ee2 Pengambilan screens. aff49c2 Ringkasan pickup blocks, Entri Harian, notifications.
- 33a14a5 shared #view-pickups keeps billing page. d2ad227 follow-ups (unbilled trips not
  overdue, PO form supplier price by date, Surat Jalan list excludes pickup SJ, Laporan per
  Periode trips, DO status after cancelling per-receipt PI). 055d337 docs 11/ARSITEKTUR/structure.

Checks at d2ad227: vitest 34 files / 464 tests, tsc, eslint, vite build all pass. Browser pass in
harness (fresh demo data loaded in memory): Ringkasan, PO Pengambilan, Tagih Pelanggan (+ re-render),
Rekap Pengambilan, Laporan per Periode (Pengambilan), Surat Jalan hint, Kelola Backup archive,
Pengeluaran Lain recap, Entri Harian, Catat Pengambilan at 375px — no console errors, TB balanced.

Later commits: bed22bf docs 01–10, MEETING_KIT §7 (pickup demo), SJ_VALIDATION_DEMO, READMEs;
8d3a071 pickup POs out of Penerimaan Barang, aging row of a trip opens the surat jalan, doc 11 fixes.
Checks at 8d3a071: vitest 34 files / 464 tests, tsc, eslint, vite build pass.

Known gaps (documented, not built): a recorded trip can't be cancelled/deleted (weight only via
recap); no screen for default truck capacity or bank-account ↔ ledger-account link; cut-off sweep
runs when PO Pengambilan opens (Ringkasan flags overdue POs meanwhile); some older findings in
docs 03/07 still describe issues 08 marks fixed (T-04/05/12/14/15/42, T-13/21/27).

Owner decisions: docs/11 §8 and §7. Deploy by the owner: firestore.rules + functions (adminSetModules).
Housekeeping left to the user: `.claude/worktrees/agent-*` (merged; some contain a node_modules
JUNCTION to the main checkout — delete the junction with `cmd /c rmdir` first, then
`git worktree remove --force`); scratchpad `friend` worktree. `harness.local/` removed.

## Session 2026-10-03 (b) — declutter + pipeline views (DONE)

Owner feedback: app felt cluttered; wanted a funnel/pipeline view based on the business logic.
Approved design: Ringkasan 12 → 4 blocks with an "Alur transaksi" funnel; order lists get a status
strip, row "⋯" menu and one "Ekspor / impor" menu; quieter cards.
- b7c99a1 order-pipeline.js (OrderPipeline.stageOf/summary) + tests.
- ddf786a (merged) Ringkasan: period switch, 4 KPI, funnel (pickup two bands, warehouse tabs),
  Perlu tindakan top 5, one trend chart Rp/Ton; other blocks off by default (Atur Tampilan,
  storage key nsa_dash_hidden_v3). 4b1a246 softer bands.
- 1c73674 (merged) order lists: strip, row menu, Ekspor/impor menu, window.openOrderStage.
- 1392711 token-based badges (dark mode), stage badge on order rows. 14eac19 invoice paging.
  ede8f1e Faktur strip. e199b1a Surat Jalan summary line + folded armada/ekspedisi; CSP inline
  handler fixes (actionBtns, PWA update card) + guard test. 08fe2f3 billing summary line.
- Checks: vitest 39 files / 511 tests, tsc, eslint, build. Screens checked light/dark, 1440/390.
Open (owner): Perlu tindakan order; card title "Alur transaksi"; Hapus in row menu without confirm
(same as before); no quick status change for PO rows; trend vs same days last month.

## Session 2026-10-04 — UI re-audit + second declutter pass (DONE)

Audit: all 83 menu screens at 390px and 1440px (script: overflow, small text/targets, errors,
page height). Report for the owner (mobile-viewable): https://claude.ai/artifact/UoLL76KGiFz8pcmFXj2i6g
- bf8420b list-pager.js (NSAPager) + thumb-size pager buttons. 3569095/cf12c2b phone fixes (Jurnal
  paging + Debit/Kredit stacked on phones, 2-col stat tiles, Rp non-breaking space).
- f541791 (merged) paging Audit Jurnal / Riwayat Kas & Bank / Laporan per Periode.
- 8cab015 (merged) lists: lighter rows, status as text, Periode control, one ⋯ menu, Pilih beberapa,
  secHdr subtitles opt-in. a4252f2 (merged) reports: bold only totals, colour only status,
  Penjelasan toggles, Laporan Keuangan print fix. 8e50127 tax renderer single + stale view fix.
  b830230 '+' only on create buttons; sw cache v1.1.4.
- First-screen bold text: Pesanan 44→1, Pembelian 45→1, Surat Jalan 37→1, Neraca Saldo 52→2.
- Checks: vitest 46 files / 561 tests, tsc, eslint, build.
Owner approved and done: fa3fc3f stat tiles repeating statement totals removed (balance line kept),
Pajak & PPN document lists folded; 13222f1 (merged) phone card layout for 16 lists (.list-cards,
data-cell roles, mobile.css; sorting via ⋯ → Urutkan on phones). Checks: 47 files / 578 tests.
Open: full-width action buttons on cards and name-keyed card lines (agent's choice, confirm with
owner); 360px phones: two row combinations put the row button on its own line.

## Session 2026-10-06 — visual direction B (DONE)

Owner: "minimalist sleek elegant beautiful"; chose mockup B (white Swiss, harness.local/mockups/b-swiss.*)
and a classic vertical funnel (reference image harness.local/mockups/funnel-reference.png); text
size default back to Normal ("big but not that big — forget it for now").
- a40c46e (merged) Ringkasan vertical funnel: two funnels (Ke pelanggan green, Dari supplier ink),
  warehouse tabs 4 cumulative layers (Dipesan → Dikirim → Difakturkan → Lunas).
- 942c1be (merged) theme B: tokens light/dark, Geist/Geist Mono, ink primary buttons, borderless
  sections with hairlines, KPI/stat rows without boxes, status dot+text, Normal text size default
  (key erp_text_size_v2). 721ef15 green customer funnel, white theme-color/manifest, sw v1.1.6.
- Vite dep cache in node_modules/.vite is shared with agent worktrees (junction): clear
  node_modules/.vite/deps and restart the dev server if the app shows a blank screen (504 Outdated
  Optimize Dep).

## Session 2026-10-07 — cards on a blue canvas, accent blue, new buttons, dark G1 (DONE)

Owner: without boxes the blocks of one screen were hard to tell apart; chose option 1 (tinted canvas
+ white cards) with a bluish canvas, the blue #4169D7 (from the owner's swatch) as the one accent,
the button style of the "Daily Log" design system (buttons only), and dark variant G1 (graphite,
layered like light: canvas lighter, cards darker). Previews: harness.local/mockups/card-final.js,
btn-*.png, inv-*.png.
- Light: --bg #EEF2FC canvas/topbar, sidebar #F6F8FE, chrome lines #DCE3F5; .card = white,
  radius 12, padding 24/28 (phone 20/20, ≤480px 18/16), gap 16 (phone 12), --card-shadow ring.
  KPI tiles, stat rows and Entri Harian tasks are small cards; grids use gap var(--card-gap).
- Accent tokens --accent/--accent-text/--accent-soft/--on-accent: filled buttons, .seg-tab.active
  chip, .seg-tabs-sm and .doctab underline, open nav entry (--sb-active), .link-btn, :focus-visible.
- Buttons: gradient accent fill + inset highlight, ghost = white tile (--btn-tile-*), radius 8,
  press scale .98, accent focus halo; heights unchanged (--tap-min) for older users.
  Dialog Hapus (8 edit dialogs, erp-crud.js) = .btn-danger-text.footer-start on the left; solid
  red only on "Ya, hapus".
- Dark G1: canvas/topbar #26282D, sidebar #1E2024, cards/dialogs #141518, inputs #0E0F11,
  accent text #8EA6F0, neutrals cool graphite.
- 39 inline background:var(--bg) panels in classic JS now use --surface-sunken (#F5F7FB / #101113),
  since --bg is the canvas tint. theme-color/manifest #EEF2FC; sw v1.1.7.
- Checks: vitest 47 files / 580 tests, tsc, eslint, build.
- Seen, not touched: Pengaturan "Kelola Backup" subtitle reads "undefined backup otomatis
  tersimpan"; the marketing landing page (public/styles/landing.css) keeps its own palette.

## Session 2026-10-07 — one place for each feature (DONE)

Owner asked why Catat Pengambilan was its own menu entry next to PO Pengambilan and to remove this
kind of repetition across the app ("kerjakan semuanya"). Audit: every one of the 83 menu entries
opened in the harness (title, tabs, header buttons), then the overlaps checked in code.
- 8432f23 Hidden menu entries (`hidden` + `under` for a step, `opens` for an older name of a page
  inside another; nav.js): still opened by label from buttons, Entri Harian, notifications; RBAC
  access summaries skip them. Hidden: Catat Pengambilan, Impor Rekap Timbangan, Transfer Antar
  Gudang, Jurnal Umum, Daftar Laporan. In-page tabs repeating menu entries removed (invoices,
  quotations, returns, Laporan Keuangan, Buku Besar); page title = entry.
- 819588d Merged pages: Rekening Koran into Rekonsiliasi Bank; Realisasi + Transfer Anggaran into
  Anggaran (per-line realisasi from the ledger, period filter, transfer history); Rekonsiliasi
  Timbangan into Penerimaan Barang (status, faktur, actions; PO numbers); Rekap PPN into Pajak &
  PPN (per masa pajak, posted documents as the ledger; the all-time totals over non-draft orders
  are gone); Audit Jurnal into Jurnal (date/account/search filters). nav.js now marks an entry whose
  page draws into the view already on screen (was: highlight stayed on the previous entry).
- Stage 3: one employee form (master-extras employeeForm) for Karyawan and Penggajian with profile,
  email + Departemen akses (role via Manajemen Pengguna) and salary/allowances; Pengaturan Umum
  keeps only Backup, Notifikasi, Manajemen Pengguna, Pengaturan Pajak, JSON export/import, sync,
  reset (dropped tiles: Profil Perusahaan — it opened an empty "versi berikutnya" panel —,
  Keamanan & Password, Install Aplikasi, Kategori Item, Satuan Ukur, Chart of Accounts; their
  duplicate dialogs removed from erp-crud.js). Sidebar 83 → 72 entries. sw v1.1.8.
- Docs: 02 §4 "Halaman tanpa entri menu sendiri" table, Pengaturan Umum, Data karyawan; 09 §2.
- REQUIRES USER CONFIRMATION: Rekap PPN now follows the Pajak module (sales role loses it);
  Validasi SJ Supplier vs Impor Rekap Timbangan (same idea for warehouse receipts) and its
  "Muat Contoh Demo" button — untouched.

## Session 2026-10-07 — themed pickers; flow preview (pickers DONE, preview pending)

- Pickers (ui/pickers.js, core bundle after doc-tabs.js): with a fine pointer, <select> opens a
  themed option list (optgroups, disabled, search from 9 options, keys, type-ahead), date fields a
  Monday-first calendar (min/max, Hari ini, Kosongkan, month grid via the title, typing still
  works), month fields a month grid. The native control keeps the value; choosing fires input +
  change. Touch keeps native pickers; opt out with data-native-picker. Escape closes only the
  pop-up. Calendar icon replaces the browser indicator. tests/pickers.test.ts; sw v1.1.9.
- Owner concern: submenus read as lists, "Perlu tindakan" like notes. Preview
  (harness.local/mockups/pipeline-preview.js, pp-*.png): sidebar groups split into ALUR (steps on a
  rail with pending counts) / LAINNYA / DATA; Perlu tindakan grouped per flow with one row format
  (verb title · detail · count pill). Approved and applied: nav.js `step` items + headings Alur /
  Lainnya / Data in Pengambilan, Penjualan, Pembelian (rail, dot, waiting count from _dashActions,
  refreshed on navigate and after saveDB); dashboard rows carry title/unit/flow/urgent and render
  grouped (.dash-act-*), the "+N lainnya" toggle is gone. sw v1.1.10.
- CV on surat jalan photos: not built; needs sample photos, supplier Excel and approval of the AI
  service cost (docs/11 already marks it REQUIRES USER CONFIRMATION).


## Session 2026-10-10 — A list (A1–A5) + T-06 safeguard (DONE)

- A1 (a642912): ask()/confirmAsk() in src/core/modal.js replace every browser confirm/prompt/alert
  (45 sites); themed, opens above the open dialog, destructive questions start on Batal.
- A2 (a97dec7): inline button styles → btn-sm / btn-danger-text; bold kept only for totals.
- A3 (ec31e84): trial balance and PPN rows as list-cards; ui/table-cards.js turns other page
  tables into cards on phones (≤560px); 0 tables overflow at 390px.
- A4 (084b591): Ringkasan Keuangan drops the duplicate Piutang & hutang / Pajak cards; hutang
  aging shows "jatuh tempo 7 hari ke depan".
- A5 (843147f): Koreksi berat on a pickup (Trading.updateWeight source 'manual' + note).
- T-06 interim safeguard: SO/PO Catat Pembayaran shows total, paid via order, paid on invoice and
  combined Sisa tagihan, and asks before saving above it (invoice dialog already did). Standard
  payment path still REQUIRES USER CONFIRMATION. tests/payment-double-entry.test.ts; sw v1.1.19.
- Remaining items all wait on owner decisions (see docs 08 T-06/T-44, docs 11, MEETING_KIT).

## Session 2026-10-11 (night) — meeting re-check, Kotak Masuk Rekap simulation, owner questions

- Meeting recording re-transcribed (Whisper small, GPU); notes + redacted transcript written OUTSIDE
  the repo: ../meeting-14092026/NOTULEN-14092026.md and TRANSKRIP-14092026.txt (business part
  0:22–1:29 only, personal names redacted). 42 requirements mapped to the app with status.
- Corrections from the recording: DO photos + Excel come by EMAIL with a fixed subject format (not
  WhatsApp — "WA aja" was about sending samples to us); the supplier's printed DO is the evidence;
  "keuntungan hanya level selanjutnya". Doc 11 fixed; wording "foto tiket" → "foto DO" in the
  pickup pages and docs.
- Kotak Masuk Rekap (public/classic/core/recap-inbox.js, menu step after PO Pengambilan): simulated
  supplier e-mail with a real .xlsx (read through Trading.recapRowsFromAoa) and canvas-drawn DO
  photos with a simulated reading (boxes + confidence). Per SJ: photo vs Excel vs recorded →
  Cocok / Perlu diperbarui / Rekap ≠ foto / Berat lama diubah (30→35 case, default keep) / Foto
  kurang jelas (<80%) / Tanpa foto / Tidak ada di rekap / SJ tidak dikenal. "Catat" goes through
  Trading.matchRecap/applyRecap (+ photo attached); draft reply to supplier (simulated send).
  Inbox kept in localStorage only. Dashboard Perlu tindakan row + nav count. Docs 13 (simulation,
  demo script, real architecture, decisions), 02, 03. tests/recap-inbox.test.ts.
- Ringkasan KPI tiles follow module access (Kas & bank: gl; Piutang: sales; Hutang: purchases;
  Laba kotor: reports+gl) — profit no longer shown to a user limited to Pengambilan/Penjualan.
- Same-name customers/suppliers (one company, two sites): saving a second record under a used name
  asks first; order-form datalists show the address; billing lists add the address to twin names.
- docs/14-PERTANYAAN-UNTUK-PEMILIK.md: owner question list (A decisions, B email/CV, C materials,
  D defaults to confirm, E users, F infra/commercial).
- Text size: default stays Normal (owner-approved revamp choice); D10 asks the owner.
- sw v1.1.20. Checks: 55 files / 614+ tests, tsc clean, build ok; lint errors are pre-existing (48).
- Faktur selisih (follow-up invoice) for a weight that went up after invoicing — the meeting's
  "invoice tambahan untuk selisihnya": Trading.billingGap / createAdjustment / releaseAdjustment;
  Perubahan Timbangan cards show the gap per side with "Tagih selisih ke pelanggan" and "Catat
  tagihan selisih supplier" (supplier invoice no. required); the alert closes itself once every
  invoiced side matches. The invoice carries the trip (doIds) so it books no COGS; gl.js
  tripInvoicedCost now sums every covering purchase invoice (inventory stays zero). Cancelling the
  first invoice is blocked while its follow-up is active; cancelling a follow-up reopens the alert.
  Before this, the advised manual invoice would have booked COGS twice. Docs 03 §V3, 04 §4.5, 11.
  sw v1.1.21. 619 tests.

## Session 2026-10-11 (pagi) — UI density review + contoh alur 500 ton

- Owner feedback: UI still feels full, too much text. Design review (gstack design-review) over 31
  pages; report + screenshots OUTSIDE the repo: ~/.gstack/projects/draxmit-Nusantara-ERP/designs/
  design-audit-20261011/. 15 findings fixed, one commit each (aae811c … 98f0fa5):
  001 instruction subtitles/hints · 002 repeated figures (notice = tiles, card repeating the title,
  Total faktur twice) · 003 row actions behind ⋯ (rowActionsMenu), rows open their document,
  chevron instead of "Lihat" · 004 one date format (tgl(), "11 Okt 2026") · 005 status colours /
  .action-primary · 006 journal memo without the document number · 007 Kotak Masuk Rekap copy ·
  008 dialog button order, "Jurnal: …" hints · 009 surat jalan rows as cards on phones · 010 order
  dialogs: Jejak/Duplikat/Batalkan behind ⋯, pickup orders hide Buat Surat Jalan/Faktur · 011
  recap import opens on the file picker · 012 Harga Supplier rows · 013 aging tables show 10 +
  "Tampilkan semua" · 014 Jurnal folds to one line per journal (number, source, date, total;
  "Buka semua"; opens on account/text search) · 015 recap/weight-change copy.
  Measured over the same 31 pages: explanatory text 2,046 → 1,276 words (−38%), all words
  8,792 → 6,619 (−25%), visible buttons 329 → 274, page height −22%; Faktur 22 → 7 buttons,
  Penerimaan 18 → 3; Jurnal 1,654 → 303 words; Ringkasan Keuangan 1,021 → 475 words.
- Bug found while replaying: the FINDING-012 regex had a literal backspace byte (Python patch
  string), so recap sources still read "Rekap Rekap …" — fixed (bdd2e06) with tests. Scanned the
  repo for other control characters: none. Lesson: write JS edits with the Edit tool or raw strings.
- Contoh alur 500 ton (docs/15, screenshots docs/pitch/contoh-alur-500-ton/): the meeting story from
  customer PO to month-end cut-off — 15 SJ, three cumulative recaps (SJ /04 30 → 35 t after
  invoicing → faktur selisih), weekly invoices, supplier price 120k → 125k from 14 Sep, payment,
  supplier bill 460 t vs 451,2 t, cut-off. Sales 69.936.000, HPP 54.666.000, laba kotor 15.270.000,
  ledger balanced, inventory 0. Every figure asserted in tests/round-trip-500t.test.ts.
- Deferred (owner decision): low-value summary tiles (Driver aktif, Total penerimaan · Dokumen,
  Harga Supplier counts) — the tiles were asked for earlier; Tagihan pelanggan block on Ringkasan
  stays off by default.
- sw v1.1.22. 622 tests.
