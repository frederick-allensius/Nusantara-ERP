// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Views Module
// Renderers · Navigation · Charts · Event Delegation · Filters · Search · Notif
// Depends on: erp-core.js (DB, filters, activeView, helpers, modal, toast)
//             erp-crud.js (CRUD functions)
// ═══════════════════════════════════════════════════════════════════════════════
// FIX SUMMARY
//  • clear search    — × button clears the search field; input is also cleared
//                      after navigating to a result via the search modal.
//  • filter labels   — filterBtn() overrides the core stub and reads
//                      FILTER_OPTIONS to display human-readable labels; an active
//                      filter shows a "×" chip so the user can dismiss it inline.
//  • sortable tables — sortState tracks {col, dir} per view; every sortable
//                      column header shows ↑/↓ indicators and toggles on click.
//  • empty states    — filtered empty states name the active filter and offer a
//                      one-click "Hapus filter" link.
//  • export CSV      — each list view gains an "Export CSV" button that downloads
//                      the currently filtered+sorted rows as UTF-8 CSV with BOM
//                      (so Excel opens it cleanly).

// ── Document number normalizer ────────────────────────────────────────────────
// Accurate exports SI. (Sales Invoice) and PI. (Purchase Invoice) prefixes.
// Display them as SO. / PO. to match the app's own numbering scheme.
// Document number as stored (invoices keep their SI./PI. numbers); the record id
// when a document has no number yet.
function docNum(number, id) {
  return number || id || '—';
}
window.docNum = docNum;
window.getRenderer = getRenderer;

// ── Date range filters ────────────────────────────────────────────────────────
const dateFilters = {
  sales: { from: '', to: '' },
  purchase: { from: '', to: '' },
  logistics: { from: '', to: '' },
};

// ── Pagination ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 15;
const pageState = {
  sales: 1,
  purchase: 1,
  inventory: 1,
  logistics: 1,
  master_cust: 1,
  master_supp: 1,
};

function applyPage(arr, view) {
  const p = pageState[view] || 1;
  const start = (p - 1) * PAGE_SIZE;
  return arr.slice(start, start + PAGE_SIZE);
}

function pagerHTML(total, view) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(pageState[view] || 1, pages);
  if (pages <= 1) {
    return '';
  }
  return `<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:12px;font-size:.75rem;color:var(--muted)">
    <span>${(cur - 1) * PAGE_SIZE + 1}–${Math.min(cur * PAGE_SIZE, total)} dari ${total}</span>
    <button class="btn-ghost" data-action="pageNav" data-view="${view}" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''} style="padding:3px 10px;font-size:.75rem${cur === 1 ? ';opacity:.35;cursor:not-allowed' : ''}">‹ Prev</button>
    <button class="btn-ghost" data-action="pageNav" data-view="${view}" data-page="${cur + 1}" ${cur === pages ? 'disabled' : ''} style="padding:3px 10px;font-size:.75rem${cur === pages ? ';opacity:.35;cursor:not-allowed' : ''}">Next ›</button>
  </div>`;
}

function applyDateFilter(arr, view) {
  const df = dateFilters[view];
  if (!df) {
    return arr;
  }
  let r = arr;
  // FIX 4.6: Convert both sides to Date objects before comparing.
  // String comparison works for strict YYYY-MM-DD but silently misbehaves
  // if either side has a non-padded month/day or a different separator.
  // Using Date.parse guarantees correct chronological ordering.
  if (df.from) {
    const fromMs = Date.parse(df.from);
    r = r.filter(o => o.date && Date.parse(o.date) >= fromMs);
  }
  if (df.to) {
    const toMs = Date.parse(df.to);
    r = r.filter(o => o.date && Date.parse(o.date) <= toMs);
  }
  return r;
}

function dateFilterBar(view) {
  const df = dateFilters[view] || {};
  const active = df.from || df.to;
  return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
    <label style="font-size:.75rem;color:var(--muted)">Dari</label>
    <input type="date" class="form-input" style="padding:4px 8px;font-size:.75rem;width:138px"
           value="${df.from || ''}" data-action="setDateFrom" data-view="${view}">
    <label style="font-size:.75rem;color:var(--muted)">s/d</label>
    <input type="date" class="form-input" style="padding:4px 8px;font-size:.75rem;width:138px"
           value="${df.to || ''}" data-action="setDateTo" data-view="${view}">
    ${active ? `<button class="btn-ghost" data-action="clearDateFilter" data-view="${view}" style="font-size:.75rem;padding:3px 8px">× Hapus</button>` : ''}
  </div>`;
}

const FILTER_OPTIONS = {
  sales: [
    ['all', 'Semua'],
    ['Draft', 'Draft'],
    ['Waiting on Process', 'Menunggu Proses'],
    ['Partially Processed', 'Diproses Sebagian'],
    ['Processed', 'Diproses'],
    ['Confirmed', 'Dikonfirmasi'],
    ['Paid', 'Lunas'],
    ['Delivered', 'Terkirim'],
    ['Cancelled', 'Dibatalkan'],
  ],
  purchase: [
    ['all', 'Semua'],
    ['Draft', 'Draft'],
    ['Waiting on Process', 'Menunggu Proses'],
    ['Partially Processed', 'Diproses Sebagian'],
    ['Processed', 'Diproses'],
    ['Confirmed', 'Dikonfirmasi'],
    ['Paid', 'Lunas'],
    ['Received', 'Diterima'],
    ['Cancelled', 'Dibatalkan'],
  ],
  // Category filters follow the data: configured categories plus those in use.
  get inventory() {
    const cats = typeof _itemCategoryList === 'function' ? _itemCategoryList() : [];
    return [['all', 'Semua'], ['Low', 'Stok Rendah'], ...cats.map(c => [c, c])];
  },
  logistics: [
    ['all', 'Semua'],
    ['Sent', 'Terkirim'],
    ['Partially invoiced', 'Faktur Sebagian'],
    ['Invoiced', 'Difakturkan'],
  ],
};

// ── Finance reports — populated dynamically by renderFinance() ────────────────
// (was a hardcoded const; now rebuilt each render so values track the DB live)
let _financeReports = [];
let _reportCatalog = [];

function applyTaxRounding(value, mode) {
  switch (mode) {
    case 'floor':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    default:
      return Math.round(value);
  }
}

function getTaxSettings() {
  const t = (DB.settings && DB.settings.tax) || {};
  const ppnRate = typeof t.ppnRate === 'number' ? t.ppnRate : 0.11;
  const pphRate = typeof t.pphRate === 'number' ? t.pphRate : 0;
  return {
    pkp: t.pkp !== false,
    npwp: t.npwp || '—',
    ppnRate,
    pphRate,
    rounding: t.rounding || 'round',
  };
}

function calcTaxSummary() {
  const tax = getTaxSettings();
  const salesOrders = DB.salesOrders.filter(o => o.status !== 'Draft');
  const purchaseOrders = DB.purchaseOrders.filter(o => o.status !== 'Draft');
  const salesBase = salesOrders.reduce((s, o) => s + (o.amount || 0), 0);
  const purchaseBase = purchaseOrders.reduce((s, o) => s + (o.amount || 0), 0);
  const salesWithTax = salesOrders.filter(o => typeof o.tax === 'number').length;
  const purchaseWithTax = purchaseOrders.filter(o => typeof o.tax === 'number').length;

  const outputTaxRaw = salesOrders.reduce(
    (s, o) => s + (typeof o.tax === 'number' ? o.tax : (o.amount || 0) * tax.ppnRate),
    0
  );
  const inputTaxRaw = purchaseOrders.reduce(
    (s, o) => s + (typeof o.tax === 'number' ? o.tax : (o.amount || 0) * tax.ppnRate),
    0
  );

  const outputTax = applyTaxRounding(outputTaxRaw, tax.rounding);
  const inputTax = applyTaxRounding(inputTaxRaw, tax.rounding);
  const netTax = outputTax - inputTax;

  return {
    tax,
    salesOrders,
    purchaseOrders,
    salesBase,
    purchaseBase,
    salesWithTax,
    purchaseWithTax,
    outputTax,
    inputTax,
    netTax,
  };
}

// ── Chart instances ───────────────────────────────────────────────────────────
let charts = {};

// ── Sort state ────────────────────────────────────────────────────────────────
// FIX (sortable tables): per-view sort state tracks which column is active and
// the direction. Clicking the same column toggles asc ↔ desc.
const sortState = {
  sales: { col: 'date', dir: 'desc' },
  purchase: { col: 'date', dir: 'desc' },
  logistics: { col: 'date', dir: 'desc' },
};

/**
 * Sort a copy of `arr` using the current sortState for `view`.
 * Falls back to the original order when no sort is active.
 */
function applySorted(arr, view) {
  const s = sortState[view];
  if (!s) {
    return arr;
  }
  return [...arr].sort((a, b) => {
    let va = a[s.col],
      vb = b[s.col];
    if (typeof va === 'string') {
      va = va.toLowerCase();
      vb = vb.toLowerCase();
    }
    if (va < vb) {
      return s.dir === 'asc' ? -1 : 1;
    }
    if (va > vb) {
      return s.dir === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

function sortCol(view, col) {
  const cur = sortState[view];
  sortState[view] =
    cur && cur.col === col ? { col, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' };
  refreshActiveView();
}

// Re-render the current view. navigate() caches rendered views in _renderedViews
// and skips re-render when re-navigating to an already-rendered view, so in-view
// data changes (pagination, sort, filters) need an explicit cache-invalidate
// first. See [[navigate-render-cache-gotcha]].
function refreshActiveView() {
  if (window.invalidateView) {
    window.invalidateView(activeView);
  }
  navigate(activeView);
}

/**
 * Return a sortable <th> element string.
 * `view` is the sortState key; `col` is the data-property name.
 */
function sortTh(label, view, col) {
  const s = sortState[view];
  const active = s && s.col === col;
  const arrow = active ? (s.dir === 'asc' ? ' ↑' : ' ↓') : '';
  return `<th class="th-sort${active ? ' th-sort-active' : ''}"
    data-action="sortCol" data-type="${view}" data-col="${col}"
    title="Klik untuk urut berdasarkan ${label}"
    style="cursor:pointer;user-select:none;white-space:nowrap">
    ${escapeHtml(label)}<span style="font-size:.75rem;opacity:${active ? 1 : 0.3}">${arrow || ' ↕'}</span>
  </th>`;
}

// ── Filter button ─────────────────────────────────────────────────────────────
// FIX (filter labels): overrides the stub in erp-core.js with a version that
// reads FILTER_OPTIONS to surface human-readable labels, marks the button active
// when a filter is applied, and inlines a dismiss × chip.
function filterBtn(type) {
  const f = filters[type];
  const opts = FILTER_OPTIONS[type] || [];
  const entry = opts.find(([val]) => val === f);
  const label = f === 'all' ? 'Filter' : entry ? entry[1] : f;
  const isActive = f !== 'all';

  const activeStyle = isActive
    ? 'background:var(--primary-strong);color:var(--on-primary);border-color:var(--primary-strong)'
    : '';

  const clearChip = isActive
    ? `<button data-action="clearFilter" data-type="${type}"
         style="background:rgba(255,255,255,0.25);border:none;border-radius:4px;
                color:#fff;font-size:.75rem;font-weight:700;padding:1px 5px;
                cursor:pointer;margin-left:2px;line-height:1.4" title="Hapus filter">×</button>`
    : '';

  return `<div class="filter-wrap" style="display:flex;align-items:center;gap:6px">
    <button class="filter-btn" data-action="toggleFilter" data-type="${type}" style="${activeStyle}">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      ${escapeHtml(label)}
    </button>${clearChip}
    <div class="filter-drop" id="filter-${type}"></div>
  </div>`;
}

// ── Export CSV ────────────────────────────────────────────────────────────────
// FIX (export CSV): downloads the current view's filtered+sorted data as a
// UTF-8 CSV with BOM so Excel auto-detects encoding correctly.
function exportCSV(view) {
  let headers, rows;

  if (view === 'sales') {
    const f = filters.sales;
    let data = f === 'all' ? DB.salesOrders : DB.salesOrders.filter(o => o.status === f);
    data = applyDateFilter(data, 'sales');
    data = applySorted(data, 'sales');
    headers = ['No. SO', 'Pelanggan', 'Tanggal', 'Total (Rp)', 'Status'];
    rows = data.map(o => [docNum(o.number, o.id), o.customer, o.date, o.amount, o.status]);
  } else if (view === 'purchase') {
    const f = filters.purchase;
    let data = f === 'all' ? DB.purchaseOrders : DB.purchaseOrders.filter(o => o.status === f);
    data = applyDateFilter(data, 'purchase');
    data = applySorted(data, 'purchase');
    headers = ['No. PO', 'Supplier', 'Tanggal', 'Total (Rp)', 'Status'];
    rows = data.map(o => [docNum(o.number, o.id), o.supplier, o.date, o.amount, o.status]);
  } else if (view === 'inventory') {
    const f = filters.inventory;
    let data =
      f === 'all'
        ? DB.inventoryItems
        : f === 'Low'
          ? DB.inventoryItems.filter(i => i.stock < i.min)
          : DB.inventoryItems.filter(i => i.category === f);
    data = applySorted(data, 'inventory');
    headers = [
      'Nama Item',
      'Kategori',
      'Satuan',
      'Stok',
      'Min. Stok',
      'Harga Beli (Rp)',
      'Harga Jual (Rp)',
      'Status',
    ];
    rows = data.map(i => [
      i.name,
      i.category,
      i.unit,
      i.stock,
      i.min,
      i.cost,
      i.sell,
      i.stock < i.min ? 'Stok Rendah' : 'Normal',
    ]);
  } else if (view === 'logistics') {
    const f = filters.logistics;
    const dos = stockDeliveries();
    let data = f === 'all' ? dos : dos.filter(o => o.status === f);
    data = applyDateFilter(data, 'logistics');
    data = applySorted(data, 'logistics');
    headers = ['No. DO', 'Pelanggan', 'Tujuan', 'Tanggal', 'Driver', 'Kendaraan', 'Status'];
    rows = data.map(d => [
      docNum(d.number, d.id),
      d.customer,
      d.destination,
      d.date,
      d.driver,
      d.vehicle,
      d.status,
    ]);
  } else {
    showToast('Export tidak tersedia untuk halaman ini', 'warning');
    return;
  }

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  // BOM (\uFEFF) ensures Excel reads the file as UTF-8
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${view}-${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('File CSV berhasil diunduh', 'success');
}

// ── Export XLSX ───────────────────────────────────────────────────────────────
// Real .xlsx via the offline writer (xlsx-export.js). Mirrors exportCSV's
// filtered+sorted dataset but with typed columns (currency / integer) so Excel
// formats numbers natively instead of treating them as text.
function exportXLSX(view) {
  if (!window.NSAXlsx) {
    showToast('Modul Excel belum siap', 'warning');
    return;
  }
  let columns, rows, sheetName;

  if (view === 'sales') {
    const f = filters.sales;
    let data = f === 'all' ? DB.salesOrders : DB.salesOrders.filter(o => o.status === f);
    data = applyDateFilter(data, 'sales');
    data = applySorted(data, 'sales');
    sheetName = 'Sales Order';
    columns = [
      { header: 'No. SO', width: 16 },
      { header: 'Pelanggan', width: 26 },
      { header: 'Tanggal', width: 13 },
      { header: 'Total (Rp)', type: 'currency', width: 18 },
      { header: 'Status', width: 14 },
    ];
    rows = data.map(o => [docNum(o.number, o.id), o.customer, o.date, o.amount, o.status]);
  } else if (view === 'purchase') {
    const f = filters.purchase;
    let data = f === 'all' ? DB.purchaseOrders : DB.purchaseOrders.filter(o => o.status === f);
    data = applyDateFilter(data, 'purchase');
    data = applySorted(data, 'purchase');
    sheetName = 'Purchase Order';
    columns = [
      { header: 'No. PO', width: 16 },
      { header: 'Supplier', width: 26 },
      { header: 'Tanggal', width: 13 },
      { header: 'Total (Rp)', type: 'currency', width: 18 },
      { header: 'Status', width: 14 },
    ];
    rows = data.map(o => [docNum(o.number, o.id), o.supplier, o.date, o.amount, o.status]);
  } else if (view === 'inventory') {
    const f = filters.inventory;
    let data =
      f === 'all'
        ? DB.inventoryItems
        : f === 'Low'
          ? DB.inventoryItems.filter(i => i.stock < i.min)
          : DB.inventoryItems.filter(i => i.category === f);
    data = applySorted(data, 'inventory');
    sheetName = 'Inventori';
    columns = [
      { header: 'Nama Item', width: 28 },
      { header: 'Kategori', width: 16 },
      { header: 'Satuan', width: 10 },
      { header: 'Stok', type: 'int', width: 10 },
      { header: 'Min. Stok', type: 'int', width: 10 },
      { header: 'Harga Beli', type: 'currency', width: 16 },
      { header: 'Harga Jual', type: 'currency', width: 16 },
      { header: 'Status', width: 13 },
    ];
    rows = data.map(i => [
      i.name,
      i.category,
      i.unit,
      i.stock,
      i.min,
      i.cost,
      i.sell,
      i.stock < i.min ? 'Stok Rendah' : 'Normal',
    ]);
  } else if (view === 'logistics') {
    const f = filters.logistics;
    const dos = stockDeliveries();
    let data = f === 'all' ? dos : dos.filter(o => o.status === f);
    data = applyDateFilter(data, 'logistics');
    data = applySorted(data, 'logistics');
    sheetName = 'Delivery Order';
    columns = [
      { header: 'No. DO', width: 16 },
      { header: 'Pelanggan', width: 24 },
      { header: 'Tujuan', width: 22 },
      { header: 'Tanggal', width: 13 },
      { header: 'Driver', width: 18 },
      { header: 'Kendaraan', width: 16 },
      { header: 'Status', width: 14 },
    ];
    rows = data.map(d => [d.id, d.customer, d.destination, d.date, d.driver, d.vehicle, d.status]);
  } else {
    showToast('Export tidak tersedia untuk halaman ini', 'warning');
    return;
  }

  try {
    window.NSAXlsx.download(`${view}-${today()}`, [{ name: sheetName, columns, rows }]);
    showToast('File Excel berhasil diunduh', 'success');
  } catch (err) {
    console.error('[exportXLSX]', err);
    showToast('Gagal membuat file Excel', 'danger');
  }
}

// ── Export button helper ──────────────────────────────────────────────────────
function exportBtn(view) {
  return `<button class="btn-ghost" data-action="exportCSV" data-type="${view}"
    style="display:flex;align-items:center;gap:5px;font-size:.75rem">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg> Export CSV
  </button>`;
}

// ── Export Excel button helper ────────────────────────────────────────────────
function excelBtn(view) {
  return `<button class="btn-ghost" data-action="exportXLSX" data-type="${view}"
    style="display:flex;align-items:center;gap:5px;font-size:.75rem">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="17"/><line x1="16" y1="13" x2="8" y2="17"/>
    </svg> Export Excel
  </button>`;
}

// ── Import Excel button helper ────────────────────────────────────────────────
// Per-module import (Sales / Purchase / Logistics). Wired to importModuleExcel()
// in excel-import.js, which dedups re-uploads by date and rejects duplicate DO
// numbers.
function importBtn(view) {
  return `<button class="btn-ghost" data-action="importXLSX" data-type="${view}"
    style="display:flex;align-items:center;gap:5px;font-size:.75rem">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--info)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg> Import Excel
  </button>`;
}

// ── PDF summary button helper ─────────────────────────────────────────────────
// Sales / Purchase only. Wired to printOrderSummary() in order-summary.js, which
// opens a period picker then prints a per-item + per-document recap as PDF.
function summaryBtn(view) {
  return `<button class="btn-ghost" data-action="printSummary" data-type="${view}"
    style="display:flex;align-items:center;gap:5px;font-size:.75rem">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
      <rect x="6" y="14" width="12" height="8"/>
    </svg> Ringkasan PDF
  </button>`;
}

// ── Empty state helper ────────────────────────────────────────────────────────
// FIX (empty states): when a filter is active and returns no rows the message
// names the filter and offers a one-click dismiss link.
function emptyRow(colspan, view) {
  const f = filters[view];
  if (!f || f === 'all') {
    return `<tr><td colspan="${colspan}" class="td-empty">Belum ada data — tambah entri baru di atas.</td></tr>`;
  }
  const opts = FILTER_OPTIONS[view] || [];
  const entry = opts.find(([val]) => val === f);
  const label = entry ? entry[1] : f;
  return `<tr><td colspan="${colspan}" class="td-empty">
    Tidak ada data dengan filter "<strong>${escapeHtml(label)}</strong>" —
    <span class="link-btn" data-action="clearFilter" data-type="${view}"
          style="cursor:pointer;color:var(--primary);text-decoration:underline">hapus filter</span>
  </td></tr>`;
}

// ── Navigation ────────────────────────────────────────────────────────────────
// BUG #1 FIX: Use getRenderer() for late binding so that function re-declarations
// in later-loading classic scripts (e.g. dashboard.js's renderDashboard) are
// picked up at runtime. The old `const renderers = { sales: renderSales, … }`
// captured references at parse time, before later scripts loaded.
function getRenderer(id) {
  switch (id) {
    case 'dashboard':
      return renderDashboard;
    case 'sales':
      return renderSales;
    case 'purchase':
      return renderPurchase;
    case 'inventory':
      return renderInventory;
    case 'finance':
      return renderFinance;
    case 'assets':
      return renderAssets;
    case 'tax':
      return renderTax;
    case 'reports':
      return renderReports;
    case 'ledger':
      // Phase 2b: General Ledger view, defined additively in gl-view.js.
      return typeof window.renderLedger === 'function' ? window.renderLedger : null;
    case 'adjustments':
      // Phase 3a: Item Adjustment view, defined additively in adjust-view.js.
      return typeof window.renderAdjustments === 'function' ? window.renderAdjustments : null;
    case 'invoices':
      // Phase 4: Invoice & Receipt view, defined additively in invoice-view.js.
      return typeof window.renderInvoices === 'function' ? window.renderInvoices : null;
    case 'financials':
      // Phase 5: Financial Reports (P/L, Balance Sheet, Cash Flow).
      return typeof window.renderFinancials === 'function' ? window.renderFinancials : null;
    case 'quotations':
      // Phase 5: Sales/Purchase Quotation view.
      return typeof window.renderQuotations === 'function' ? window.renderQuotations : null;
    case 'returns':
      // Phase 5: Sales/Purchase Return view.
      return typeof window.renderReturns === 'function' ? window.renderReturns : null;
    case 'warehouse':
      // Phase 3b: Warehouse management + Item Transfer view.
      return typeof window.renderWarehouse === 'function' ? window.renderWarehouse : null;
    case 'excelImport':
      // Import dari Excel — defined additively in excel-import.js.
      return typeof window.renderExcelImport === 'function' ? window.renderExcelImport : null;
    case 'pickups':
      // Pengambilan (trading pickups) — pickup-view.js; its pages are opened
      // through window._pickupView / window._pickupBilling.
      return typeof window.renderPickups === 'function' ? window.renderPickups : null;
    case 'entriHarian':
      // Section 5: Entri Harian — focused data-entry surface for the
      // Admin/Accounting personas, defined additively in entri-harian.js.
      return typeof window.renderEntriHarian === 'function' ? window.renderEntriHarian : null;
    case 'logistics':
      return renderLogistics;
    case 'master':
      return renderMasterData;
    case 'settings':
      return renderSettings;
    default:
      return null;
  }
}

function navigate(id) {
  activeView = id;

  // BUG #5 FIX: Clean up any open filter dropdown and its listeners when navigating
  // (also removes any drop parked on <body> for the mobile bottom-sheet).
  _cleanupParkedFilters();

  document
    .querySelectorAll('.nav-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.view === id));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  destroyCharts();

  const el = document.getElementById(`view-${id}`);
  const renderer = getRenderer(id);
  if (el && renderer) {
    el.innerHTML = renderer();
    el.classList.add('active');
  }

  if (id === 'dashboard') {
    requestAnimationFrame(() => requestAnimationFrame(initCharts));
  }
}

// ── View: Dashboard ───────────────────────────────────────────────────────────
// NOTE: renderDashboard() and initCharts() are defined in dashboard.js, which
// loads after this file. The getRenderer('dashboard') call in navigate()
// picks up dashboard.js's version at runtime via late binding.

// ── View: Sales ───────────────────────────────────────────────────────────────
// renderSales() (checkbox selection, inline status dropdown, bulk status bar)
// lives in the merged erp-patch section at the bottom of this file. The
// getRenderer() switch references it by name via late binding.

// ── View: Purchase ────────────────────────────────────────────────────────────
function renderPurchase() {
  const f = filters.purchase;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  let orders = f === 'all' ? DB.purchaseOrders : DB.purchaseOrders.filter(o => o.status === f);
  orders = applyDateFilter(orders, 'purchase');
  orders = applySorted(orders, 'purchase');

  const _isPInv = o => !o._type || o._type === 'invoice';
  const stats = DB.purchaseOrders.reduce(
    (acc, o) => {
      if (!_isPInv(o) || o.status === 'Draft' || o.status === 'Cancelled') return acc;
      acc.totalVal += o.amount || 0;
      if (o.date && o.date.startsWith(thisMonth)) {
        acc.thisMthOrders.push(o);
        acc.thisMthVal += o.amount || 0;
      }
      if (o.status === 'Confirmed') {
        acc.pendingCnt++;
        acc.hutangVal += o.owing != null ? o.owing : Math.max(0, (o.amount || 0) - (o.paid || 0));
      }
      return acc;
    },
    { totalVal: 0, thisMthOrders: [], thisMthVal: 0, pendingCnt: 0, hutangVal: 0 }
  );

  const { totalVal, thisMthOrders, thisMthVal, pendingCnt, hutangVal } = stats;

  const totalFiltered = orders.length;
  const paged = applyPage(orders, 'purchase');

  return `
  ${secHdr('Pesanan Pembelian', 'Purchase order ke supplier beserta penerimaan barang dan pembayarannya', 'Buat PO', 'addPO')}
  ${statRow([
    { label: 'PO Bulan Ini', value: String(thisMthOrders.length), sub: monthLabel },
    { label: 'Nilai Bulan Ini', value: idr(thisMthVal), sub: `Total all-time: ${idr(totalVal)}` },
    {
      label: 'Menunggu Barang',
      value: `${pendingCnt} PO`,
      sub: 'Belum diterima',
      color: 'var(--warning)',
    },
    { label: 'Hutang Belum Lunas', value: idr(hutangVal), sub: 'Ke supplier', color: 'var(--danger)' },
  ])}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:.875rem;font-weight:700">Daftar Purchase Order</div>
      <div style="display:flex;align-items:center;gap:8px">
        ${summaryBtn('purchase')}
        ${importBtn('purchase')}
        ${exportBtn('purchase')}
        ${excelBtn('purchase')}
        ${filterBtn('purchase')}
      </div>
    </div>
    <div style="margin-bottom:12px">${dateFilterBar('purchase')}</div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${sortTh('No. PO', 'purchase', 'id')}
          ${sortTh('Supplier', 'purchase', 'supplier')}
          ${sortTh('Tanggal', 'purchase', 'date')}
          ${sortTh('Total', 'purchase', 'amount')}
          ${sortTh('Status', 'purchase', 'status')}
          <th>Aksi</th>
        </tr></thead>
        <tbody>
          ${
            paged.length === 0
              ? emptyRow(6, 'purchase')
              : paged
                  .map(
                    o => `<tr data-action="viewPO" data-id="${escapeHtml(o.id)}" style="cursor:pointer">
              <td class="td-p" style="font-size:.75rem;font-weight:700;color:var(--primary)">${escapeHtml(docNum(o.number, o.id))}</td>
              <td class="td-p" style="font-size:.8125rem;font-weight:600">${escapeHtml(o.supplier)}</td>
              <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(o.date)}</td>
              <td class="td-p" style="font-size:.8125rem;font-weight:800">${idr(o.amount)}</td>
              <td class="td-p">${badge(o.status)}</td>
              <td class="td-p">${actionBtns('PO', o.id)}</td>
            </tr>`
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalFiltered, 'purchase')}
  </div>`;
}

// ── View: Inventory ───────────────────────────────────────────────────────────
function renderInventory() {
  const f = filters.inventory;
  const lowCount = DB.inventoryItems.filter(i => i.stock < i.min).length;
  let items =
    f === 'all'
      ? DB.inventoryItems
      : f === 'Low'
        ? DB.inventoryItems.filter(i => i.stock < i.min)
        : DB.inventoryItems.filter(i => i.category === f);
  items = applySorted(items, 'inventory');

  const totalValue = DB.inventoryItems.reduce((s, i) => s + i.stock * i.cost, 0);
  const cats = [...new Set(DB.inventoryItems.map(i => i.category))];

  const totalFiltered = items.length;
  const pagedItems = applyPage(items, 'inventory');

  return `
  ${secHdr('Barang & Stok', 'Daftar barang, stok, dan nilai persediaan', 'Tambah Barang', 'addItem')}
  ${
    lowCount > 0
      ? `<div class="alert-warn">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
    <span><strong>${lowCount} item</strong> di bawah stok minimum — segera lakukan pembelian.</span>
  </div>`
      : ''
  }
  ${statRow([
    { label: 'Total Item', value: String(DB.inventoryItems.length), sub: 'Aktif di katalog' },
    { label: 'Nilai Stok Total', value: idr(totalValue), sub: 'Berdasarkan harga beli' },
    { label: 'Stok Rendah', value: `${lowCount} item`, sub: 'Di bawah minimum', color: 'var(--danger)' },
    { label: 'Kategori', value: String(cats.length), sub: 'Kelompok barang' },
  ])}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div style="font-size:.875rem;font-weight:700">Katalog Item</div>
      <div style="display:flex;align-items:center;gap:8px">
        ${exportBtn('inventory')}
        ${excelBtn('inventory')}
        ${filterBtn('inventory')}
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${sortTh('Nama', 'inventory', 'name')}
          ${sortTh('Kategori', 'inventory', 'category')}
          <th>Satuan</th>
          ${sortTh('Stok', 'inventory', 'stock')}
          <th>Min</th>
          ${sortTh('Harga Beli', 'inventory', 'cost')}
          ${sortTh('Harga Jual', 'inventory', 'sell')}
          <th>Status</th>
          <th>Aksi</th>
        </tr></thead>
        <tbody>
          ${
            pagedItems.length === 0
              ? emptyRow(9, 'inventory')
              : pagedItems
                  .map(i => {
                    const isLow = i.stock < i.min;
                    return `<tr data-action="viewItem" data-id="${escapeHtml(i.id)}" style="cursor:pointer">
                <td class="td-p" style="font-size:.8125rem;font-weight:700">${escapeHtml(i.name)}</td>
                <td class="td-p"><span class="cat">${escapeHtml(i.category)}</span></td>
                <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(i.unit)}</td>
                <td class="td-p" style="font-size:.8125rem;font-weight:800;color:${isLow ? 'var(--danger)' : 'var(--text)'}">${i.stock}</td>
                <td class="td-p" style="font-size:.75rem;color:var(--muted)">${i.min}</td>
                <td class="td-p" style="font-size:.75rem">${idr(i.cost)}</td>
                <td class="td-p" style="font-size:.75rem;font-weight:700">${idr(i.sell)}</td>
                <td class="td-p">${badge(isLow ? 'Low' : 'OK')}</td>
                <td class="td-p">${actionBtns('Item', i.id)}</td>
              </tr>`;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalFiltered, 'inventory')}
  </div>`;
}

// "Bagan Akun": the chart of accounts lives in the ledger module (Buku Besar).
function editAccounts() {
  if (window.NSANav && window.NSANav.open('Bagan Akun')) {
    return;
  }
  const openChart = () => {
    if (window._ledgerExtras && typeof window._ledgerExtras.openTab === 'function') {
      window._ledgerExtras.openTab('chart');
    } else if (typeof window.navigate === 'function') {
      window.navigate('ledger');
    }
  };
  if (typeof window.ensureView === 'function') {
    window.ensureView('ledger').then(openChart, openChart);
  } else {
    openChart();
  }
}

// ── View: Ringkasan Keuangan ──────────────────────────────────────────────────
// Every figure comes from the ledger (GL) or from Balances, so it matches the
// financial statements, invoices and aging.
function renderFinance() {
  const gl = window.GL;
  const tb = gl ? gl.trialBalance() : { rows: [] };
  const chart = DB.accountsChart || [];
  const typeOf = no => (chart.find(a => a.no === no) || {}).type;
  const balance = r => (Number(r.debit) || 0) - (Number(r.credit) || 0);

  // Cash & bank: one figure per cash/bank account in the ledger.
  const cashRows = tb.rows.filter(r => r.type === 'CASH_BANK');
  const cashTotal = cashRows.reduce((s, r) => s + balance(r), 0);
  const cashStats = cashRows
    .slice(0, 3)
    .map(r => ({ label: r.name, value: idr(balance(r)), sub: `Akun ${r.no}` }));
  cashStats.push({
    label: 'Total kas & bank',
    value: idr(cashTotal),
    sub: cashRows.length ? 'Saldo buku besar' : 'Belum ada transaksi kas',
    color: 'var(--primary)',
  });

  // This month's profit from ledger lines.
  const month = today().slice(0, 7);
  let revenue = 0;
  let cogs = 0;
  let expense = 0;
  (DB.journals || []).forEach(j => {
    if (!j || String(j.date || '').slice(0, 7) !== month) {
      return;
    }
    (j.lines || []).forEach(l => {
      const t = typeOf(l.accountNo);
      const credit = (Number(l.credit) || 0) - (Number(l.debit) || 0);
      if (t === 'REVENUE' || t === 'OTHER_INCOME') {
        revenue += credit;
      } else if (t === 'COGS') {
        cogs -= credit;
      } else if (t === 'EXPENSE' || t === 'OTHER_EXPENSE') {
        expense -= credit;
      }
    });
  });
  const netProfit = revenue - cogs - expense;

  const B = window.Balances;
  const ar = B ? B.summary('sales') : { total: 0, overdue: 0, count: 0, overdueCount: 0, dueSoon: 0 };
  const ap = B ? B.summary('purchases') : { total: 0, overdue: 0, count: 0, overdueCount: 0, dueSoon: 0 };

  // Inventory: moving-average valuation vs. the ledger's inventory accounts.
  const costOf = item =>
    window.CostLedger ? window.CostLedger.costOf(item.id) : Number(item.cost) || 0;
  const stockValue = (DB.inventoryItems || []).reduce(
    (s, i) => s + (Number(i.stock) || 0) * costOf(i),
    0
  );
  const inventoryGL = tb.rows.filter(r => r.type === 'INVENTORY').reduce((s, r) => s + balance(r), 0);
  const inventoryGap = Math.round(stockValue - inventoryGL);

  const metric = (label, value, cls) =>
    `<div class="metric-row"><span>${escapeHtml(label)}</span><strong class="${cls || ''}">${value}</strong></div>`;
  const taxCfg = (DB.settings && DB.settings.tax) || {};
  const integrityPanel =
    typeof window.Integrity !== 'undefined' && typeof window.Integrity.statusCardHTML === 'function'
      ? window.Integrity.statusCardHTML()
      : '';

  return `
  ${secHdr('Ringkasan Keuangan', 'Kas, piutang, hutang, dan laba — dihitung dari buku besar')}
  ${statRow(cashStats)}
  <div class="summary-grid">
    <div class="card">
      <div class="card-title">Laba rugi bulan ini</div>
      ${metric('Pendapatan', idr(revenue))}
      ${metric('Harga pokok penjualan', idr(cogs))}
      ${metric('Beban', idr(expense))}
      ${metric('Laba bersih', idr(netProfit), netProfit < 0 ? 't-danger' : 't-success')}
      <button class="action-ghost" data-action="openFinPL">Buka Laporan Laba Rugi</button>
    </div>
    <div class="card">
      <div class="card-title">Piutang & hutang</div>
      ${metric('Piutang belum dibayar', idr(ar.total))}
      ${metric('Piutang lewat jatuh tempo', idr(ar.overdue), ar.overdue > 0 ? 't-danger' : '')}
      ${metric('Hutang belum dibayar', idr(ap.total))}
      ${metric('Hutang jatuh tempo 7 hari', idr(ap.dueSoon), ap.dueSoon > 0 ? 't-warning' : '')}
      <button class="action-ghost" data-action="openFinBS">Buka Neraca</button>
    </div>
    <div class="card">
      <div class="card-title">Persediaan</div>
      ${metric('Nilai stok (harga pokok rata-rata)', idr(stockValue))}
      ${metric('Saldo akun persediaan', idr(inventoryGL))}
      ${
        Math.abs(inventoryGap) >= 1
          ? `<div class="notice notice-warning">Selisih ${idr(inventoryGap)}. Biasanya karena saldo awal persediaan belum dijurnal — catat lewat Import Excel (Opening Balances) atau Jurnal Umum.</div>`
          : '<div class="notice notice-success">Nilai stok sama dengan buku besar.</div>'
      }
    </div>
    <div class="card">
      <div class="card-title">Pajak</div>
      ${metric('Status', taxCfg.pkp ? 'PKP' : 'Non-PKP')}
      ${metric('NPWP', escapeHtml(taxCfg.npwp || 'Belum diisi'))}
      ${metric('Tarif PPN', `${Math.round((taxCfg.ppnRate || 0) * 100)}%`)}
      <button class="action-ghost" data-action="editTaxSettings">Pengaturan Pajak</button>
    </div>
  </div>
  ${integrityPanel}
  ${_piutangAgingSection()}
  ${_hutangAgingSection()}`;
}

// ── View: Assets ──────────────────────────────────────────────────────────────
function renderAssets() {
  const assets = (DB.settings && DB.settings.assets) || [];
  const categories = (DB.settings && DB.settings.assetCategories) || [];
  const fiscalCategories = (DB.settings && DB.settings.assetFiscalCategories) || [];
  const transfers = (DB.settings && DB.settings.assetTransfers) || [];
  const disposals = (DB.settings && DB.settings.assetDisposals) || [];

  const totalCost = assets.reduce((s, a) => s + (a.cost || 0), 0);
  const maintenanceCount = assets.filter(a => a.status === 'Maintenance').length;
  const disposedCount = assets.filter(a => a.status === 'Disposed').length;
  const locationMap = new Map();
  assets.forEach(a => {
    const loc = a.location || 'Tidak ditentukan';
    locationMap.set(loc, (locationMap.get(loc) || 0) + 1);
  });
  const locationList = [...locationMap.entries()].sort((a, b) => b[1] - a[1]);

  const listAssets = assets.slice().sort((a, b) => String(b.id).localeCompare(String(a.id)));
  const recentTransfers = transfers.slice(0, 5);
  const recentDisposals = disposals.slice(0, 5);

  return `
  ${secHdr('Daftar Aset', 'Aset tetap perusahaan beserta kategori, mutasi, dan pelepasannya', 'Tambah Aset', 'addAsset')}
  ${statRow([
    { label: 'Total Aset', value: String(assets.length), sub: 'Aset tercatat' },
    { label: 'Nilai Perolehan', value: idrFull(totalCost), sub: 'Total biaya perolehan' },
    {
      label: 'Perlu Perawatan',
      value: String(maintenanceCount),
      sub: 'Status Maintenance',
      color: 'var(--chart-4)',
    },
    {
      label: 'Sudah Dilepas',
      value: String(disposedCount),
      sub: 'Disposisi aset',
      color: 'var(--danger)',
    },
  ])}
  <div class="fin-2col">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:.8125rem;font-weight:700">Kategori Aset</div>
        <button class="btn-ghost" data-action="addAssetCategory" style="font-size:.75rem;padding:4px 10px">+ Tambah</button>
      </div>
      ${
        categories.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:14px">Belum ada kategori aset.</div>`
          : `<div style="display:flex;flex-wrap:wrap;gap:6px">${categories
              .map(c => `<span class="cat">${escapeHtml(c)}</span>`)
              .join('')}</div>`
      }
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:.8125rem;font-weight:700">Kategori Fiskal</div>
        <button class="btn-ghost" data-action="addAssetFiscalCategory" style="font-size:.75rem;padding:4px 10px">+ Tambah</button>
      </div>
      ${
        fiscalCategories.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:14px">Belum ada kategori fiskal.</div>`
          : `<div style="display:flex;flex-wrap:wrap;gap:6px">${fiscalCategories
              .map(c => `<span class="cat">${escapeHtml(c)}</span>`)
              .join('')}</div>`
      }
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:.875rem;font-weight:700">Daftar Aset</div>
      <div style="font-size:.75rem;color:var(--muted)">Berdasarkan data aset yang tersimpan</div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>ID</th>
          <th>Nama</th>
          <th>Kategori</th>
          <th>Lokasi</th>
          <th>Tanggal Perolehan</th>
          <th>Nilai</th>
          <th>Status</th>
          <th>Aksi</th>
        </tr></thead>
        <tbody>
          ${
            listAssets.length === 0
              ? `<tr><td colspan="8" class="td-empty">Belum ada aset terdaftar.</td></tr>`
              : listAssets
                  .map(
                    a => `<tr data-action="viewAsset" data-id="${escapeHtml(a.id)}" style="cursor:pointer">
              <td class="td-p" style="font-size:.75rem;font-weight:700">${escapeHtml(a.id)}</td>
              <td class="td-p" style="font-size:.75rem;font-weight:700">${escapeHtml(a.name)}</td>
              <td class="td-p"><span class="cat">${escapeHtml(a.category || '—')}</span></td>
              <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(a.location || '—')}</td>
              <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(a.acquired || '—')}</td>
              <td class="td-p" style="font-size:.75rem;font-weight:700">${idrFull(a.cost || 0)}</td>
              <td class="td-p">${badge(a.status || 'OK')}</td>
              <td class="td-p">${actionBtns('Asset', a.id)}</td>
            </tr>`
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
  </div>
  <div class="fin-2col" style="margin-top:16px">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:.8125rem;font-weight:700">Mutasi Aset</div>
        <button class="btn-ghost" data-action="addAssetTransfer" style="font-size:.75rem;padding:4px 10px">+ Catat</button>
      </div>
      ${
        recentTransfers.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:14px">Belum ada mutasi aset.</div>`
          : recentTransfers
              .map(
                t => `<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:.75rem;font-weight:700">${escapeHtml(t.assetName || t.assetId)}</div>
            <div style="font-size:.75rem;color:var(--muted)">${escapeHtml(t.from || '—')} → ${escapeHtml(t.to || '—')}</div>
          </div>
          <div style="font-size:.75rem;color:var(--muted)">${escapeHtml(t.date || '—')}</div>
        </div>`
              )
              .join('')
      }
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:.8125rem;font-weight:700">Disposisi Aset</div>
        <button class="btn-ghost" data-action="addAssetDisposal" style="font-size:.75rem;padding:4px 10px">+ Catat</button>
      </div>
      ${
        recentDisposals.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:14px">Belum ada disposisi aset.</div>`
          : recentDisposals
              .map(
                d => `<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:.75rem;font-weight:700">${escapeHtml(d.assetName || d.assetId)}</div>
            <div style="font-size:.75rem;color:var(--muted)">${escapeHtml(d.method || '—')}</div>
          </div>
          <div style="font-size:.75rem;color:var(--muted)">${escapeHtml(d.date || '—')}</div>
        </div>`
              )
              .join('')
      }
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div style="font-size:.8125rem;font-weight:700">Aset per Lokasi</div>
      <div style="font-size:.75rem;color:var(--muted)">Berdasarkan lokasi pada aset</div>
    </div>
    ${
      locationList.length === 0
        ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:14px">Belum ada lokasi aset.</div>`
        : locationList
            .map(
              ([
                loc,
                count,
              ]) => `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:.75rem;font-weight:700">${escapeHtml(loc)}</div>
        <div style="font-size:.75rem;color:var(--muted)">${count} aset</div>
      </div>`
            )
            .join('')
    }
  </div>`;
}

// ── View: Tax ─────────────────────────────────────────────────────────────────
function renderTax() {
  const summary = calcTaxSummary();
  const tax = summary.tax;
  const ratePct = (tax.ppnRate * 100).toFixed(2).replace(/\.00$/, '');
  const roundingLabel =
    tax.rounding === 'floor'
      ? 'Dibulatkan ke bawah'
      : tax.rounding === 'ceil'
        ? 'Dibulatkan ke atas'
        : 'Dibulatkan normal';

  const salesRecent = summary.salesOrders
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 5);
  const purchaseRecent = summary.purchaseOrders
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 5);

  const efakturCount = summary.salesOrders.filter(
    o => o.status === 'Paid' || o.status === 'Delivered'
  ).length;

  return `
  ${secHdr('Pajak & PPN', 'PPN keluaran dan masukan dari transaksi, serta pengaturan pajak perusahaan', 'Ubah Pengaturan Pajak', 'editTaxSettings')}
  ${statRow([
    {
      label: 'PPN Keluaran',
      value: idrFull(summary.outputTax),
      sub: `Berdasarkan ${summary.salesOrders.length} transaksi`,
    },
    {
      label: 'PPN Masukan',
      value: idrFull(summary.inputTax),
      sub: `Berdasarkan ${summary.purchaseOrders.length} transaksi`,
    },
    {
      label: 'PPN Terutang',
      value: idrFull(summary.netTax),
      sub: `Keluaran - Masukan`,
      color: summary.netTax >= 0 ? 'var(--primary)' : 'var(--danger)',
    },
    { label: 'Tarif PPN', value: `${ratePct}%`, sub: roundingLabel },
  ])}
  <div class="fin-2col">
    <div class="card">
      <div style="font-size:.8125rem;font-weight:700;margin-bottom:10px">Dasar Perhitungan</div>
      <div style="font-size:.75rem;color:var(--muted);line-height:1.5;margin-bottom:10px">
        PPN dihitung dari total transaksi non-draft. Jika transaksi memiliki nilai <strong>tax</strong>,
        nilai tersebut dipakai. Jika tidak, sistem menghitung <strong>amount × tarif PPN</strong>.
      </div>
      <div style="font-size:.75rem;display:flex;flex-direction:column;gap:6px">
        <div>Penjualan kena pajak: <strong>${idrFull(summary.salesBase)}</strong></div>
        <div>Pembelian kena pajak: <strong>${idrFull(summary.purchaseBase)}</strong></div>
        <div>Transaksi dengan tax eksplisit: <strong>${summary.salesWithTax + summary.purchaseWithTax}</strong></div>
      </div>
    </div>
    <div class="card">
      <div style="font-size:.8125rem;font-weight:700;margin-bottom:10px">Status Kepatuhan</div>
      <div style="font-size:.75rem;display:flex;flex-direction:column;gap:6px">
        <div>Status PKP: <strong>${tax.pkp ? 'Terdaftar' : 'Belum PKP'}</strong></div>
        <div>NPWP: <strong>${escapeHtml(tax.npwp)}</strong></div>
        <div>e-Faktur siap kirim: <strong>${efakturCount} transaksi</strong></div>
      </div>
      <div style="margin-top:10px;font-size:.75rem;color:var(--muted)">
        Berdasarkan transaksi penjualan berstatus Paid/Delivered.
      </div>
    </div>
  </div>
  <div class="fin-2col" style="margin-top:16px">
    <div class="card">
      <div style="font-size:.8125rem;font-weight:700;margin-bottom:10px">Dasar Penjualan (PPN Keluaran)</div>
      ${
        salesRecent.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:14px">Belum ada penjualan tercatat.</div>`
          : salesRecent
              .map(
                o => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:.75rem;font-weight:700">${escapeHtml(docNum(o.number, o.id))}</div>
            <div style="font-size:.75rem;color:var(--muted)">${escapeHtml(o.customer || '—')} • ${escapeHtml(o.date || '—')}</div>
          </div>
          <div style="font-size:.75rem;font-weight:700">${idrFull(o.amount || 0)}</div>
        </div>`
              )
              .join('')
      }
    </div>
    <div class="card">
      <div style="font-size:.8125rem;font-weight:700;margin-bottom:10px">Dasar Pembelian (PPN Masukan)</div>
      ${
        purchaseRecent.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:14px">Belum ada pembelian tercatat.</div>`
          : purchaseRecent
              .map(
                o => `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:.75rem;font-weight:700">${escapeHtml(docNum(o.number, o.id))}</div>
            <div style="font-size:.75rem;color:var(--muted)">${escapeHtml(o.supplier || '—')} • ${escapeHtml(o.date || '—')}</div>
          </div>
          <div style="font-size:.75rem;font-weight:700">${idrFull(o.amount || 0)}</div>
        </div>`
              )
              .join('')
      }
    </div>
  </div>`;
}

// ── View: Reports ─────────────────────────────────────────────────────────────
function renderReports() {
  const taxSummary = calcTaxSummary();
  const salesTotal = taxSummary.salesBase;
  const purchaseTotal = taxSummary.purchaseBase;
  const inventoryVal = DB.inventoryItems.reduce((s, i) => s + (i.stock || 0) * (i.cost || 0), 0);
  const lowStock = DB.inventoryItems.filter(i => i.stock < i.min).length;
  const topCustomer = DB.salesOrders.reduce(
    (acc, o) => {
      if (!o.customer) {
        return acc;
      }
      acc.counts[o.customer] = (acc.counts[o.customer] || 0) + (o.amount || 0);
      if (acc.counts[o.customer] > acc.bestValue) {
        acc.bestValue = acc.counts[o.customer];
        acc.bestName = o.customer;
      }
      return acc;
    },
    { counts: {}, bestName: '—', bestValue: 0 }
  );
  const topSupplier = DB.purchaseOrders.reduce(
    (acc, o) => {
      if (!o.supplier) {
        return acc;
      }
      acc.counts[o.supplier] = (acc.counts[o.supplier] || 0) + (o.amount || 0);
      if (acc.counts[o.supplier] > acc.bestValue) {
        acc.bestValue = acc.counts[o.supplier];
        acc.bestName = o.supplier;
      }
      return acc;
    },
    { counts: {}, bestName: '—', bestValue: 0 }
  );

  _reportCatalog = [
    {
      title: 'Laporan Penjualan',
      sub: 'Ringkasan penjualan non-draft',
      value: idrFull(salesTotal),
      items: [
        `✓ Jumlah transaksi: ${taxSummary.salesOrders.length}`,
        `✓ Total penjualan: ${idrFull(salesTotal)}`,
        `✓ Pelanggan terbesar: ${topCustomer.bestName}`,
      ],
    },
    {
      title: 'Laporan Pembelian',
      sub: 'Ringkasan pembelian non-draft',
      value: idrFull(purchaseTotal),
      items: [
        `✓ Jumlah transaksi: ${taxSummary.purchaseOrders.length}`,
        `✓ Total pembelian: ${idrFull(purchaseTotal)}`,
        `✓ Supplier terbesar: ${topSupplier.bestName}`,
      ],
    },
    {
      title: 'Laporan Persediaan',
      sub: 'Nilai stok dan stok rendah',
      value: idrFull(inventoryVal),
      items: [
        `✓ Total nilai stok: ${idrFull(inventoryVal)}`,
        `✓ Item stok rendah: ${lowStock} item`,
        `✓ Jumlah item aktif: ${DB.inventoryItems.length}`,
      ],
    },
    {
      title: 'Ringkasan Pajak',
      sub: 'PPN keluaran vs masukan',
      value: idrFull(taxSummary.netTax),
      items: [
        `✓ PPN keluaran: ${idrFull(taxSummary.outputTax)}`,
        `✓ PPN masukan: ${idrFull(taxSummary.inputTax)}`,
        `✓ PPN terutang: ${idrFull(taxSummary.netTax)}`,
      ],
    },
  ];

  return `
  ${secHdr('Laporan', 'Ringkasan laporan penjualan, pembelian, pajak, dan analisis')}
  <div class="fin-2col">
    ${_reportCatalog
      .map(
        (r, idx) => `
      <div class="card fin-card-row" data-action="openReport" data-idx="${idx}" style="cursor:pointer">
        <div class="fin-ico" style="background:var(--info-bg)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div style="flex:1">
          <div style="font-size:.8125rem;font-weight:700">${escapeHtml(r.title)}</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:2px">${escapeHtml(r.sub)}</div>
        </div>
        <div style="font-size:.8125rem;font-weight:800;color:var(--primary)">${escapeHtml(r.value)}</div>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`
      )
      .join('')}
  </div>
  `;
}

// ── View: Logistics ───────────────────────────────────────────────────────────
// Surat jalan for goods sent from stock. Pickup surat jalan (trading trips,
// pickup: true) live in Pengambilan, where their slots, weights and invoices
// are kept consistent.
function stockDeliveries() {
  return (DB.deliveryOrders || []).filter(o => o && o.pickup !== true);
}

function renderLogistics() {
  const f = filters.logistics;
  const dos = stockDeliveries();
  const pickupCount = (DB.deliveryOrders || []).length - dos.length;
  let orders = f === 'all' ? dos : dos.filter(o => o.status === f);
  orders = applyDateFilter(orders, 'logistics');
  orders = applySorted(orders, 'logistics');

  const invoiced = dos.filter(o => o.status === 'Invoiced').length;
  const sent = dos.filter(o => o.status === 'Sent').length;
  const partialInv = dos.filter(o => o.status === 'Partially invoiced').length;
  // Fix #4: compute from real data — count unique drivers dispatched this month
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisMthDO = dos.filter(o => o.date && o.date.startsWith(thisMonth));
  const uniqueDrivers = new Set(thisMthDO.map(o => o.driver).filter(d => d && d !== '—')).size;

  const fleet = DB.fleet || [];
  const expedition = DB.expedition || [];
  const totalFiltered = orders.length;
  const paged = applyPage(orders, 'logistics');

  return `
  ${secHdr('Surat Jalan', 'Pengiriman barang ke pelanggan, armada, dan ekspedisi', 'Buat Surat Jalan', 'addDO')}
  ${statRow([
    {
      label: 'DO Difakturkan',
      value: String(invoiced),
      sub: 'Sudah jadi faktur',
      color: 'var(--success)',
    },
    { label: 'DO Terkirim', value: String(sent), sub: 'Belum difaktur', color: 'var(--primary)' },
    { label: 'DO Faktur Sebagian', value: String(partialInv), sub: 'Sebagian difaktur', color: 'var(--warning)' },
    {
      label: 'Driver Aktif Bln Ini',
      value: String(uniqueDrivers),
      sub: `${thisMthDO.length} DO bulan ini`,
    },
  ])}
  <div class="log-2col">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:.8125rem;font-weight:700">Armada Kendaraan</div>
        <button class="btn-ghost" data-action="addFleet" style="font-size:.75rem;padding:4px 10px">+ Tambah</button>
      </div>
      ${
        fleet.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:16px">Belum ada armada — tambah kendaraan di atas.</div>`
          : fleet
              .map(
                v => `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-size:.75rem;font-weight:700;font-family:monospace">${escapeHtml(v.plate)}</div>
            <div style="font-size:.75rem;color:var(--muted)">${escapeHtml(v.type)} · ${escapeHtml(v.driver)}</div>
          </div>
          ${badge(v.status === 'OK' ? 'OK' : 'In Transit')}
          <button class="action-ghost" data-action="editFleet" data-id="${escapeHtml(v.id)}" style="font-size:.75rem">Edit</button>
        </div>`
              )
              .join('')
      }
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:.8125rem;font-weight:700">Ekspedisi Rekanan</div>
        <button class="btn-ghost" data-action="addExpedition" style="font-size:.75rem;padding:4px 10px">+ Tambah</button>
      </div>
      ${
        expedition.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:16px">Belum ada ekspedisi — tambah rekanan di atas.</div>`
          : expedition
              .map(
                e => `<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-size:.75rem;font-weight:700">${escapeHtml(e.name)}</div>
            <div style="font-size:.75rem;color:var(--muted)">${escapeHtml(e.area)} · ${escapeHtml(e.rate)}</div>
          </div>
          <button class="action-ghost" data-action="editExpedition" data-id="${escapeHtml(e.id)}" style="font-size:.75rem">Edit</button>
        </div>`
              )
              .join('')
      }
    </div>
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:.875rem;font-weight:700">Daftar Delivery Order</div>
      <div style="display:flex;align-items:center;gap:8px">
        ${importBtn('logistics')}
        ${exportBtn('logistics')}
        ${excelBtn('logistics')}
        ${filterBtn('logistics')}
      </div>
    </div>
    <div style="margin-bottom:12px">${dateFilterBar('logistics')}</div>
    ${
      pickupCount > 0
        ? `<div class="empty-inline" style="margin-bottom:12px;text-align:left">Surat jalan pengambilan dari supplier (${pickupCount}) ada di menu <button class="link-btn" data-action="openPickupOrders">Pengambilan → PO Pengambilan</button>.</div>`
        : ''
    }
    <div class="table-wrap">
      <table>
        <thead><tr>
          ${sortTh('No. DO', 'logistics', 'id')}
          <th>Ref.</th>
          ${sortTh('Pelanggan', 'logistics', 'customer')}
          ${sortTh('Tujuan', 'logistics', 'destination')}
          ${sortTh('Tanggal', 'logistics', 'date')}
          <th>Driver</th>
          <th>Kendaraan</th>
          ${sortTh('Status', 'logistics', 'status')}
          <th>Aksi</th>
        </tr></thead>
        <tbody>
          ${
            paged.length === 0
              ? emptyRow(9, 'logistics')
              : paged
                  .map(d => {
                    const rawRef = d.soId || d.poId || null;
                    // Prefix the reference with its source type so it's obvious
                    // at a glance whether the DO came from an SO or a PO.
                    const refKind = d.soId ? 'SO' : d.poId ? 'PO' : '';
                    const ref = rawRef ? `${refKind} · ${docNum(null, rawRef)}` : '—';
                    const refColor = d.soId
                      ? 'var(--primary)'
                      : d.poId
                        ? 'var(--warning)'
                        : 'var(--muted)';
                    return `<tr data-action="viewDO" data-id="${escapeHtml(d.id)}" style="cursor:pointer">
              <td class="td-p" style="font-size:.75rem;font-weight:700;color:var(--primary)">${escapeHtml(docNum(d.number, d.id))}</td>
              <td class="td-p" style="font-size:.75rem;font-weight:600;color:${refColor}">${escapeHtml(ref)}</td>
              <td class="td-p" style="font-size:.75rem;font-weight:600">${escapeHtml(d.customer)}</td>
              <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(d.destination)}${
                d.destChanged
                  ? ` <span title="${escapeHtml(d.destOriginal ? 'Tujuan diubah dari: ' + d.destOriginal : 'Tujuan diubah')}" style="display:inline-block;font-size:.75rem;font-weight:800;color:var(--warning);background:var(--warning-bg);border:1px solid transparent;border-radius:99px;padding:1px 6px;vertical-align:middle">TUJUAN DIUBAH</span>`
                  : ''
              }</td>
              <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(d.date)}</td>
              <td class="td-p" style="font-size:.75rem">${escapeHtml(d.driver)}</td>
              <td class="td-p" style="font-size:.75rem;font-family:monospace">${escapeHtml(d.vehicle)}</td>
              <td class="td-p">${badge(d.status)}</td>
              <td class="td-p">${actionBtns('DO', d.id)}</td>
            </tr>`;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalFiltered, 'logistics')}
  </div>`;
}

// ── View: Master Data ─────────────────────────────────────────────────────────
function renderMasterData() {
  // Paginate customers and suppliers separately
  let custs = [...DB.customers];
  let supps = [...DB.suppliers];
  const totalCust = custs.length;
  const totalSupp = supps.length;
  custs = applyPage(custs, 'master_cust');
  supps = applyPage(supps, 'master_supp');

  function custRow(c) {
    const orders = DB.salesOrders.filter(o => o.customer === c.name);
    return `<tr data-action="viewCustomer" data-id="${escapeHtml(c.id)}" style="cursor:pointer">
      <td class="td-p" style="font-size:.8125rem;font-weight:700">${escapeHtml(c.name)}</td>
      <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(c.phone || '—')}</td>
      <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(c.address || '—')}</td>
      <td class="td-p" style="font-size:.75rem;font-weight:700">${orders.length} SO</td>
      <td class="td-p">${actionBtns('Customer', c.id)}</td>
    </tr>`;
  }

  function suppRow(s) {
    const orders = DB.purchaseOrders.filter(o => o.supplier === s.name);
    return `<tr data-action="viewSupplier" data-id="${escapeHtml(s.id)}" style="cursor:pointer">
      <td class="td-p" style="font-size:.8125rem;font-weight:700">${escapeHtml(s.name)}</td>
      <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(s.contact || '—')}</td>
      <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(s.phone || '—')}</td>
      <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(s.address || '—')}</td>
      <td class="td-p" style="font-size:.75rem;font-weight:700">${orders.length} PO</td>
      <td class="td-p">${actionBtns('Supplier', s.id)}</td>
    </tr>`;
  }

  return `
  ${secHdr('Master Data', 'Kelola data pelanggan dan supplier')}
  ${statRow([
    { label: 'Total Pelanggan', value: String(DB.customers.length), sub: 'Data aktif' },
    { label: 'Total Supplier', value: String(DB.suppliers.length), sub: 'Rekanan pembelian' },
    { label: 'SO Terhubung', value: String(DB.salesOrders.length), sub: 'Ke pelanggan terdaftar' },
    {
      label: 'PO Terhubung',
      value: String(DB.purchaseOrders.length),
      sub: 'Ke supplier terdaftar',
    },
  ])}

  <div class="card" style="margin-bottom:16px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:.875rem;font-weight:700">Pelanggan</div>
      <button class="btn" data-action="addCustomer" style="font-size:.75rem">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Tambah Pelanggan
      </button>
    </div>
    <div class="table-wrap">
      <table>
        ${tblHdr(['Nama', 'Telepon', 'Alamat', 'Riwayat SO', 'Aksi'])}
        <tbody>
          ${
            custs.length === 0
              ? `<tr><td colspan="5" class="td-empty">Belum ada pelanggan terdaftar.</td></tr>`
              : custs.map(custRow).join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalCust, 'master_cust')}
  </div>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:.875rem;font-weight:700">Supplier</div>
      <button class="btn" data-action="addSupplier" style="font-size:.75rem">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Tambah Supplier
      </button>
    </div>
    <div class="table-wrap">
      <table>
        ${tblHdr(['Nama', 'Kontak', 'Telepon', 'Alamat', 'Riwayat PO', 'Aksi'])}
        <tbody>
          ${
            supps.length === 0
              ? `<tr><td colspan="6" class="td-empty">Belum ada supplier terdaftar.</td></tr>`
              : supps.map(suppRow).join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalSupp, 'master_supp')}
  </div>`;
}

// ── View: Settings ────────────────────────────────────────────────────────────
function renderSettings() {
  // Signed-in identity: profile name (or the account's own name) and the RBAC role.
  const account = window.erpAuth?.getCurrentUser?.() || {};
  const accountName =
    typeof account === 'string' ? account : account.displayName || account.username || account.email;
  const userName = DB.settings?.user?.name || accountName || 'Pengguna';
  const roleLabels = window.erpUsers?.roleLabels || {};
  const me = window.__ERP_USER || {};
  const userRole = roleLabels[me.role] || me.role || '';
  const initials = userName
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const backupStatus = window.erpBackup?.getBackupStatus() || { backupCount: 0 };

  const items = [
    {
      title: 'Profil Perusahaan',
      sub: 'Nama, alamat, NPWP, logo perusahaan',
      icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    },
    {
      title: 'Keamanan & Password',
      sub: 'Ganti password login sistem',
      icon: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
      action: 'changePassword',
    },
    {
      title: 'Kelola Backup',
      sub: `${backupStatus.backupCount} backup otomatis tersimpan`,
      icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
      action: 'manageBackup',
    },
    {
      title: 'Install Aplikasi',
      sub: window.erpPwa && window.erpPwa.isStandalone()
        ? 'Aplikasi sudah terpasang di perangkat ini ✓'
        : 'Pasang Nusantara ERP di homescreen / desktop',
      icon: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/><polyline points="9 9 12 12 15 9"/><line x1="12" y1="12" x2="12" y2="5"/>',
      action: 'installPwaApp',
    },
    {
      title: 'Notifikasi Sistem',
      sub:
        typeof Notification === 'undefined'
          ? 'Tidak didukung browser ini'
          : Notification.permission === 'granted'
            ? 'Aktif — alert jatuh tempo & stok rendah ✓'
            : 'Aktifkan notifikasi jatuh tempo & stok rendah',
      icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
      action: 'manageNotifications',
    },
    {
      title: 'Manajemen Pengguna',
      sub: 'Undang staff, atur role & akses',
      icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      action: 'manageUsers',
    },
    {
      title: 'Kategori Item',
      sub: 'Kelola kategori barang',
      icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
      action: 'manageItemCategories',
    },
    {
      title: 'Satuan Ukur',
      sub: 'm², ton, m³, pcs, dan lainnya',
      icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
      action: 'manageUnits',
    },
    {
      title: 'Pengaturan Pajak',
      sub: 'Status PKP, tarif PPN, PPh',
      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
      action: 'editTaxSettings',
    },
    {
      title: 'Chart of Accounts',
      sub: 'Konfigurasi akun dan pembukuan',
      icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      action: 'editAccounts',
    },
  ];

  return `
  ${secHdr('Pengaturan Umum', 'Konfigurasi sistem, perusahaan, dan akun pengguna')}
  
  <div class="card account-card">
    <span class="avatar-sm">${escapeHtml(initials)}</span>
    <div class="account-card-text">
      <div class="card-title">Masuk sebagai ${escapeHtml(userName)}</div>
      <div class="card-sub">${userRole ? `Peran ${escapeHtml(userRole)} · ` : ''}menu dan tombol mengikuti hak akses peran</div>
    </div>
    <button class="btn-ghost" data-action="logout">Keluar</button>
  </div>
  
  <div class="set-2col">
    ${items
      .map(
        s => `
      <div class="card set-row" ${s.action ? `data-action="${s.action}"` : `data-action="openSettings" data-title="${escapeHtml(s.title)}" data-sub="${escapeHtml(s.sub)}"`}>
        <div class="set-ico">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${s.icon}</svg>
        </div>
        <div style="flex:1">
          <div style="font-size:.8125rem;font-weight:700">${escapeHtml(s.title)}</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:2px">${escapeHtml(s.sub)}</div>
        </div>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`
      )
      .join('')}
    <div class="card set-row" data-action="exportBackup" style="cursor:pointer">
      <div class="set-ico" style="background:var(--info-bg)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </div>
      <div style="flex:1">
        <div style="font-size:.8125rem;font-weight:700">Ekspor Backup JSON</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:2px">Unduh seluruh data ERP sebagai file JSON</div>
      </div>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
    <div class="card set-row" style="cursor:pointer;position:relative">
      <div class="set-ico" style="background:var(--success-bg)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      </div>
      <div style="flex:1">
        <div style="font-size:.8125rem;font-weight:700">Impor Backup JSON</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:2px">Pulihkan data dari file backup sebelumnya</div>
      </div>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      <input type="file" accept=".json" id="importBackupInput" style="position:absolute;inset:0;opacity:0;cursor:pointer" data-action="importBackup">
    </div>
    <div class="card set-row" data-action="syncToFirebase" style="border-color:var(--info-bg);cursor:pointer">
      <div class="set-ico" style="background:var(--info-bg)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
      </div>
      <div style="flex:1">
        <div style="font-size:.8125rem;font-weight:700;color:var(--info)">Sinkronisasi ke Firebase</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:2px">Upload data lokal ke cloud (Firestore)</div>
      </div>
      <span style="font-size:.75rem;padding:2px 8px;border-radius:99px;font-weight:600;background:${window.__nsaDataMode === 'firestore' ? 'var(--success-bg)' : 'var(--warning-bg)'};color:${window.__nsaDataMode === 'firestore' ? 'var(--success)' : 'var(--warning)'}">${window.__nsaDataMode === 'firestore' ? 'Cloud' : 'Lokal'}</span>
    </div>
    <div class="card set-row" data-action="resetDB" style="border-color:var(--danger-light)">
      <div class="set-ico" style="background:var(--danger-light)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.44"/></svg>
      </div>
      <div style="flex:1">
        <div style="font-size:.8125rem;font-weight:700;color:var(--danger)">Reset Data</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:2px">Kembalikan semua data ke kondisi awal</div>
      </div>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
  </div>`;
}

// ── Charts ────────────────────────────────────────────────────────────────────
// FIX: Add debouncing to prevent rapid re-rendering on quick navigation
let _chartInitTimer = null;

// ── Filter System ─────────────────────────────────────────────────────────────
// FIX: Use AbortController to prevent memory leak from stacking event listeners
let _filterCloseCtrl = null;

// Mobile (≤768px) renders .filter-drop as a position:fixed bottom sheet. But the
// drop lives inside a .card whose backdrop-filter makes the card the containing
// block for fixed descendants, so the sheet would anchor to the card and strand
// above the viewport (same root cause as the topbar menus, fixed 2026-06-13 by
// re-parenting to <body>; see nav.js _toggleUserMenu). So on mobile we "park" the
// drop on <body> while open and return it to its card slot on close. On desktop
// the drop is position:absolute and anchors to its .filter-wrap (a closer
// positioned ancestor than the card), so no re-parenting is needed there.
function _filterMobile() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function _parkFilterDrop(drop) {
  if (!_filterMobile() || drop._homeParent) {
    return;
  }
  drop._homeParent = drop.parentNode;
  drop._homeNext = drop.nextSibling;
  document.body.appendChild(drop);
}

// Return a parked drop to its original card slot. _homeParent may be detached if
// the view re-rendered while the drop was open; appending to a detached node just
// drops it out of the document (no visible orphan), and the fresh render owns a
// new in-card drop.
function _unparkFilterDrop(drop) {
  if (!drop._homeParent) {
    return;
  }
  const parent = drop._homeParent;
  const next = drop._homeNext;
  drop._homeParent = null;
  drop._homeNext = null;
  if (next && next.parentNode === parent) {
    parent.insertBefore(drop, next);
  } else {
    parent.appendChild(drop);
  }
}

function _closeFilterDrop(drop) {
  drop.classList.remove('open');
  _unparkFilterDrop(drop);
}

// Return any drops parked on <body> to their home card (only parked drops are
// direct children of body — in-card drops are nested under .filter-wrap). Called
// on navigation/re-render paths so a parked drop never lingers as an orphan or
// collides on id with a freshly rendered in-card drop. We *unpark* rather than
// remove: nav.js caches rendered views (_renderedViews) and skips re-rendering on
// revisit, so destroying the drop would leave the cached card permanently without
// its filter. _unparkFilterDrop handles a detached home (e.g. a view that did get
// re-rendered) by simply dropping the element out of the document.
function _cleanupParkedFilters() {
  document.querySelectorAll('body > .filter-drop').forEach(d => {
    d.classList.remove('open');
    if (d._homeParent) {
      _unparkFilterDrop(d);
    } else {
      d.remove();
    }
  });
  if (_filterCloseCtrl) {
    _filterCloseCtrl.abort();
    _filterCloseCtrl = null;
  }
}

function toggleFilter(type) {
  document.querySelectorAll('.filter-drop.open').forEach(d => {
    if (d.id !== `filter-${type}`) {
      _closeFilterDrop(d);
    }
  });

  const drop = document.getElementById(`filter-${type}`);
  if (!drop) {
    return;
  }

  if (drop.classList.contains('open')) {
    _closeFilterDrop(drop);
    if (_filterCloseCtrl) {
      _filterCloseCtrl.abort();
      _filterCloseCtrl = null;
    }
    return;
  }

  const opts = FILTER_OPTIONS[type] || [];
  drop.innerHTML = opts
    .map(
      ([val, label]) =>
        `<button class="filter-option${filters[type] === val ? ' active' : ''}"
         data-action="setFilter" data-type="${type}" data-val="${escapeHtml(val)}">
       ${escapeHtml(label)}
     </button>`
    )
    .join('');

  drop.classList.add('open');
  _parkFilterDrop(drop);

  // Cancel any stale outside-click handler from a previous open cycle
  if (_filterCloseCtrl) {
    _filterCloseCtrl.abort();
    _filterCloseCtrl = null;
  }

  _filterCloseCtrl = new AbortController();
  const { signal } = _filterCloseCtrl;

  setTimeout(() => {
    function closeOutside(e) {
      const insideDrop = e.target.closest(`#filter-${type}`);
      const insideBtn = e.target.closest(`[data-action="toggleFilter"][data-type="${type}"]`);
      if (!insideDrop && !insideBtn) {
        _closeFilterDrop(drop);
        if (_filterCloseCtrl) {
          _filterCloseCtrl.abort();
          _filterCloseCtrl = null;
        }
      }
    }
    document.addEventListener('click', closeOutside, { signal });
  }, 50);
}

function setFilter(type, val) {
  // The clicked option may live in a drop parked on <body>; drop it before the
  // re-render recreates the in-card drop, so no orphan/id-collision lingers.
  _cleanupParkedFilters();
  filters[type] = val;
  pageState[type] = 1; // reset to first page on filter change
  refreshActiveView();
}

// ── Global Event Delegation ───────────────────────────────────────────────────
document.addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) {
    return;
  }

  // FIX #6: Search results carry a data-nav attribute pointing to the view that
  // owns the record. Navigate there first so the correct view is rendered behind
  // the detail modal, and clear the search field so the user doesn't need to.
  if (btn.dataset.nav) {
    navigate(btn.dataset.nav);
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.value = '';
      const clearBtn = document.querySelector('#search-wrap button[aria-label]');
      if (clearBtn) {
        clearBtn.style.display = 'none';
      }
    }
  }

  const action = btn.dataset.action;
  const id = btn.dataset.id;
  const type = btn.dataset.type;
  const val = btn.dataset.val;
  const title = btn.dataset.title;
  const sub = btn.dataset.sub;
  const idx = btn.dataset.idx;
  const col = btn.dataset.col;

  switch (action) {
    // ── Modal ─────────────────────────────────────────────────────────────────
    case 'closeModal':
      closeModal();
      break;

    // ── Navigation ────────────────────────────────────────────────────────────
    case 'navSales':
      navigate('sales');
      break;

    // ── Sales Orders ──────────────────────────────────────────────────────────
    case 'addSO':
      showAddSO();
      break;
    case 'viewSO':
      viewSO(id);
      break;
    // Invoice documents open through the lazy invoice module; before it has
    // loaded, window.viewInvoiceDoc is a stub that loads it first.
    case 'invView':
      if (typeof window.viewInvoiceDoc === 'function' && type) {
        window.viewInvoiceDoc(type, id);
      }
      break;
    case 'editSO':
      editSO(id);
      break;
    case 'deleteSO':
      deleteSO(id);
      break;

    // ── Purchase Orders ───────────────────────────────────────────────────────
    case 'addPO':
      showAddPO();
      break;
    case 'viewPO':
      viewPO(id);
      break;
    case 'editPO':
      editPO(id);
      break;
    case 'deletePO':
      deletePO(id);
      break;

    // ── Inventory ─────────────────────────────────────────────────────────────
    case 'addItem':
      showAddItem();
      break;
    case 'viewItem':
      viewItem(id);
      break;
    case 'stockCard':
      showStockCard(id);
      break;
    case 'editItem':
      editItem(id);
      break;
    case 'deleteItem':
      deleteItem(id);
      break;

    // ── Delivery Orders ───────────────────────────────────────────────────────
    case 'addDO':
      showAddDO();
      break;
    case 'openPickupOrders':
      if (window.NSAMenu) {
        window.NSAMenu.handle('pickups', 'PO Pengambilan');
      }
      break;
    case 'viewDO':
      viewDO(id);
      break;
    case 'editDO':
      editDO(id);
      break;
    case 'deleteDO':
      deleteDO(id);
      break;

    // FIX #2: Fleet & Expedition CRUD — previously defined in erp-crud.js but
    // never wired up to any UI action. Now routed from the Logistics view.
    case 'addFleet':
      showAddFleet();
      break;
    case 'editFleet':
      editFleet(id);
      break;
    case 'deleteFleet':
      deleteFleet(id);
      break;
    case 'addExpedition':
      showAddExpedition();
      break;
    case 'editExpedition':
      editExpedition(id);
      break;
    case 'deleteExpedition':
      deleteExpedition(id);
      break;

    // ── Customers (Master Data) ───────────────────────────────────────────────
    case 'addCustomer':
      showAddCustomer();
      break;
    case 'viewCustomer':
      viewCustomer(id);
      break;
    case 'custStatement':
      showPartyStatement('customer', id);
      break;
    case 'editCustomer':
      editCustomer(id);
      break;
    case 'deleteCustomer':
      deleteCustomer(id);
      break;

    // ── Suppliers (Master Data) ───────────────────────────────────────────────
    case 'addSupplier':
      showAddSupplier();
      break;
    case 'viewSupplier':
      viewSupplier(id);
      break;
    case 'suppStatement':
      showPartyStatement('supplier', id);
      break;
    case 'editSupplier':
      editSupplier(id);
      break;
    case 'deleteSupplier':
      deleteSupplier(id);
      break;

    // ── Filters ───────────────────────────────────────────────────────────────
    case 'toggleFilter':
      toggleFilter(type);
      break;
    case 'setFilter':
      setFilter(type, val);
      break;
    // FIX (clear filter): dismiss an active filter without opening the dropdown
    case 'clearFilter':
      e.stopPropagation(); // prevent the click from re-opening the dropdown
      filters[type] = 'all';
      pageState[type] = 1;
      refreshActiveView();
      break;

    // ── Sorting ───────────────────────────────────────────────────────────────
    // FIX (sortable tables): route column header clicks to sortCol()
    case 'sortCol':
      sortCol(type, col);
      break;

    // ── Export CSV ────────────────────────────────────────────────────────────
    // FIX (export CSV)
    case 'exportCSV':
      exportCSV(type);
      break;
    case 'exportXLSX':
      exportXLSX(type);
      break;
    case 'importXLSX':
      if (typeof window.importModuleExcel === 'function') {
        window.importModuleExcel(type);
      }
      break;
    case 'printSummary':
      if (typeof window.printOrderSummary === 'function') {
        window.printOrderSummary(type);
      }
      break;

    // ── Notifications ─────────────────────────────────────────────────────────
    case 'markAllRead':
      markAllRead();
      break;
    case 'readNotif':
      readNotif(id);
      break;

    // ── Finance reports ───────────────────────────────────────────────────────
    case 'openFinance': {
      const r = _financeReports[parseInt(idx, 10)];
      if (r) {
        showFinanceDetail(r.title, r.items);
      }
      break;
    }
    case 'openReport': {
      const r = _reportCatalog[parseInt(idx, 10)];
      if (r) {
        showFinanceDetail(r.title, r.items);
      }
      break;
    }

    // ── Settings panels ───────────────────────────────────────────────────────────
    case 'openSettings':
      showSettingPanel(title, sub);
      break;
    case 'editTaxSettings':
      showTaxSettings();
      break;
    case 'manageUsers':
      showUserManagement();
      break;
    case 'manageItemCategories':
      showItemCategories();
      break;
    case 'manageUnits':
      showUnitSettings();
      break;
    case 'editAccounts':
      editAccounts();
      break;
    case 'resetDB':
      resetDB();
      break;

    // ── Firebase Sync ─────────────────────────────────────────────────────────
    case 'syncToFirebase': {
      if (window.__nsaDataMode === 'firestore') {
        showToast('Data sudah tersimpan di Firebase Cloud', 'info');
        break;
      }
      if (
        !confirm(
          'Upload semua data lokal ke Firebase Firestore?\n\nProses ini akan menimpa data cloud yang ada.'
        )
      )
        break;
      openModal(
        'Sinkronisasi ke Firebase',
        `
        <div id="sync-fb-body" style="text-align:center;padding:20px 0">
          <div class="empty-state-icon" style="margin:0 auto 12px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg></div>
          <div style="font-size:.875rem;font-weight:600;margin-bottom:8px">Mengupload data ke Firebase...</div>
          <div style="font-size:.75rem;color:var(--muted);margin-bottom:16px" id="sync-fb-status">Memulai...</div>
          <div style="background:var(--bg);border-radius:99px;height:6px;overflow:hidden">
            <div id="sync-fb-bar" style="height:100%;background:var(--primary);width:0%;transition:width .3s;border-radius:99px"></div>
          </div>
        </div>`
      );
      const collections = [
        'salesOrders',
        'purchaseOrders',
        'inventoryItems',
        'deliveryOrders',
        'customers',
        'suppliers',
        'paymentLogs',
        'notifications',
        'fleet',
        'expedition',
        'warehouses',
        'journals',
        'accountsChart',
        'itemAdjustments',
        'itemTransfers',
        'salesInvoices',
        'purchaseInvoices',
        'salesReceipts',
        'purchasePayments',
        'budgets',
        'employees',
        'payrollRuns',
      ];
      const total = collections.length;
      let done = 0;
      const bar = document.getElementById('sync-fb-bar');
      const statusEl = document.getElementById('sync-fb-status');
      try {
        await window.migrateLocalToFirestore(({ collection, phase }) => {
          done++;
          const pct = Math.round((done / (total * 2)) * 100);
          if (bar) bar.style.width = Math.min(pct, 95) + '%';
          if (statusEl)
            statusEl.textContent =
              (phase === 'clearing' ? 'Membersihkan: ' : 'Mengupload: ') + collection;
        });
        if (bar) bar.style.width = '100%';
        const body = document.getElementById('sync-fb-body');
        if (body)
          body.innerHTML = `
          <div class="empty-state-icon" style="margin:0 auto 12px;color:var(--success)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div style="font-size:.875rem;font-weight:600;margin-bottom:6px;color:var(--success)">Sinkronisasi Berhasil!</div>
          <div style="font-size:.75rem;color:var(--muted)">Data tersimpan di Firebase Cloud. Dashboard akan reload.</div>`;
        showToast('Data berhasil disinkronisasi ke Firebase', 'success');
        setTimeout(() => {
          closeModal();
          location.reload();
        }, 2000);
      } catch (e) {
        const body = document.getElementById('sync-fb-body');
        if (body)
          body.innerHTML = `
          <div class="empty-state-icon" style="margin:0 auto 12px;color:var(--danger)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
          <div style="font-size:.875rem;font-weight:600;margin-bottom:6px;color:var(--danger)">Gagal Sinkronisasi</div>
          <div style="font-size:.75rem;color:var(--muted)">${escapeHtml(e.message)}</div>`;
        showToast('Gagal: ' + e.message, 'danger');
      }
      break;
    }

    // ── Security & Authentication ─────────────────────────────────────────────
    case 'logout':
      if (confirm('Keluar dari sistem?')) {
        window.erpAuth.logout();
      }
      break;

    // ── Pagination ────────────────────────────────────────────────────────────
    case 'pageNav': {
      const v = btn.dataset.view;
      const p = parseInt(btn.dataset.page, 10);
      console.log('[Pagination] Clicked:', { view: v, page: p, currentPage: pageState[v] });

      if (!v) {
        console.error('[Pagination] No view specified');
        break;
      }

      if (!p || p < 1) {
        console.error('[Pagination] Invalid page number:', p);
        break;
      }

      pageState[v] = p;
      refreshActiveView();
      break;
    }

    // ── Assets ────────────────────────────────────────────────────────────────
    case 'addAsset':
      showAddAsset();
      break;
    case 'viewAsset':
      viewAsset(id);
      break;
    case 'editAsset':
      editAsset(id);
      break;
    case 'deleteAsset':
      deleteAsset(id);
      break;
    case 'addAssetCategory':
      showAddAssetCategory();
      break;
    case 'addAssetFiscalCategory':
      showAddAssetFiscalCategory();
      break;
    case 'addAssetTransfer':
      showAddAssetTransfer();
      break;
    case 'addAssetDisposal':
      showAddAssetDisposal();
      break;

    // ── Date range filter ─────────────────────────────────────────────────────
    case 'clearDateFilter':
      dateFilters[type] = { from: '', to: '' };
      refreshActiveView();
      break;

    // ── Print ─────────────────────────────────────────────────────────────────
    case 'printSO': {
      const o = DB.salesOrders.find(o => o.id === id);
      if (o) {
        printDocument('SO', o);
      }
      break;
    }
    case 'printPO': {
      const o = DB.purchaseOrders.find(o => o.id === id);
      if (o) {
        printDocument('PO', o);
      }
      break;
    }
    case 'printDO': {
      const o = DB.deliveryOrders.find(o => o.id === id);
      if (o) {
        printDocument('DO', o);
      }
      break;
    }

    // ── Backup / Restore ──────────────────────────────────────────────────────
    case 'exportBackup': {
      const json = JSON.stringify(DB, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `erp-backup-${today()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Backup berhasil diunduh', 'success');
      break;
    }

    // ── Bulk selection (Sales) ───────────────────────────────────────────────
    case 'clearSOSelection':
      if (typeof window.soSelection !== 'undefined' && window.soSelection) {
        window.soSelection.clear();

        // Force uncheck all checkboxes immediately
        document.querySelectorAll('.so-check').forEach(cb => {
          cb.checked = false;
        });

        // Update bulk bar
        if (typeof window.updateBulkBar === 'function') {
          window.updateBulkBar();
        }

        // Then navigate to refresh the view
        navigate(activeView);
      } else {
        console.warn('soSelection not found');
      }
      break;
    case 'bulkSOStatus':
      if (typeof window.bulkSOStatus === 'function') {
        window.bulkSOStatus(btn.dataset.status);
      } else if (typeof bulkSOStatus === 'function') {
        bulkSOStatus(btn.dataset.status);
      }
      break;

    default:
      break;
  }
});

// ── Global Search ─────────────────────────────────────────────────────────────
// Called by the search-input listeners in _initViewListeners(). Searches the
// in-memory DB across the main collections and renders grouped, clickable results
// in a modal. Each result row carries data-nav (view to render behind the modal)
// plus data-action/data-id (the detail handler) — both consumed by the global
// click delegation defined above. Previously this function was referenced but
// never defined, so typing in the search bar threw a ReferenceError and did
// nothing.
function handleSearch(query) {
  const q = String(query == null ? '' : query)
    .toLowerCase()
    .trim();
  const open = window.openModal || (typeof openModal === 'function' ? openModal : null);
  if (!open) {
    return;
  }
  if (q.length < 2) {
    return;
  }

  const esc = window.escapeHtml || (s => String(s == null ? '' : s));
  const money = v => (typeof window.idrFull === 'function' ? window.idrFull(v) : 'Rp ' + (v || 0));
  const db = window.DB || {};
  const LIMIT = 8;
  const match = (...vals) => vals.some(v => v != null && String(v).toLowerCase().includes(q));

  const groups = [];
  // A user narrowed by Akses menu (rbac.js) only finds records of the modules
  // they may use; without a list every module is allowed.
  const rbac = window.RBAC;
  const allowed = mods =>
    !rbac || typeof rbac.moduleAllowed !== 'function' || mods.some(m => rbac.moduleAllowed(m));
  // Documents store the party name in `customer` / `supplier` (older imports used *Name).
  const party = (d, key) => d[key] || d[key + 'Name'] || '';
  const docGroup = (label, list, cfg) => {
    if (!allowed(cfg.modules)) {
      return;
    }
    const rows = (list || [])
      .filter(d => match(d.number, d.id, party(d, cfg.party), d.notes, d.note, d.sourceNumber))
      .slice(0, LIMIT)
      .map(d => ({
        action: cfg.action,
        type: cfg.type,
        nav: cfg.nav,
        id: d.id,
        title: docNum(d.number, d.id),
        sub: [party(d, cfg.party), d.date].filter(Boolean).join(' · '),
        right: cfg.amount === false ? '' : money(d.total != null ? d.total : d.amount),
      }));
    if (rows.length) {
      groups.push({ label, rows });
    }
  };

  docGroup('Pesanan Penjualan', db.salesOrders, {
    action: 'viewSO',
    nav: 'sales',
    party: 'customer',
    modules: ['sales'],
  });
  docGroup('Faktur Penjualan', db.salesInvoices, {
    action: 'invView',
    type: 'SI',
    nav: 'invoices',
    party: 'customer',
    modules: ['sales'],
  });
  docGroup('Surat Jalan', db.deliveryOrders, {
    action: 'viewDO',
    nav: 'logistics',
    party: 'customer',
    amount: false,
    modules: ['sales'],
  });
  docGroup('Pesanan Pembelian', db.purchaseOrders, {
    action: 'viewPO',
    nav: 'purchase',
    party: 'supplier',
    modules: ['purchases'],
  });
  docGroup('Faktur Pembelian', db.purchaseInvoices, {
    action: 'invView',
    type: 'PI',
    nav: 'invoices',
    party: 'supplier',
    modules: ['purchases'],
  });

  const items = (db.inventoryItems || [])
    .filter(i => match(i.name, i.sku, i.id, i.category))
    .slice(0, LIMIT)
    .map(i => ({
      action: 'viewItem',
      nav: 'inventory',
      id: i.id,
      title: i.name || i.id,
      sub: [i.sku, i.category].filter(Boolean).join(' · '),
      right: 'Stok: ' + (Number(i.stock) || 0) + ' ' + (i.unit || ''),
    }));
  if (items.length && allowed(['inventory'])) {
    groups.push({ label: 'Barang', rows: items });
  }

  const customers = (db.customers || [])
    .filter(c => match(c.name, c.phone, c.email, c.id))
    .slice(0, LIMIT)
    .map(c => ({
      action: 'viewCustomer',
      nav: 'master',
      id: c.id,
      title: c.name || c.id,
      sub: [c.phone, c.email].filter(Boolean).join(' · '),
      right: '',
    }));
  if (customers.length && allowed(['sales', 'master'])) {
    groups.push({ label: 'Pelanggan', rows: customers });
  }

  const suppliers = (db.suppliers || [])
    .filter(s => match(s.name, s.phone, s.email, s.id))
    .slice(0, LIMIT)
    .map(s => ({
      action: 'viewSupplier',
      nav: 'master',
      id: s.id,
      title: s.name || s.id,
      sub: [s.phone, s.email].filter(Boolean).join(' · '),
      right: '',
    }));
  if (suppliers.length && allowed(['purchases', 'master'])) {
    groups.push({ label: 'Supplier', rows: suppliers });
  }

  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  let body;
  if (total === 0) {
    body = `<div class="empty-inline">
      Tidak ada hasil untuk "<strong>${esc(query)}</strong>".<br>
      Coba nomor dokumen, nama pelanggan atau supplier, atau nama barang.
    </div>`;
  } else {
    body = groups
      .map(g => {
        const rows = g.rows
          .map(
            r => `<button type="button" class="search-results-item"
              data-action="${r.action}" data-nav="${r.nav}" data-id="${esc(r.id)}"${r.type ? ` data-type="${r.type}"` : ''}
              style="width:100%;border:0;background:none;font:inherit;color:inherit;text-align:left">
              <span style="flex:1;min-width:0">
                <span class="t-strong" style="display:block;font-size:.8125rem">${esc(r.title)}</span>
                <span class="t-muted" style="display:block;font-size:.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.sub)}</span>
              </span>
              <span class="t-muted t-num" style="flex-shrink:0;font-size:.78125rem">${esc(r.right)}</span>
            </button>`
          )
          .join('');
        return `<div class="detail-section" style="margin-top:0;margin-bottom:12px">
          <div class="detail-section-title">${esc(g.label)}</div>
          ${rows}
        </div>`;
      })
      .join('');
  }

  open(`Hasil pencarian: "${query}"`, body, '', true);
}

// ── Initialisation ────────────────────────────────────────────────────────────
// NOTE: loadDB() and navigate('dashboard') are called by main.js (ES module).
// This script is loaded as a classic script AFTER DOMContentLoaded has fired,
// so we run init code immediately (no DOMContentLoaded wrapper needed).
// We do NOT call loadDB() or navigate() again to avoid double-init.

(function _initViewListeners() {
  // ── Search: Enter key + 400 ms debounce on typing ──────────────────────────
  // FIX (clear search): inject a × clear button next to the search input so
  // the user can reset the field without reaching for the keyboard.
  const searchBox = document.getElementById('search-wrap');
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    // Inject clear button
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.style.cssText = [
      'display:none',
      'background:none',
      'border:none',
      'cursor:pointer',
      'color:var(--muted)',
      'font-size:.9375rem',
      'line-height:1',
      'padding:0 2px',
      'flex-shrink:0',
    ].join(';');
    clearBtn.setAttribute('aria-label', 'Hapus pencarian');
    clearBtn.textContent = '×';
    if (searchBox) searchBox.appendChild(clearBtn);

    function syncClearBtn() {
      clearBtn.style.display = searchInput.value ? 'block' : 'none';
    }

    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      syncClearBtn();
      searchInput.focus();
    });

    let debounceTimer;

    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        clearTimeout(debounceTimer);
        handleSearch(e.target.value.trim());
      }
    });

    searchInput.addEventListener('input', e => {
      syncClearBtn();
      clearTimeout(debounceTimer);
      const q = e.target.value.trim();
      if (q.length >= 3) {
        debounceTimer = setTimeout(() => handleSearch(q), 400);
      }
    });

    // Global "/" shortcut focuses search (ignored while typing in a field).
    document.addEventListener('keydown', e => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || document.activeElement?.isContentEditable) {
        return;
      }
      e.preventDefault();
      searchInput.focus();
    });
  }

  // ── Notification bell ───────────────────────────────────────────────────────
  const notifBtn = document.querySelector('.notif');
  if (notifBtn) {
    notifBtn.addEventListener('click', e => {
      if (e.target.closest('[data-action]')) {
        return;
      }
      if (e.target.closest('.notif-panel')) {
        return;
      }
      toggleNotifPanel();
    });
  }

  // ── Date filter inputs (change event, not click) ────────────────────────────
  document.addEventListener('change', e => {
    const inp = e.target;
    const el = e.target;

    // Date filter handlers (from erp-view.js)
    if (inp.dataset.action === 'setDateFrom') {
      const v = inp.dataset.view;
      if (dateFilters[v]) {
        dateFilters[v].from = inp.value;
        pageState[v] = 1;
        refreshActiveView();
      }
    } else if (inp.dataset.action === 'setDateTo') {
      const v = inp.dataset.view;
      if (dateFilters[v]) {
        dateFilters[v].to = inp.value;
        pageState[v] = 1;
        refreshActiveView();
      }
    } else if (inp.dataset.action === 'importBackup') {
      // Same path as "Kelola Backup" (src/core/backup.js importFromFile): it
      // validates and stores the data; the page then reloads from it.
      const file = inp.files && inp.files[0];
      inp.value = '';
      if (!file) {
        return;
      }
      if (!window.erpBackup || typeof window.erpBackup.importFromFile !== 'function') {
        showToast('Impor backup belum siap. Coba lagi setelah halaman selesai dimuat.', 'warning');
        return;
      }
      if (!confirm('Impor backup akan menggantikan seluruh data yang ada. Lanjutkan?')) {
        return;
      }
      window.erpBackup
        .importFromFile(file)
        .then(() => {
          showToast('Backup berhasil diimpor. Halaman akan dimuat ulang.', 'success');
          setTimeout(() => window.location.reload(), 1500);
        })
        .catch(err => {
          showToast('Gagal mengimpor: ' + (err && err.message ? err.message : err), 'danger');
        });
    }

    // Inline status and checkbox handlers (from erp-patch.js) - merged to avoid duplicate listeners
    if (el.dataset && el.dataset.action) {
      const action = el.dataset.action;
      const id = el.dataset.id;

      if (action === 'inlineSOStatus') {
        if (typeof inlineSOStatus === 'function') {
          inlineSOStatus(id, el.value);
        }
      } else if (action === 'toggleSOCheck') {
        if (typeof soSelection !== 'undefined') {
          if (el.checked) {
            soSelection.add(id);
          } else {
            soSelection.delete(id);
          }
          if (typeof updateBulkBar === 'function') {
            updateBulkBar();
          }
        }
      } else if (action === 'checkAllSO') {
        if (typeof soSelection !== 'undefined') {
          const checked = el.checked;
          document.querySelectorAll('.so-check').forEach(cb => {
            const cbId = cb.dataset.id;
            if (checked) {
              soSelection.add(cbId);
            } else {
              soSelection.delete(cbId);
            }
            cb.checked = checked;
          });
          if (typeof updateBulkBar === 'function') {
            updateBulkBar();
          }
        }
      }
    }
  });

  if (typeof updateNotifDot === 'function') updateNotifDot();
})();

// ═══════════════════════════════════════════════════════════════════════════════
// MERGED FROM erp-patch.js (2026-06-10) — view-layer pieces
// renderSales (checkbox column + inline status + bulk bar) and the Hutang
// Aging section (called directly from renderFinance above, replacing the old
// monkey-patch wrapper).
// ═══════════════════════════════════════════════════════════════════════════════
// § 11  OVERRIDE: renderSales — checkbox column + inline status + bulk bar
// ════════════════════════════════════════════════════════════════════════════════

function renderSales() {
  const f = filters.sales;
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;

  let orders = f === 'all' ? DB.salesOrders : DB.salesOrders.filter(o => o.status === f);
  orders = applyDateFilter(orders, 'sales');
  orders = applySorted(orders, 'sales');

  const _isInvoice = o => !o._type || o._type === 'invoice';
  const invoices = DB.salesOrders.filter(o => _isInvoice(o) && o.status !== 'Draft' && o.status !== 'Cancelled');
  const thisMthOrders = invoices.filter(o => o.date && o.date.startsWith(thisMonth));
  const totalVal = invoices.reduce((s, o) => s + (o.amount || 0), 0);
  const thisMthVal = thisMthOrders.reduce((s, o) => s + (o.amount || 0), 0);
  const pendingCnt = invoices.filter(o => o.status === 'Confirmed').length;
  const unpaidVal = invoices
    .filter(o => o.status === 'Confirmed' || o.status === 'Delivered')
    .reduce((s, o) => s + (o.owing != null ? o.owing : Math.max(0, (o.amount || 0) - (o.paid || 0))), 0);

  const totalFiltered = orders.length;
  const paged = applyPage(orders, 'sales');

  // "Select all on this page" state
  const allPageChecked = paged.length > 0 && paged.every(o => soSelection.has(o.id));

  const bulkBar = `
  <div id="bulkBar" style="display:${soSelection.size > 0 ? 'flex' : 'none'};
    align-items:center;gap:8px;flex-wrap:wrap;padding:10px 14px;
    background:var(--bg);border:1.5px solid var(--primary);border-radius:10px;
    margin-bottom:10px">
    <span id="bulkCount" style="font-size:.75rem;font-weight:700;color:var(--primary)">
      ${soSelection.size} SO dipilih
    </span>
    <div style="flex:1"></div>
    <span style="font-size:.75rem;color:var(--muted)">Ubah semua ke:</span>
    ${SO_STATUSES.map(
      ([v, l]) =>
        `<button class="btn-ghost" data-action="bulkSOStatus" data-status="${v}"
         style="font-size:.75rem;padding:4px 10px">${escapeHtml(l)}</button>`
    ).join('')}
    <button class="btn-ghost" data-action="clearSOSelection"
      style="font-size:.75rem;padding:4px 10px;color:var(--danger)">✕ Batal</button>
  </div>`;

  const tableRows =
    paged.length === 0
      ? emptyRow(7, 'sales')
      : paged
          .map(o => {
            const checked = soSelection.has(o.id) ? 'checked' : '';
            return `<tr data-action="viewSO" data-id="${escapeHtml(o.id)}">
          <td style="padding:7px 8px;text-align:center;width:32px">
            <input type="checkbox" class="so-check" data-action="toggleSOCheck"
              data-id="${escapeHtml(o.id)}" ${checked} style="cursor:pointer;width:14px;height:14px">
          </td>
          <td class="td-p" style="font-size:.75rem;font-weight:700;color:var(--primary)">${escapeHtml(docNum(o.number, o.id))}</td>
          <td class="td-p" style="font-size:.8125rem;font-weight:600">${escapeHtml(o.customer)}</td>
          <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(o.date)}</td>
          <td class="td-p" style="font-size:.8125rem;font-weight:800">${idr(o.amount)}</td>
          <td class="td-p" style="padding:4px 8px">
            <select class="form-select" data-action="inlineSOStatus" data-id="${escapeHtml(o.id)}"
              style="font-size:.75rem;padding:4px 8px;min-width:130px;cursor:pointer">
              ${SO_STATUSES.filter(
                ([v]) =>
                  v === o.status ||
                  (window.DocEngine && window.DocEngine.canTransition('SO', o.status, v))
              )
                .map(
                  ([v, l]) =>
                    `<option value="${v}"${o.status === v ? ' selected' : ''}>${escapeHtml(l)}</option>`
                )
                .join('')}
            </select>
          </td>
          <td class="td-p">${actionBtns('SO', o.id)}</td>
        </tr>`;
          })
          .join('');

  return `
  ${secHdr('Pesanan Penjualan', 'Sales order dari pelanggan beserta pengiriman, faktur, dan pembayarannya', 'Buat SO', 'addSO')}
  ${statRow([
    { label: 'SO Bulan Ini', value: String(thisMthOrders.length), sub: monthLabel },
    { label: 'Nilai Bulan Ini', value: idr(thisMthVal), sub: `Total all-time: ${idr(totalVal)}` },
    {
      label: 'Menunggu Pengiriman',
      value: `${pendingCnt} SO`,
      sub: 'Status Confirmed',
      color: 'var(--warning)',
    },
    {
      label: 'Piutang Belum Lunas',
      value: idr(unpaidVal),
      sub: 'Confirmed + Delivered',
      color: 'var(--danger)',
    },
  ])}
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:.875rem;font-weight:700">Daftar Sales Order</div>
      <div style="display:flex;align-items:center;gap:8px">
        ${summaryBtn('sales')}
        ${importBtn('sales')}
        ${exportBtn('sales')}
        ${filterBtn('sales')}
      </div>
    </div>
    <div style="margin-bottom:12px">${dateFilterBar('sales')}</div>
    ${bulkBar}
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:32px;padding:8px;text-align:center">
            <input type="checkbox" id="checkAllSO" data-action="checkAllSO"
              ${allPageChecked ? 'checked' : ''}
              style="cursor:pointer;width:14px;height:14px"
              title="Pilih/batalkan semua di halaman ini">
          </th>
          ${sortTh('No. SO', 'sales', 'id')}
          ${sortTh('Pelanggan', 'sales', 'customer')}
          ${sortTh('Tanggal', 'sales', 'date')}
          ${sortTh('Total', 'sales', 'amount')}
          <th>Status</th>
          <th>Aksi</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    ${pagerHTML(totalFiltered, 'sales')}
  </div>`;
}

// ════════════════════════════════════════════════════════════════════════════════
// § 12  HUTANG AGING — append to Finance view
// ════════════════════════════════════════════════════════════════════════════════

// Receivable (sales) / payable (purchases) aging from Balances — the same open
// items and balances as invoices, party statements and the dashboard: active
// invoices plus delivered/received orders that are not invoiced yet, bucketed by
// days past the due date.
function _agingSection(side) {
  const B = window.Balances;
  if (!B) {
    return '';
  }
  const isSales = side === 'sales';
  const s = B.summary(side);
  const bucketOf = it =>
    !it.overdue
      ? 'current'
      : it.daysOverdue <= 30
        ? 'd1_30'
        : it.daysOverdue <= 60
          ? 'd31_60'
          : it.daysOverdue <= 90
            ? 'd61_90'
            : 'd90plus';
  const counts = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  s.items.forEach(it => {
    counts[bucketOf(it)]++;
  });
  const BUCKETS = [
    ['current', 'Belum jatuh tempo'],
    ['d1_30', 'Terlambat 1–30 hari'],
    ['d31_60', 'Terlambat 31–60 hari'],
    ['d61_90', 'Terlambat 61–90 hari'],
    ['d90plus', 'Terlambat > 90 hari'],
  ];
  const bucketsHtml = BUCKETS.map(
    ([key, label]) => `<div class="aging-bucket${key !== 'current' && s.buckets[key] > 0 ? ' is-late' : ''}">
      <div class="aging-label">${label}</div>
      <div class="aging-value">${idr(s.buckets[key])}</div>
      <div class="aging-count">${counts[key]} dokumen</div>
    </div>`
  ).join('');
  const sorted = s.items
    .slice()
    .sort((a, b) => b.daysOverdue - a.daysOverdue || String(a.dueDate).localeCompare(String(b.dueDate)));
  const rowsHtml = sorted
    .map(it => {
      const open =
        it.docType === 'SI' || it.docType === 'PI'
          ? `data-action="invView" data-type="${it.docType}"`
          : `data-action="${it.docType === 'SO' ? 'viewSO' : 'viewPO'}"`;
      return `<tr class="row-link" ${open} data-id="${escapeHtml(it.id)}">
        <td class="doc-no">${escapeHtml(docNum(it.number, it.id))}</td>
        <td class="t-strong">${escapeHtml(it.party || '—')}</td>
        <td class="t-muted">${escapeHtml(it.date)}</td>
        <td class="${it.overdue ? 't-danger' : 't-muted'}">${escapeHtml(it.dueDate || '—')}</td>
        <td class="t-num">${idr(it.outstanding)}</td>
        <td>${it.overdue ? `<span class="chip chip-danger">${it.daysOverdue} hari</span>` : '<span class="t-muted">—</span>'}</td>
      </tr>`;
    })
    .join('');
  return `<div class="card">
    <div class="card-head">
      <div>
        <div class="card-title">${isSales ? 'Piutang pelanggan' : 'Hutang ke supplier'}</div>
        <div class="card-sub">${s.count} dokumen belum lunas · ${s.overdueCount} lewat jatuh tempo</div>
      </div>
      <div class="card-figure">${idr(s.total)}</div>
    </div>
    <div class="aging-grid">${bucketsHtml}</div>
    ${
      s.items.length
        ? `<div class="table-wrap"><table class="data-table">
            <thead><tr><th>Dokumen</th><th>${isSales ? 'Pelanggan' : 'Supplier'}</th><th>Tanggal</th><th>Jatuh tempo</th><th class="t-num">Sisa</th><th>Terlambat</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table></div>`
        : `<div class="empty-inline">Tidak ada ${isSales ? 'piutang' : 'hutang'} yang belum lunas.</div>`
    }
  </div>`;
}

function _hutangAgingSection() {
  return _agingSection('purchases');
}

function _piutangAgingSection() {
  return _agingSection('sales');
}

// Wrap the original renderFinance to inject the hutang aging section at the end.
