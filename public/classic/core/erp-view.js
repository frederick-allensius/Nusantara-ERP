// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Views Module
// Renderers · Navigation · Charts · Event Delegation · Filters · Search · Notif
// Depends on: erp-core.js (DB, filters, activeView, helpers, modal, toast)
//             erp-crud.js (CRUD functions)
// ═══════════════════════════════════════════════════════════════════════════════
// FIX SUMMARY
//  • clear search    — × button clears the search field; input is also cleared
//                      after navigating to a result via the search modal.
//  • filter labels   — the status filter (from a list's "⋯" menu) reads
//                      FILTER_OPTIONS to display human-readable labels; an active
//                      filter is named on the toolbar with a "Hapus filter" link.
//  • sortable tables — sortState tracks {col, dir} per view; every sortable
//                      column header shows ↑/↓ indicators and toggles on click.
//  • empty states    — filtered empty states name the active filter and offer a
//                      one-click "Hapus filter" link.
//  • export CSV      — each list's "⋯" menu has "Ekspor CSV", which downloads
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

// ── Order stage filters ───────────────────────────────────────────────────────
// Stage picked on the status strip of Pesanan Penjualan / Pembelian: an
// OrderPipeline stage key (draft, confirmed, delivered, unpaid, paid), '' = none.
const stageFilters = { sales: '', purchase: '' };

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

// ── Period control ("Periode: …") ─────────────────────────────────────────────
// One button on a list toolbar shows the active range and opens a small panel
// (the pop-up system below) with presets and a custom range. It reads and writes
// dateFilters[view], so the rows, the status strip and the exports follow it.
const PERIOD_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const PERIOD_PRESETS = [
  ['month', 'Bulan ini'],
  ['lastMonth', 'Bulan lalu'],
  ['3months', '3 bulan terakhir'],
  ['year', 'Tahun ini'],
  ['all', 'Semua'],
];

// YYYY-MM-DD of a local date; month is 0-based and may overflow (Date rolls it).
function _isoDay(y, m, d) {
  const dt = new Date(y, m, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// { from, to } of a preset, counted from today (or `ref`, YYYY-MM-DD).
function periodRange(key, ref) {
  const base = String(ref || today());
  const y = Number(base.slice(0, 4));
  const m = Number(base.slice(5, 7)) - 1;
  switch (key) {
    case 'month':
      return { from: _isoDay(y, m, 1), to: _isoDay(y, m + 1, 0) };
    case 'lastMonth':
      return { from: _isoDay(y, m - 1, 1), to: _isoDay(y, m, 0) };
    case '3months':
      return { from: _isoDay(y, m - 2, 1), to: _isoDay(y, m + 1, 0) };
    case 'year':
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return { from: '', to: '' };
  }
}

// Preset key matching a range ('all' when empty), '' for a custom range.
function _periodPreset(df) {
  const from = (df && df.from) || '';
  const to = (df && df.to) || '';
  if (!from && !to) {
    return 'all';
  }
  const hit = PERIOD_PRESETS.find(([key]) => {
    const r = periodRange(key);
    return key !== 'all' && r.from === from && r.to === to;
  });
  return hit ? hit[0] : '';
}

function _periodDay(iso, withYear) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) {
    return String(iso);
  }
  return `${d} ${PERIOD_MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

// "Semua", a preset name, or the range ("1 Sep – 30 Sep 2026").
function periodLabel(view) {
  const df = dateFilters[view] || {};
  const preset = _periodPreset(df);
  if (preset) {
    return PERIOD_PRESETS.find(p => p[0] === preset)[1];
  }
  if (df.from && df.to) {
    const sameYear = df.from.slice(0, 4) === df.to.slice(0, 4);
    return `${_periodDay(df.from, !sameYear)} – ${_periodDay(df.to, true)}`;
  }
  return df.from ? `Sejak ${_periodDay(df.from, true)}` : `Sampai ${_periodDay(df.to, true)}`;
}

function setPeriod(view, from, to) {
  if (!dateFilters[view]) {
    return;
  }
  let a = from || '';
  let b = to || '';
  if (a && b && a > b) {
    [a, b] = [b, a];
  }
  dateFilters[view] = { from: a, to: b };
  pageState[view] = 1;
  refreshActiveView();
  // The toolbar was drawn again: keep focus on the period button.
  const btn = document.querySelector(`#view-${view} .period-btn`);
  if (btn) {
    btn.focus();
  }
}

function periodControl(view) {
  const df = dateFilters[view] || {};
  const preset = _periodPreset(df);
  // Roving focus: Tab reaches the chosen preset; the arrow keys move between them.
  const presets = PERIOD_PRESETS.map(
    ([key, text]) =>
      `<button type="button" class="pop-item period-preset" data-action="setPeriod" data-type="${view}" data-preset="${key}" aria-pressed="${preset === key}" tabindex="${preset === key || (!preset && key === 'month') ? '0' : '-1'}">${escapeHtml(text)}</button>`
  ).join('');
  return `<div class="period-wrap">
    <button type="button" class="period-btn" data-action="toolMenu" data-pop-align="start" aria-haspopup="dialog" aria-expanded="false">
      <span class="period-btn-k">Periode:</span>
      <span class="period-btn-v">${escapeHtml(periodLabel(view))}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
    </button><div class="tool-menu period-panel" role="dialog" aria-label="Periode" hidden>
      <div class="period-presets" role="group" aria-label="Pilihan cepat">${presets}</div>
      <div class="tool-menu-sep" role="separator"></div>
      <div class="period-custom">
        <label class="period-field"><span>Dari</span><input type="date" class="form-input period-from" value="${escapeHtml(df.from || '')}"></label>
        <label class="period-field"><span>Sampai</span><input type="date" class="form-input period-to" value="${escapeHtml(df.to || '')}"></label>
        <button type="button" class="btn period-apply" data-action="applyPeriod" data-type="${view}" data-default>Terapkan</button>
      </div>
    </div>
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

// Sortable columns of each list ([col, label], header order). The headers use
// sortTh; on phones, where the header row is hidden, "Urutkan" in the toolbar
// "⋯" menu offers the same columns (listSortItems).
const LIST_SORT = {
  sales: [
    ['id', 'No. SO'],
    ['customer', 'Pelanggan'],
    ['date', 'Tanggal'],
    ['amount', 'Total'],
  ],
  purchase: [
    ['id', 'No. PO'],
    ['supplier', 'Supplier'],
    ['date', 'Tanggal'],
    ['amount', 'Total'],
    ['status', 'Status'],
  ],
  inventory: [
    ['name', 'Nama'],
    ['category', 'Kategori'],
    ['stock', 'Stok'],
    ['cost', 'Harga Beli'],
    ['sell', 'Harga Jual'],
  ],
  logistics: [
    ['id', 'No. DO'],
    ['customer', 'Pelanggan'],
    ['destination', 'Tujuan'],
    ['date', 'Tanggal'],
    ['status', 'Status'],
  ],
};

// Sortable header of a LIST_SORT column.
function sortThOf(view, col) {
  const entry = (LIST_SORT[view] || []).find(c => c[0] === col);
  return sortTh(entry ? entry[1] : col, view, col);
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

// ── Status filter ─────────────────────────────────────────────────────────────
// The filter drop-down (FILTER_OPTIONS, human-readable labels) opens from
// "Filter status…" in the list's "⋯" menu. While a filter is on, the toolbar
// names it with a one-click "Hapus filter".
function _filterLabel(type) {
  const f = filters[type];
  if (!f || f === 'all') {
    return '';
  }
  const entry = (FILTER_OPTIONS[type] || []).find(([val]) => val === f);
  return entry ? entry[1] : f;
}

function listFilterNote(type, noun) {
  const label = _filterLabel(type);
  if (!label) {
    return '';
  }
  return `<span class="list-note" role="status">${escapeHtml(noun || 'Status')}: <strong>${escapeHtml(label)}</strong>
    <span aria-hidden="true">·</span>
    <button type="button" class="link-btn" data-action="clearFilter" data-type="${type}">Hapus filter</button>
  </span>`;
}

// ── Order lists (Pesanan Penjualan / Pesanan Pembelian) ───────────────────────
// view 'sales' | 'purchase' → OrderPipeline side 'sales' | 'purchases'.
function _orderSide(view) {
  return view === 'purchase' ? 'purchases' : 'sales';
}

function _orderStageLabel(view, key) {
  const P = window.OrderPipeline;
  const st = P ? P.stages(_orderSide(view)).find(s => s.key === key) : null;
  return st ? st.label : key;
}

// Rows of an order list as shown: status filter, date filter, stage filter,
// then the column sort. The table, Export CSV and Export Excel all use it.
function orderRows(view) {
  const list = (view === 'purchase' ? DB.purchaseOrders : DB.salesOrders) || [];
  const f = filters[view];
  let rows = !f || f === 'all' ? list : list.filter(o => o.status === f);
  rows = applyDateFilter(rows, view);
  const stage = stageFilters[view];
  const P = window.OrderPipeline;
  if (stage && P) {
    const side = _orderSide(view);
    rows = rows.filter(o => P.stageOf(side, o) === stage);
  }
  return applySorted(rows, view);
}

// Status strip: the five stages of OrderPipeline.summary (within the page's
// period) in one card, each stage like a KPI tile — status, money, number of
// orders. A stage filters the table; clicking it again clears the filter.
function orderStrip(view) {
  const P = window.OrderPipeline;
  if (!P) {
    return '';
  }
  const df = dateFilters[view] || {};
  const sum = P.summary(_orderSide(view), { from: df.from || '', to: df.to || '' });
  const active = stageFilters[view];
  const noun = view === 'purchase' ? 'PO' : 'SO';
  const short = typeof window.idrShort === 'function' ? window.idrShort : idr;
  const segs = sum.stages
    .map(s => {
      const on = active === s.key;
      const unpaid = s.key === 'unpaid';
      const money = unpaid ? s.outstanding : s.value;
      const title = `${s.label}: ${s.count} ${noun} · ${unpaid ? 'sisa ' : ''}${idr(money)}`;
      return `<button type="button" class="ostrip-seg${on ? ' is-active' : ''}${s.count ? '' : ' is-empty'}"
        data-action="orderStage" data-type="${view}" data-stage="${s.key}" aria-pressed="${on}"
        title="${escapeHtml(title)}">
        <span class="ostrip-label">${escapeHtml(s.label)}</span>
        <span class="ostrip-value">${escapeHtml(short(money))}</span>
        <span class="ostrip-sub"><span class="ostrip-count">${s.count}</span> pesanan${unpaid ? ' · sisa tagihan' : ''}</span>
      </button>`;
    })
    .join('');
  const label = view === 'purchase' ? 'Status pesanan pembelian' : 'Status pesanan penjualan';
  return `<div class="ostrip" role="group" aria-label="${label}"><div class="ostrip-track">${segs}</div></div>`;
}

// "Menampilkan: <tahap> · Hapus filter" on the list toolbar while a stage is picked.
function orderStageNote(view) {
  const key = stageFilters[view];
  if (!key) {
    return '';
  }
  return `<span class="ostrip-note list-note" role="status">Menampilkan: <strong>${escapeHtml(_orderStageLabel(view, key))}</strong>
    <span aria-hidden="true">·</span>
    <button type="button" class="link-btn" data-action="clearOrderStage" data-type="${view}">Hapus filter</button>
  </span>`;
}

function setOrderStage(view, key) {
  if (!Object.prototype.hasOwnProperty.call(stageFilters, view)) {
    return;
  }
  const P = window.OrderPipeline;
  const valid = !!key && !!P && P.KEYS.indexOf(key) !== -1;
  stageFilters[view] = valid && stageFilters[view] !== key ? key : '';
  pageState[view] = 1;
  refreshActiveView();
}

// Opens Pesanan Penjualan (side 'sales') or Pesanan Pembelian ('purchases')
// filtered to one stage — used by the Ringkasan funnel. The status filter is
// reset so the list shows the whole stage; opts { from, to } sets the date
// filter (left as it is when omitted).
function openOrderStage(side, stageKey, opts) {
  const view = side === 'purchases' || side === 'purchase' ? 'purchase' : 'sales';
  const P = window.OrderPipeline;
  stageFilters[view] = P && P.KEYS.indexOf(stageKey) !== -1 ? stageKey : '';
  filters[view] = 'all';
  if (opts && (opts.from !== undefined || opts.to !== undefined)) {
    dateFilters[view] = { from: opts.from || '', to: opts.to || '' };
  }
  pageState[view] = 1;
  if (window.invalidateView) {
    window.invalidateView(view);
  }
  const label = view === 'purchase' ? 'Pesanan Pembelian' : 'Pesanan Penjualan';
  if (!(window.NSANav && window.NSANav.open(label))) {
    window.navigate(view);
  }
  // Show the list, not a document tab left open in that module.
  if (window.docTabs && typeof window.docTabs.activate === 'function') {
    window.docTabs.activate(view, '__list__');
  }
  return true;
}
window.openOrderStage = openOrderStage;

// Row badge of an order: once delivered/received (or a pickup order is done)
// the row shows where its money stands — the same stage as the strip above.
const STAGE_BADGE = {
  delivered: ['purple', 'Belum faktur'],
  unpaid: ['warning', 'Belum lunas'],
  paid: ['success', 'Lunas'],
};
function orderStageBadge(side, o) {
  const P = window.OrderPipeline;
  const st = P ? STAGE_BADGE[P.stageOf(side, o)] : null;
  return st ? `<span class="badge badge-${st[0]}">${escapeHtml(st[1])}</span>` : badge(o.status);
}

// Inline delete confirmation in a dialog footer. The footer's own buttons are
// only hidden (not re-rendered) so their listeners, e.g. Simpan, keep working.
function armDelete(btn) {
  const footer = btn.closest('.modal-footer');
  if (!footer || footer.querySelector('.confirm-inline')) {
    return;
  }
  Array.from(footer.children).forEach(el => {
    el.hidden = true;
  });
  const row = document.createElement('div');
  row.className = 'confirm-inline';
  row.setAttribute('role', 'alert');
  row.innerHTML = `<span>Hapus ${escapeHtml(btn.dataset.label || 'dokumen ini')}? Sesaat setelah dihapus, Anda masih bisa mengurungkannya.</span>
    <button type="button" class="btn-ghost" data-action="disarmDelete">Batal</button>
    <button type="button" class="btn-danger" data-action="${escapeHtml(btn.dataset.do || '')}" data-id="${escapeHtml(btn.dataset.id || '')}">Ya, hapus</button>`;
  footer.appendChild(row);
  row.querySelector('.btn-danger').focus();
}
function disarmDelete(btn) {
  const footer = btn.closest('.modal-footer');
  const row = footer && footer.querySelector('.confirm-inline');
  if (!row) {
    return;
  }
  row.remove();
  Array.from(footer.children).forEach(el => {
    el.hidden = false;
  });
  const again = footer.querySelector('[data-action="armDelete"]');
  if (again) {
    again.focus();
  }
}

// Confirmation before deleting an order from its row menu.
function confirmOrderDelete(type, id) {
  const list = type === 'SO' ? DB.salesOrders : DB.purchaseOrders;
  const o = (list || []).find(x => String(x.id) === String(id));
  if (!o) {
    return;
  }
  const what = type === 'SO' ? 'Pesanan penjualan' : 'Pesanan pembelian';
  const party = type === 'SO' ? o.customer : o.supplier;
  confirmDialog(
    `Hapus ${docNum(o.number, o.id)}?`,
    `${what} ${docNum(o.number, o.id)}${party ? ' untuk ' + party : ''} akan dihapus. Sesaat setelah dihapus, Anda masih bisa mengurungkannya.`,
    () => (type === 'SO' ? deleteSO(id) : deletePO(id))
  );
}

// Small "Pengambilan" tag beside the number of a trading pickup order.
function pickupTag(o) {
  return o && o.pickupFlow ? '<span class="ostrip-tag">Pengambilan</span>' : '';
}

// ── Pop-ups: row "⋯", toolbar "⋯" and the "Periode" panel ──────────────────────
// The pop-up is rendered hidden right after its trigger button, so RBAC's button
// gating (guardView) applies to its items like to any other button. Opening it
// clones that markup into one fixed popover on <body> — outside the table's
// scroll box and the card — placed so it stays inside the viewport. Items are
// ordinary data-action buttons handled by the click delegation below. A panel
// with fields (role="dialog", the Periode panel) keeps Tab inside itself.
let _popMenu = null; // { el, trigger, openedAt }

function _popItems() {
  if (!_popMenu) {
    return [];
  }
  return Array.from(_popMenu.el.querySelectorAll('[role^="menuitem"], .pop-item')).filter(
    b => !b.disabled && !b.closest('[hidden]') && b.style.display !== 'none' && !_inHiddenGroup(b)
  );
}

// "Urutkan" in a toolbar menu is shown on phones only (mobile.css); the arrow
// keys skip it where it is hidden.
function _inHiddenGroup(b) {
  const group = b.closest('.list-sort');
  return !!group && window.getComputedStyle(group).display === 'none';
}

function _popIsPanel() {
  return !!_popMenu && _popMenu.el.getAttribute('role') === 'dialog';
}

// Tab / Shift+Tab cycle through the panel's fields and buttons.
function _popTrapTab(e) {
  const el = _popMenu.el;
  const list = Array.from(el.querySelectorAll('input, button:not([tabindex="-1"])')).filter(
    b => !b.disabled && !b.closest('[hidden]')
  );
  if (!list.length) {
    return;
  }
  const a = document.activeElement;
  const onItem = !!(a && a.classList && a.classList.contains('pop-item'));
  if (e.shiftKey && (a === list[0] || onItem)) {
    e.preventDefault();
    list[list.length - 1].focus();
  } else if (!e.shiftKey && a === list[list.length - 1]) {
    e.preventDefault();
    list[0].focus();
  }
}

// A field of the open panel has focus (typing a date): scrolling or the
// on-screen keyboard resizing the page must not close the panel.
function _popEditing() {
  const a = document.activeElement;
  return !!_popMenu && !!a && a.tagName === 'INPUT' && _popMenu.el.contains(a);
}

function _focusPopItem(index) {
  const items = _popItems();
  if (!items.length) {
    return;
  }
  const i = ((index % items.length) + items.length) % items.length;
  items[i].focus();
}

function _placePopMenu() {
  if (!_popMenu) {
    return;
  }
  const { el, trigger } = _popMenu;
  const gap = 4;
  const margin = 8;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  el.style.maxHeight = `${Math.max(120, vh - margin * 2)}px`;
  const r = trigger.getBoundingClientRect();
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  // Right edge on the trigger's right edge (left edge for a button that starts a
  // toolbar, data-pop-align="start"), kept inside the viewport.
  let left = trigger.dataset.popAlign === 'start' ? r.left : r.right - w;
  left = Math.max(margin, Math.min(left, vw - w - margin));
  // Below the trigger; above it when there is no room below.
  let top = r.bottom + gap;
  if (top + h > vh - margin) {
    const above = r.top - gap - h;
    top = above >= margin ? above : Math.max(margin, vh - margin - h);
  }
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

function _closePopMenu(focusTrigger) {
  const m = _popMenu;
  if (!m) {
    return;
  }
  _popMenu = null;
  m.el.remove();
  m.trigger.setAttribute('aria-expanded', 'false');
  m.trigger.removeAttribute('aria-controls');
  if (focusTrigger && m.trigger.isConnected) {
    m.trigger.focus();
  }
}

function _popMenuKeys(e) {
  if (!_popMenu) {
    return;
  }
  // In a field the keys belong to the field; Enter runs the panel's main button.
  if (e.target && e.target.tagName === 'INPUT') {
    if (e.key === 'Enter') {
      const go = _popMenu.el.querySelector('[data-default]');
      if (go) {
        e.preventDefault();
        go.click();
      }
    } else if (e.key === 'Tab') {
      _popTrapTab(e);
    }
    return;
  }
  const items = _popItems();
  const i = items.indexOf(document.activeElement);
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      _focusPopItem(i + 1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      _focusPopItem(i < 0 ? -1 : i - 1);
      break;
    case 'Home':
      e.preventDefault();
      _focusPopItem(0);
      break;
    case 'End':
      e.preventDefault();
      _focusPopItem(-1);
      break;
    case 'ArrowLeft': {
      const back = _popMenu.el.querySelector(
        '.row-menu-panel:not([hidden]) [data-action="rowMenuPanel"][data-panel="main"]'
      );
      if (back) {
        e.preventDefault();
        _showPopPanel('main');
      }
      break;
    }
    case 'Tab':
      if (_popIsPanel()) {
        _popTrapTab(e);
        break;
      }
      // Leave the menu: focus returns to its button and Tab moves on from there.
      _closePopMenu(true);
      break;
    default:
      break;
  }
}

function _openPopMenu(trigger) {
  const src = trigger.nextElementSibling;
  if (!src || !src.matches('.row-menu, .tool-menu')) {
    return;
  }
  _closePopMenu(false);
  const el = src.cloneNode(true);
  el.hidden = false;
  el.id = 'nsa-pop-menu';
  document.body.appendChild(el);
  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-controls', el.id);
  _popMenu = { el, trigger, openedAt: Date.now() };
  el.addEventListener('keydown', _popMenuKeys);
  _placePopMenu();
  // Focus the chosen option of a picker (Periode), else the first item.
  const chosen = _popItems().findIndex(b => b.getAttribute('aria-pressed') === 'true');
  _focusPopItem(chosen > -1 ? chosen : 0);
}

function _togglePopMenu(trigger) {
  if (_popMenu && _popMenu.trigger === trigger) {
    _closePopMenu(false);
    return;
  }
  _openPopMenu(trigger);
}

// Row menu: switch between the action list and the status picker.
function _showPopPanel(name) {
  if (!_popMenu) {
    return;
  }
  _popMenu.el.querySelectorAll('.row-menu-panel').forEach(p => {
    p.hidden = p.dataset.panel !== name;
  });
  _placePopMenu();
  const items = _popItems();
  const pick = items.findIndex(b => b.getAttribute('role') === 'menuitemradio');
  _focusPopItem(pick > -1 ? pick : 0);
}

// Outside click closes; a click on a menu item runs its action, then closes.
document.addEventListener(
  'click',
  e => {
    if (!_popMenu) {
      return;
    }
    const t = e.target;
    if (_popMenu.trigger.contains(t)) {
      return; // the trigger toggles itself
    }
    if (_popMenu.el.contains(t)) {
      const item = t.closest('[data-action]');
      if (item && item.dataset.action !== 'rowMenuPanel' && !item.disabled) {
        setTimeout(() => _closePopMenu(false), 0);
      }
      return;
    }
    _closePopMenu(false);
  },
  true
);
document.addEventListener(
  'keydown',
  e => {
    if (e.key !== 'Escape') {
      return;
    }
    if (_popMenu) {
      e.preventDefault();
      e.stopPropagation();
      _closePopMenu(true);
      return;
    }
    // An open status filter drop-down closes too; focus goes back to its "⋯".
    const drop = document.querySelector('.filter-drop.open');
    if (drop) {
      e.preventDefault();
      e.stopPropagation();
      const home = drop._homeParent || drop.parentNode;
      _closeFilterDrop(drop);
      if (_filterCloseCtrl) {
        _filterCloseCtrl.abort();
        _filterCloseCtrl = null;
      }
      const more = home && home.querySelector ? home.querySelector('.list-more-btn') : null;
      if (more) {
        more.focus();
      }
    }
  },
  true
);
// Scrolling or resizing the page moves the button away, so the menu closes. Scroll
// events land a frame late, so the ones from just before the menu opened are skipped.
function _popMenuSettled() {
  return !!_popMenu && Date.now() - _popMenu.openedAt > 150;
}
// While a date field of the Periode panel is being edited the panel stays and
// follows its button instead.
function _popMenuMoved() {
  if (_popEditing()) {
    _placePopMenu();
  } else {
    _closePopMenu(false);
  }
}
document.addEventListener(
  'scroll',
  e => {
    if (_popMenuSettled() && !(e.target instanceof Node && _popMenu.el.contains(e.target))) {
      _popMenuMoved();
    }
  },
  true
);
window.addEventListener('resize', () => {
  if (_popMenuSettled()) {
    _popMenuMoved();
  }
});

function _menuItem(label, attrs, cls, role) {
  return `<button type="button" role="${role || 'menuitem'}" tabindex="-1" class="row-menu-item${cls ? ' ' + cls : ''}" ${attrs}>${escapeHtml(label)}</button>`;
}

// Row "⋯" menu of a SO / PO: every action the order offers. "Ubah status" (SO)
// opens a picker with the current status and the ones DocEngine allows from it;
// picking one runs inlineSOStatus with its transition checks and stock effects.
function orderRowMenu(view, o) {
  const isSO = view !== 'purchase';
  const T = isSO ? 'SO' : 'PO';
  const id = escapeHtml(o.id);
  const num = escapeHtml(docNum(o.number, o.id));
  const cancelled = o.status === 'Cancelled';
  const canCancel =
    !cancelled && (!window.DocEngine || window.DocEngine.canTransition(T, o.status, 'Cancelled'));
  const main = [
    _menuItem('Lihat detail', `data-action="view${T}" data-id="${id}"`),
    isSO ? _menuItem('Ubah status', 'data-action="rowMenuPanel" data-panel="status" aria-haspopup="menu"') : '',
    _menuItem('Edit', `data-action="edit${T}" data-id="${id}"`),
    _menuItem('Duplikat', `data-action="duplicate${T}" data-id="${id}"`),
    _menuItem('Cetak', `data-action="print${T}" data-id="${id}"`),
    '<div class="row-menu-sep" role="separator"></div>',
    canCancel ? _menuItem('Batalkan', `data-action="cancel${T}" data-id="${id}"`, 'is-danger') : '',
    _menuItem('Hapus', `data-action="confirmDelete${T}" data-id="${id}"`, 'is-danger'),
  ].join('');

  let statusPanel = '';
  if (isSO) {
    const options = SO_STATUSES.filter(
      ([v]) =>
        v === o.status || (window.DocEngine && window.DocEngine.canTransition('SO', o.status, v))
    );
    const choices = options
      .map(([v, l]) =>
        v === o.status
          ? _menuItem(l, 'aria-checked="true" disabled', 'is-current', 'menuitemradio')
          : _menuItem(
              l,
              `aria-checked="false" data-action="setOrderStatus" data-id="${id}" data-status="${escapeHtml(v)}"`,
              '',
              'menuitemradio'
            )
      )
      .join('');
    const none =
      options.filter(([v]) => v !== o.status).length === 0
        ? '<div class="row-menu-note">Status ini tidak bisa diubah dari daftar.</div>'
        : '';
    statusPanel = `<div class="row-menu-panel" data-panel="status" hidden>
      ${_menuItem('‹ Kembali', 'data-action="rowMenuPanel" data-panel="main"', 'row-menu-back')}
      <div class="row-menu-head" role="presentation">Ubah status</div>
      ${choices}${none}
    </div>`;
  }

  return `<button type="button" class="row-menu-btn" data-action="rowMenu" aria-haspopup="menu" aria-expanded="false"
      aria-label="Aksi ${num}" title="Aksi">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
    </button><div class="row-menu" role="menu" aria-label="Aksi ${num}" hidden>
      <div class="row-menu-panel" data-panel="main">${main}</div>${statusPanel}
    </div>`;
}

// ── Toolbar "⋯" menu ──────────────────────────────────────────────────────────
// Import/export options of a list (keys in display order): csv → Export CSV,
// excel → Export Excel (xlsx), summary → Ringkasan PDF (order-summary.js),
// import → Import Excel (excel-import.js).
const IO_MENU_ITEMS = {
  csv: {
    action: 'exportCSV',
    label: 'Ekspor CSV',
    icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  },
  excel: {
    action: 'exportXLSX',
    label: 'Ekspor Excel',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="17"/><line x1="16" y1="13" x2="8" y2="17"/>',
  },
  summary: {
    action: 'printSummary',
    label: 'Ringkasan PDF',
    icon: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  },
  import: {
    action: 'importXLSX',
    label: 'Impor Excel',
    icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  },
};

function _toolItem(label, icon, attrs, hint) {
  return `<button type="button" role="menuitem" tabindex="-1" class="tool-menu-item" ${attrs}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>
      ${escapeHtml(label)}${hint ? `<span class="tool-menu-hint">${escapeHtml(hint)}</span>` : ''}</button>`;
}

// Export items first, then (after a line) the import.
function ioMenuItems(view, keys) {
  const item = key => {
    const it = IO_MENU_ITEMS[key];
    return _toolItem(it.label, it.icon, `data-action="${it.action}" data-type="${view}"`);
  };
  const out = keys.filter(k => k !== 'import' && IO_MENU_ITEMS[k]).map(item);
  const inn = keys.indexOf('import') !== -1 ? [item('import')] : [];
  const sep = out.length && inn.length ? '<div class="tool-menu-sep" role="separator"></div>' : '';
  return `${out.join('')}${sep}${inn.join('')}`;
}

const FILTER_ICON = '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>';
const SELECT_ICON =
  '<rect x="3" y="3" width="18" height="18" rx="3"/><polyline points="8 12 11 15 16 9"/>';

// "Urutkan" group of the toolbar "⋯" menu: on phones the list shows cards
// without a header row, so the sortable columns are offered here. An item runs
// the same sortCol as the column header (same column again = other direction).
// cols: [[col, label], …] in header order. Shown on phones only (mobile.css).
function listSortItems(view, cols, sepBefore) {
  if (!cols || !cols.length) {
    return '';
  }
  const s = sortState[view];
  const items = cols
    .map(([col, label]) => {
      const on = !!s && s.col === col;
      const hint = on ? (s.dir === 'asc' ? 'naik ↑' : 'turun ↓') : '';
      return `<button type="button" role="menuitemradio" aria-checked="${on}" tabindex="-1" class="tool-menu-item list-sort-item"
        data-action="sortCol" data-type="${view}" data-col="${col}">${escapeHtml(label)}${
          hint ? `<span class="tool-menu-hint">${hint}</span>` : ''
        }</button>`;
    })
    .join('');
  return `<div class="list-sort" role="group" aria-label="Urutkan">${
    sepBefore ? '<div class="tool-menu-sep" role="separator"></div>' : ''
  }<div class="row-menu-head" role="presentation">Urutkan</div>${items}</div>`;
}

// The one "⋯" button of a list toolbar: "Filter status…" (opens the status
// drop-down kept beside the button), "Pilih beberapa" where the list has bulk
// actions, "Urutkan" (phones), then the import/export options.
// opts: { io: keys, select: bool, filterLabel, sort: [[col, label], …] }.
function listMoreMenu(view, opts) {
  const o = opts || {};
  const head = [];
  if (FILTER_OPTIONS[view]) {
    head.push(
      _toolItem(
        o.filterLabel || 'Filter status…',
        FILTER_ICON,
        `data-action="toggleFilter" data-type="${view}"`,
        _filterLabel(view)
      )
    );
  }
  if (o.select) {
    head.push(_toolItem('Pilih beberapa', SELECT_ICON, `data-action="soSelectMode" data-type="${view}"`));
  }
  const sort = listSortItems(view, o.sort, head.length > 0);
  const io = ioMenuItems(view, o.io || []);
  const sep =
    (head.length || sort) && io ? '<div class="tool-menu-sep" role="separator"></div>' : '';
  return `<div class="filter-wrap list-more">
    <button type="button" class="list-more-btn" data-action="toolMenu" aria-haspopup="menu" aria-expanded="false" aria-label="Opsi lainnya" title="Opsi lainnya">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
    </button><div class="tool-menu" role="menu" aria-label="Opsi lainnya" hidden>${head.join('')}${sort}${sep}${io}</div>
    <div class="filter-drop" id="filter-${view}"></div>
  </div>`;
}

// Toolbar row above a list: period, notes of the active filters, then "⋯".
function listTools(main, more) {
  return `<div class="list-tools">
    <div class="list-tools-main">${main || ''}</div>
    ${more}
  </div>`;
}

// ── "Pilih beberapa" (Pesanan Penjualan) ──────────────────────────────────────
// The checkbox column and the bulk status bar show only in selection mode,
// entered from the "⋯" menu and left with "Selesai".
let soSelectMode = false;

function setSOSelectMode(on) {
  soSelectMode = !!on;
  if (!soSelectMode) {
    soSelection.clear();
  }
  refreshActiveView();
  const target = document.querySelector(
    soSelectMode ? '#view-sales #checkAllSO' : '#view-sales .list-more-btn'
  );
  if (target) {
    target.focus();
  }
}

// ── Export CSV ────────────────────────────────────────────────────────────────
// FIX (export CSV): downloads the current view's filtered+sorted data as a
// UTF-8 CSV with BOM so Excel auto-detects encoding correctly.
function exportCSV(view) {
  let headers, rows;

  if (view === 'sales') {
    const data = orderRows('sales');
    headers = ['No. SO', 'Pelanggan', 'Tanggal', 'Total (Rp)', 'Status'];
    rows = data.map(o => [docNum(o.number, o.id), o.customer, o.date, o.amount, o.status]);
  } else if (view === 'purchase') {
    const data = orderRows('purchase');
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
    const data = orderRows('sales');
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
    const data = orderRows('purchase');
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

// ── Empty state helper ────────────────────────────────────────────────────────
// FIX (empty states): when a filter is active and returns no rows the message
// names the filter and offers a one-click dismiss link.
function emptyRow(colspan, view) {
  const stage = stageFilters[view];
  if (stage) {
    return `<tr><td colspan="${colspan}" class="td-empty">
    Tidak ada pesanan di tahap "<strong>${escapeHtml(_orderStageLabel(view, stage))}</strong>" —
    <button type="button" class="link-btn" data-action="clearOrderStage" data-type="${view}">hapus filter</button>
  </td></tr>`;
  }
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
// renderSales() (status strip, row menu, "Pilih beberapa" with the bulk status bar)
// lives in the merged erp-patch section at the bottom of this file. The
// getRenderer() switch references it by name via late binding.

// ── View: Purchase ────────────────────────────────────────────────────────────
function renderPurchase() {
  const orders = orderRows('purchase');
  const totalFiltered = orders.length;
  const paged = applyPage(orders, 'purchase');

  return `
  ${secHdr('Pesanan Pembelian', '', 'Buat PO', 'addPO')}
  ${orderStrip('purchase')}
  <div class="card">
    ${listTools(
      periodControl('purchase') + orderStageNote('purchase') + listFilterNote('purchase'),
      listMoreMenu('purchase', {
        io: ['csv', 'excel', 'summary', 'import'],
        sort: LIST_SORT.purchase,
      })
    )}
    <div class="table-wrap">
      <table class="list-cards">
        <thead><tr>
          ${sortThOf('purchase', 'id')}
          ${sortThOf('purchase', 'supplier')}
          ${sortThOf('purchase', 'date')}
          ${sortThOf('purchase', 'amount')}
          ${sortThOf('purchase', 'status')}
          <th class="row-menu-cell"><span class="sr-only">Aksi</span></th>
        </tr></thead>
        <tbody>
          ${
            paged.length === 0
              ? emptyRow(6, 'purchase')
              : paged
                  .map(
                    o => `<tr data-action="viewPO" data-id="${escapeHtml(o.id)}">
              <td class="td-p list-no" data-cell="title">${escapeHtml(docNum(o.number, o.id))}${pickupTag(o)}</td>
              <td class="td-p" data-cell="name">${escapeHtml(o.supplier)}</td>
              <td class="td-p t-muted" data-cell="meta">${escapeHtml(o.date)}</td>
              <td class="td-p t-nowrap" data-cell="amount">${idr(o.amount)}</td>
              <td class="td-p" data-cell="status">${orderStageBadge('purchases', o)}</td>
              <td class="td-p row-menu-cell" data-cell="menu">${orderRowMenu('purchase', o)}</td>
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
  ${secHdr('Barang & Stok', '', 'Tambah Barang', 'addItem')}
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
    ${listTools(
      listFilterNote('inventory', 'Filter'),
      listMoreMenu('inventory', {
        io: ['csv', 'excel'],
        filterLabel: 'Filter barang…',
        sort: LIST_SORT.inventory,
      })
    )}
    <div class="table-wrap">
      <table class="list-cards">
        <thead><tr>
          ${sortThOf('inventory', 'name')}
          ${sortThOf('inventory', 'category')}
          <th>Satuan</th>
          ${sortThOf('inventory', 'stock')}
          <th>Min</th>
          ${sortThOf('inventory', 'cost')}
          ${sortThOf('inventory', 'sell')}
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
                    return `<tr data-action="viewItem" data-id="${escapeHtml(i.id)}">
                <td class="td-p list-key" data-cell="title">${escapeHtml(i.name)}</td>
                <td class="td-p t-muted" data-cell="name">${escapeHtml(i.category)}</td>
                <td class="td-p t-muted" data-cell="meta" data-cap="Satuan">${escapeHtml(i.unit)}</td>
                <td class="td-p${isLow ? ' t-danger' : ''}" data-cell="amount" data-cap="Stok">${i.stock}</td>
                <td class="td-p t-muted" data-cell="meta" data-cap="Min">${i.min}</td>
                <td class="td-p t-nowrap" data-cell="meta" data-cap="Harga beli">${idr(i.cost)}</td>
                <td class="td-p t-nowrap" data-cell="meta" data-cap="Harga jual">${idr(i.sell)}</td>
                <td class="td-p" data-cell="status">${badge(isLow ? 'Low' : 'OK')}</td>
                <td class="td-p" data-cell="menu">${actionBtns('Item', i.id)}</td>
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
  const integrityPanel =
    typeof window.Integrity !== 'undefined' && typeof window.Integrity.statusCardHTML === 'function'
      ? window.Integrity.statusCardHTML()
      : '';

  return `
  ${secHdr('Ringkasan Keuangan', 'Kas, laba, persediaan, piutang dan hutang — dihitung dari buku besar')}
  ${statRow(cashStats)}
  <div class="summary-grid">
    <div class="card">
      <div class="card-title">Laba rugi bulan ini</div>
      ${metric('Pendapatan', idr(revenue))}
      ${metric('Harga pokok penjualan', idr(cogs))}
      ${metric('Beban', idr(expense))}
      ${metric('Laba bersih', idr(netProfit), netProfit < 0 ? 't-danger' : 't-success')}
      <button class="btn-ghost btn-sm" data-action="openFinPL">Buka Laporan Laba Rugi</button>
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
        <div style="font-size:.8125rem;font-weight:600">Kategori Aset</div>
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
        <div style="font-size:.8125rem;font-weight:600">Kategori Fiskal</div>
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
      <div style="font-size:.875rem;font-weight:600">Daftar Aset</div>
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
              <td class="td-p" style="font-size:.75rem">${escapeHtml(a.id)}</td>
              <td class="td-p" style="font-size:.75rem">${escapeHtml(a.name)}</td>
              <td class="td-p"><span class="cat">${escapeHtml(a.category || '—')}</span></td>
              <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(a.location || '—')}</td>
              <td class="td-p" style="font-size:.75rem;color:var(--muted)">${escapeHtml(a.acquired || '—')}</td>
              <td class="td-p" style="font-size:.75rem">${idrFull(a.cost || 0)}</td>
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
        <div style="font-size:.8125rem;font-weight:600">Mutasi Aset</div>
        <button class="btn-ghost" data-action="addAssetTransfer" style="font-size:.75rem;padding:4px 10px">+ Catat</button>
      </div>
      ${
        recentTransfers.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:14px">Belum ada mutasi aset.</div>`
          : recentTransfers
              .map(
                t => `<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:.75rem;font-weight:600">${escapeHtml(t.assetName || t.assetId)}</div>
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
        <div style="font-size:.8125rem;font-weight:600">Disposisi Aset</div>
        <button class="btn-ghost" data-action="addAssetDisposal" style="font-size:.75rem;padding:4px 10px">+ Catat</button>
      </div>
      ${
        recentDisposals.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:14px">Belum ada disposisi aset.</div>`
          : recentDisposals
              .map(
                d => `<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:.75rem;font-weight:600">${escapeHtml(d.assetName || d.assetId)}</div>
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
      <div style="font-size:.8125rem;font-weight:600">Aset per Lokasi</div>
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
        <div style="font-size:.75rem;font-weight:600">${escapeHtml(loc)}</div>
        <div style="font-size:.75rem;color:var(--muted)">${count} aset</div>
      </div>`
            )
            .join('')
    }
  </div>`;
}

// ── View: Tax ─────────────────────────────────────────────────────────────────
// Pajak & PPN page: drawn by tax-extras.js (window._taxExtras.renderTaxPage),
// which loads later in the bundle; calcTaxSummary() above supplies its figures.
function renderTax() {
  return window._taxExtras && typeof window._taxExtras.renderTaxPage === 'function'
    ? window._taxExtras.renderTaxPage()
    : '';
}

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
          <div style="font-size:.8125rem;font-weight:600">${escapeHtml(r.title)}</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:2px">${escapeHtml(r.sub)}</div>
        </div>
        <div style="font-size:.8125rem;font-weight:600;color:var(--primary)">${escapeHtml(r.value)}</div>
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
  ${secHdr('Surat Jalan', '', 'Buat Surat Jalan', 'addDO')}
  ${statRow([
    { label: 'Surat jalan', value: String(dos.length), sub: 'Pengiriman dari stok' },
    { label: 'Bulan ini', value: String(thisMthDO.length), sub: 'Surat jalan dibuat' },
    { label: 'Driver aktif', value: String(uniqueDrivers), sub: 'Bulan ini' },
  ])}
  <div class="card">
    ${listTools(
      periodControl('logistics') + listFilterNote('logistics'),
      listMoreMenu('logistics', { io: ['csv', 'excel', 'import'], sort: LIST_SORT.logistics })
    )}
    ${
      pickupCount > 0
        ? `<div class="list-hint">Surat jalan pengambilan dari supplier (${pickupCount}) ada di menu <button class="link-btn" data-action="openPickupOrders">Pengambilan → PO Pengambilan</button>.</div>`
        : ''
    }
    <div class="table-wrap">
      <table class="list-cards">
        <thead><tr>
          ${sortThOf('logistics', 'id')}
          <th>Ref.</th>
          ${sortThOf('logistics', 'customer')}
          ${sortThOf('logistics', 'destination')}
          ${sortThOf('logistics', 'date')}
          <th>Driver</th>
          <th>Kendaraan</th>
          ${sortThOf('logistics', 'status')}
          <th>Aksi</th>
        </tr></thead>
        <tbody>
          ${
            paged.length === 0
              ? emptyRow(9, 'logistics')
              : paged
                  .map(d => {
                    const rawRef = d.soId || d.poId || null;
                    // The source order's own number (SO.… / PO.…) tells where
                    // the DO came from.
                    const refDoc = d.soId
                      ? (DB.salesOrders || []).find(o => String(o.id) === String(d.soId))
                      : d.poId
                        ? (DB.purchaseOrders || []).find(o => String(o.id) === String(d.poId))
                        : null;
                    const ref = refDoc
                      ? docNum(refDoc.number, refDoc.id)
                      : rawRef
                        ? `${d.soId ? 'SO' : 'PO'} · ${docNum(null, rawRef)}`
                        : '—';
                    return `<tr data-action="viewDO" data-id="${escapeHtml(d.id)}">
              <td class="td-p list-no" data-cell="title">${escapeHtml(docNum(d.number, d.id))}</td>
              <td class="td-p t-muted t-nowrap" data-cell="meta">${escapeHtml(ref)}</td>
              <td class="td-p" data-cell="name">${escapeHtml(d.customer)}</td>
              <td class="td-p t-muted" data-cell="meta">${escapeHtml(d.destination)}${
                d.destChanged
                  ? ` <span class="badge badge-warning" title="${escapeHtml(d.destOriginal ? 'Tujuan diubah dari: ' + d.destOriginal : 'Tujuan diubah')}">Tujuan diubah</span>`
                  : ''
              }</td>
              <td class="td-p t-muted" data-cell="meta">${escapeHtml(d.date)}</td>
              <td class="td-p" data-cell="meta">${escapeHtml(d.driver)}</td>
              <td class="td-p mono" data-cell="meta">${escapeHtml(d.vehicle)}</td>
              <td class="td-p" data-cell="status">${badge(d.status)}</td>
              <td class="td-p" data-cell="menu">${actionBtns('DO', d.id)}</td>
            </tr>`;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(totalFiltered, 'logistics')}
  </div>
  <details class="card log-fleet">
    <summary>Armada &amp; ekspedisi <span>${fleet.length} kendaraan · ${expedition.length} rekanan</span></summary>
  <div class="log-2col">
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:.8125rem;font-weight:600">Armada Kendaraan</div>
        <button class="btn-ghost" data-action="addFleet" style="font-size:.75rem;padding:4px 10px">+ Tambah</button>
      </div>
      ${
        fleet.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:16px">Belum ada armada — tambah kendaraan di atas.</div>`
          : fleet
              .map(
                v => `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-size:.75rem;font-weight:600;font-family:monospace">${escapeHtml(v.plate)}</div>
            <div style="font-size:.75rem;color:var(--muted)">${escapeHtml(v.type)} · ${escapeHtml(v.driver)}</div>
          </div>
          ${badge(v.status === 'OK' ? 'OK' : 'In Transit')}
          <button class="btn-ghost btn-sm" data-action="editFleet" data-id="${escapeHtml(v.id)}" style="font-size:.75rem">Edit</button>
        </div>`
              )
              .join('')
      }
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <div style="font-size:.8125rem;font-weight:600">Ekspedisi Rekanan</div>
        <button class="btn-ghost" data-action="addExpedition" style="font-size:.75rem;padding:4px 10px">+ Tambah</button>
      </div>
      ${
        expedition.length === 0
          ? `<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:16px">Belum ada ekspedisi — tambah rekanan di atas.</div>`
          : expedition
              .map(
                e => `<div style="display:flex;align-items:center;gap:8px;padding:9px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <div style="font-size:.75rem;font-weight:600">${escapeHtml(e.name)}</div>
            <div style="font-size:.75rem;color:var(--muted)">${escapeHtml(e.area)} · ${escapeHtml(e.rate)}</div>
          </div>
          <button class="btn-ghost btn-sm" data-action="editExpedition" data-id="${escapeHtml(e.id)}" style="font-size:.75rem">Edit</button>
        </div>`
              )
              .join('')
      }
    </div>
  </div>
  </details>`;
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
    return `<tr data-action="viewCustomer" data-id="${escapeHtml(c.id)}">
      <td class="td-p list-key">${escapeHtml(c.name)}</td>
      <td class="td-p t-muted">${escapeHtml(c.phone || '—')}</td>
      <td class="td-p t-muted">${escapeHtml(c.address || '—')}</td>
      <td class="td-p">${orders.length} SO</td>
      <td class="td-p">${actionBtns('Customer', c.id)}</td>
    </tr>`;
  }

  function suppRow(s) {
    const orders = DB.purchaseOrders.filter(o => o.supplier === s.name);
    return `<tr data-action="viewSupplier" data-id="${escapeHtml(s.id)}">
      <td class="td-p list-key">${escapeHtml(s.name)}</td>
      <td class="td-p t-muted">${escapeHtml(s.contact || '—')}</td>
      <td class="td-p t-muted">${escapeHtml(s.phone || '—')}</td>
      <td class="td-p t-muted">${escapeHtml(s.address || '—')}</td>
      <td class="td-p">${orders.length} PO</td>
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
      <div style="font-size:.875rem;font-weight:600">Pelanggan</div>
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
      <div style="font-size:.875rem;font-weight:600">Supplier</div>
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
  // getBackupStatus() only knows when this device last backed up; the backup
  // count needs the asynchronous cloud list, which the Kelola Backup modal loads.
  const backupStatus = window.erpBackup?.getBackupStatus() || { lastBackup: false };

  const items = [
    {
      title: 'Kelola Backup',
      sub: backupStatus.lastBackup
        ? `Backup terakhir: ${backupStatus.lastBackupDate}`
        : 'Belum ada backup otomatis',
      icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
      action: 'manageBackup',
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
      title: 'Pengaturan Pajak',
      sub: 'Status PKP, tarif PPN, PPh',
      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
      action: 'editTaxSettings',
    },
  ];

  return `
  ${secHdr('Pengaturan Umum', 'Konfigurasi sistem, perusahaan, dan akun pengguna')}
  
  <div class="card account-card">
    <span class="avatar-sm">${escapeHtml(initials)}</span>
    <div class="account-card-text">
      <div class="card-title">Masuk sebagai ${escapeHtml(userName)}</div>
      ${userRole ? `<div class="card-sub">${escapeHtml(userRole)}</div>` : ''}
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
          <div style="font-size:.8125rem;font-weight:600">${escapeHtml(s.title)}</div>
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
        <div style="font-size:.8125rem;font-weight:600">Ekspor Backup JSON</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:2px">Unduh seluruh data ERP sebagai file JSON</div>
      </div>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </div>
    <div class="card set-row" style="cursor:pointer;position:relative">
      <div class="set-ico" style="background:var(--success-bg)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="color:var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      </div>
      <div style="flex:1">
        <div style="font-size:.8125rem;font-weight:600">Impor Backup JSON</div>
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
        <div style="font-size:.8125rem;font-weight:600;color:var(--info)">Sinkronisasi ke Firebase</div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:2px">Upload data lokal ke cloud (Firestore)</div>
      </div>
      <span style="font-size:.75rem;padding:2px 8px;border-radius:99px;background:${window.__nsaDataMode === 'firestore' ? 'var(--success-bg)' : 'var(--warning-bg)'};color:${window.__nsaDataMode === 'firestore' ? 'var(--success)' : 'var(--warning)'}">${window.__nsaDataMode === 'firestore' ? 'Cloud' : 'Lokal'}</span>
    </div>
    <div class="card set-row" data-action="resetDB" style="border-color:var(--danger-light)">
      <div class="set-ico" style="background:var(--danger-light)">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.44"/></svg>
      </div>
      <div style="flex:1">
        <div style="font-size:.8125rem;font-weight:600;color:var(--danger)">Reset Data</div>
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
  _closePopMenu(false);
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
  // Opened from the "⋯" menu, whose item goes away: focus the chosen option.
  const pick = drop.querySelector('.filter-option.active') || drop.querySelector('.filter-option');
  if (pick) {
    pick.focus();
  }

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
    // Hapus in an edit dialog asks inside the dialog footer first, so the form
    // stays as typed; "Ya, hapus" runs the real delete action (data-do).
    case 'armDelete':
      armDelete(btn);
      break;
    case 'disarmDelete':
      disarmDelete(btn);
      break;
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
    // Hapus from the row "⋯" menu asks first (the edit dialog's Hapus does not).
    case 'confirmDeleteSO':
    case 'confirmDeletePO':
      confirmOrderDelete(action === 'confirmDeleteSO' ? 'SO' : 'PO', id);
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
      // From the "⋯" menu: the menu gives way to the status choices at once.
      _closePopMenu(false);
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
    case 'sortCol': {
      // From "Urutkan" in the toolbar menu: focus stays on that "⋯" button.
      const fromMenu = !!btn.closest('#nsa-pop-menu');
      sortCol(type, col);
      const more = fromMenu ? document.querySelector(`#view-${type} .list-more-btn`) : null;
      if (more) {
        more.focus();
      }
      break;
    }

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

    // ── Pop-up menus (row ⋯ / Ekspor / impor) ─────────────────────────────────
    case 'rowMenu':
    case 'toolMenu':
      _togglePopMenu(btn);
      break;
    case 'rowMenuPanel':
      _showPopPanel(btn.dataset.panel);
      break;

    // ── Order lists: status strip + row status picker ────────────────────────
    case 'orderStage':
      setOrderStage(type, btn.dataset.stage);
      break;
    case 'clearOrderStage':
      setOrderStage(type, '');
      break;
    case 'setOrderStatus':
      // inlineSOStatus: transition checks, cancel flow, stock reservation /
      // delivery effects, save and re-render.
      if (!btn.disabled && id && btn.dataset.status) {
        inlineSOStatus(id, btn.dataset.status);
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
        !(await window.confirmAsk('Upload semua data lokal ke Firebase Firestore?\n\nProses ini akan menimpa data cloud yang ada.'))
      )
        break;
      openModal(
        'Sinkronisasi ke Firebase',
        `
        <div id="sync-fb-body" style="text-align:center;padding:20px 0">
          <div class="empty-state-icon" style="margin:0 auto 12px"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg></div>
          <div style="font-size:.875rem;font-weight:600;margin-bottom:8px">Mengupload data ke Firebase...</div>
          <div style="font-size:.75rem;color:var(--muted);margin-bottom:16px" id="sync-fb-status">Memulai...</div>
          <div style="background:var(--surface-sunken);border-radius:99px;height:6px;overflow:hidden">
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
      if ((await window.confirmAsk('Keluar dari sistem?'))) {
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

    // ── Period (Periode panel) ────────────────────────────────────────────────
    case 'setPeriod': {
      const r = periodRange(btn.dataset.preset);
      setPeriod(type, r.from, r.to);
      break;
    }
    case 'applyPeriod': {
      const panel = btn.closest('.period-panel');
      const from = panel ? panel.querySelector('.period-from') : null;
      const to = panel ? panel.querySelector('.period-to') : null;
      setPeriod(type, from ? from.value : '', to ? to.value : '');
      break;
    }

    // ── "Pilih beberapa" on Pesanan Penjualan ────────────────────────────────
    case 'soSelectMode':
      setSOSelectMode(true);
      break;
    case 'soSelectDone':
      setSOSelectMode(false);
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

  // ── Change events: backup import, row checkboxes ────────────────────────────
  document.addEventListener('change', async e => {
    const inp = e.target;
    const el = e.target;

    if (inp.dataset.action === 'importBackup') {
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
      if (!(await window.confirmAsk('Impor backup akan menggantikan seluruh data yang ada. Lanjutkan?'))) {
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
// § 11  OVERRIDE: renderSales — status strip + row menu + selection on demand
// ════════════════════════════════════════════════════════════════════════════════

function renderSales() {
  const orders = orderRows('sales');

  const totalFiltered = orders.length;
  const paged = applyPage(orders, 'sales');
  const selecting = soSelectMode;

  // "Select all on this page" state
  const allPageChecked = paged.length > 0 && paged.every(o => soSelection.has(o.id));

  // Selection mode ("Pilih beberapa"): count, the bulk status buttons (shown by
  // updateBulkBar once something is picked) and "Selesai".
  const bulkBar = selecting
    ? `
  <div class="bulk-mode" role="region" aria-label="Pilih beberapa pesanan">
    <span id="bulkCount" class="bulk-count">${soSelection.size} SO dipilih</span>
    <div id="bulkBar" class="bulk-actions" style="display:${soSelection.size > 0 ? 'flex' : 'none'}">
      <span class="t-muted">Ubah semua ke:</span>
      ${SO_STATUSES.map(
        ([v, l]) =>
          `<button type="button" class="btn-ghost" data-action="bulkSOStatus" data-status="${v}">${escapeHtml(l)}</button>`
      ).join('')}
      <button type="button" class="btn-ghost" data-action="clearSOSelection">Kosongkan pilihan</button>
    </div>
    <button type="button" class="btn-ghost bulk-done" data-action="soSelectDone">Selesai</button>
  </div>`
    : '';

  const tableRows =
    paged.length === 0
      ? emptyRow(selecting ? 7 : 6, 'sales')
      : paged
          .map(o => {
            const num = docNum(o.number, o.id);
            const check = selecting
              ? `<td class="sel-cell" data-cell="check">
            <input type="checkbox" class="so-check" data-action="toggleSOCheck"
              data-id="${escapeHtml(o.id)}" ${soSelection.has(o.id) ? 'checked' : ''} aria-label="Pilih ${escapeHtml(num)}">
          </td>`
              : '';
            return `<tr data-action="viewSO" data-id="${escapeHtml(o.id)}">
          ${check}
          <td class="td-p list-no" data-cell="title">${escapeHtml(num)}${pickupTag(o)}</td>
          <td class="td-p" data-cell="name">${escapeHtml(o.customer)}</td>
          <td class="td-p t-muted" data-cell="meta">${escapeHtml(o.date)}</td>
          <td class="td-p t-nowrap" data-cell="amount">${idr(o.amount)}</td>
          <td class="td-p" data-cell="status">${orderStageBadge('sales', o)}</td>
          <td class="td-p row-menu-cell" data-cell="menu">${orderRowMenu('sales', o)}</td>
        </tr>`;
          })
          .join('');

  return `
  ${secHdr('Pesanan Penjualan', '', 'Buat SO', 'addSO')}
  ${orderStrip('sales')}
  <div class="card">
    ${listTools(
      periodControl('sales') + orderStageNote('sales') + listFilterNote('sales'),
      // While selecting, "Selesai" in the bar leaves selection mode.
      listMoreMenu('sales', {
        io: ['csv', 'summary', 'import'],
        select: !selecting,
        sort: LIST_SORT.sales,
      })
    )}
    ${bulkBar}
    <div class="table-wrap">
      <table class="list-cards${selecting ? ' is-selecting' : ''}">
        <thead><tr>
          ${
            selecting
              ? `<th class="sel-cell"><label class="sel-all">
            <input type="checkbox" id="checkAllSO" data-action="checkAllSO"
              ${allPageChecked ? 'checked' : ''}
              aria-label="Pilih semua di halaman ini" title="Pilih/batalkan semua di halaman ini"><span class="sel-all-text">Pilih semua</span>
          </label></th>`
              : ''
          }
          ${sortThOf('sales', 'id')}
          ${sortThOf('sales', 'customer')}
          ${sortThOf('sales', 'date')}
          ${sortThOf('sales', 'amount')}
          <th>Status</th>
          <th class="row-menu-cell"><span class="sr-only">Aksi</span></th>
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
      // Unbilled pickup trips are listed as their surat jalan (docType 'DO').
      const open =
        it.docType === 'SI' || it.docType === 'PI'
          ? `data-action="invView" data-type="${it.docType}"`
          : `data-action="${it.docType === 'SO' ? 'viewSO' : it.docType === 'DO' ? 'viewDO' : 'viewPO'}"`;
      return `<tr class="row-link" ${open} data-id="${escapeHtml(it.id)}">
        <td class="doc-no">${escapeHtml(docNum(it.number, it.id))}</td>
        <td class="t-strong">${escapeHtml(it.party || '—')}</td>
        <td class="t-muted">${escapeHtml(it.date)}</td>
        <td class="${it.overdue ? 't-danger' : 't-muted'}">${escapeHtml(it.dueDate || (it.unbilled ? 'Belum ditagih' : '—'))}</td>
        <td class="t-num">${idr(it.outstanding)}</td>
        <td>${it.overdue ? `<span class="chip chip-danger">${it.daysOverdue} hari</span>` : '<span class="t-muted">—</span>'}</td>
      </tr>`;
    })
    .join('');
  return `<div class="card">
    <div class="card-head">
      <div>
        <div class="card-title">${isSales ? 'Piutang pelanggan' : 'Hutang ke supplier'}</div>
        <div class="card-sub">${s.count} dokumen belum lunas · ${s.overdueCount} lewat jatuh tempo${
          !isSales && s.dueSoon > 0 ? ` · ${idr(s.dueSoon)} jatuh tempo 7 hari ke depan` : ''
        }</div>
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
