// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Helper Functions
// Formatting, validation, security helpers
// ═══════════════════════════════════════════════════════════════════════════════

// ── Constants ────────────────────────────────────────────────────────────────
const TRILLION = 1_000_000_000_000;
const BILLION = 1_000_000_000;
const MILLION = 1_000_000;
const THOUSAND = 1_000;

// ── Security Helpers ─────────────────────────────────────────────────────────
export function escapeHtml(text) {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeInput(value, type = 'text') {
  if (value === null || value === undefined) {
    return '';
  }

  switch (type) {
    case 'number': {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : Math.max(0, num);
    }
    case 'text':
      return String(value).trim();
    case 'date': {
      const dateStr = String(value).trim();
      if (!dateStr) {
        return '';
      }

      // Check format YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return '';
      }

      // Validate it's a real date
      const date = new Date(dateStr + 'T00:00:00');
      if (isNaN(date.getTime())) {
        return '';
      }

      // Ensure the parsed date matches input
      const [year, month, day] = dateStr.split('-').map(Number);
      if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) {
        return '';
      }

      return dateStr;
    }
    default:
      return String(value).trim();
  }
}

// ── Formatting Helpers ───────────────────────────────────────────────────────
// Full Rupiah (no Md/jt abbreviation) so figures match Accurate's display exactly and
// are easy to compare. Use idrShort() if a compact form is ever needed.
// Currency text keeps "Rp" and the number together (non-breaking space), so a
// narrow column never leaves "Rp" alone on its own line.
export function idr(v) {
  const neg = v < 0;
  return `${neg ? '-' : ''}Rp\u00a0${Math.round(Math.abs(v || 0)).toLocaleString('id-ID')}`;
}

// Abbreviated form for tight spaces (mobile cards, summary lines).
// Tiers: T (triliun), M (miliar), jt (juta), rb (ribu). Indonesian decimal comma.
export function idrShort(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) {
    return 'Rp\u00a00';
  }
  const neg = n < 0;
  const abs = Math.abs(n);
  const fmt = (value, decimals) => value.toFixed(decimals).replace('.', ',');
  let body;
  if (abs >= TRILLION) {
    body = `${fmt(abs / TRILLION, 2)} T`;
  } else if (abs >= BILLION) {
    body = `${fmt(abs / BILLION, 2)} M`;
  } else if (abs >= MILLION) {
    body = `${fmt(abs / MILLION, 0)} jt`;
  } else if (abs >= THOUSAND) {
    body = `${fmt(abs / THOUSAND, 0)} rb`;
  } else {
    body = `${Math.round(abs)}`;
  }
  return `${neg ? '-' : ''}Rp\u00a0${body}`;
}

export function idrFull(v) {
  const neg = v < 0;
  return `${neg ? '-' : ''}Rp\u00a0${Math.abs(v).toLocaleString('id-ID')}`;
}

// A date as lists show it: "11 Okt 2026". Stored values and date inputs stay
// ISO (yyyy-mm-dd); anything that is not a date is shown as given.
export function tgl(iso) {
  if (!iso) {
    return '—';
  }
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  return isNaN(d)
    ? String(iso)
    : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Badge Helper ─────────────────────────────────────────────────────────────
export function badge(status) {
  // Tone classes (style.css .badge-*) follow the theme tokens, so badges read
  // well in light and dark mode.
  const map = {
    Draft: ['neutral', 'Draft'],
    Confirmed: ['info', 'Dikonfirmasi'],
    Delivered: ['success', 'Terkirim'],
    Paid: ['success', 'Lunas'],
    Received: ['success', 'Diterima'],
    Outstanding: ['warning', 'Belum Lunas'],
    Posted: ['info', 'Diposting'],
    Pending: ['warning', 'Pending'],
    'In Transit': ['info', 'Dalam Pengiriman'],
    Low: ['danger', 'Stok Rendah'],
    OK: ['success', 'Normal'],
    Maintenance: ['neutral', 'Servis/Perbaikan'],
    Approved: ['success', 'Disetujui'],
    Rejected: ['danger', 'Ditolak'],
    'PO Dibuat': ['info', 'PO Dibuat'],
    Open: ['warning', 'Open'],
    Closed: ['neutral', 'Selesai'],
    Cancelled: ['danger', 'Dibatalkan'],
    // Accurate order-processing statuses (SO/PO)
    'Waiting on Process': ['warning', 'Menunggu Proses'],
    'Partially Processed': ['info', 'Diproses Sebagian'],
    Processed: ['success', 'Diproses'],
    // Accurate delivery/invoicing statuses (DO)
    Sent: ['info', 'Terkirim'],
    Invoiced: ['success', 'Difakturkan'],
    'Partially invoiced': ['warning', 'Faktur Sebagian'],
  };
  const [tone, label] = map[status] || map.Draft;
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

// ── UI Helpers ───────────────────────────────────────────────────────────────
// Page header: title and an optional primary button. The subtitle is shown only
// when the caller asks for it with opts.showSub — most page titles say enough on
// their own, so `sub` is otherwise left out.
export function secHdr(title, sub, btnLabel, btnAction, opts) {
  const showSub = !!(sub && opts && opts.showSub);
  return `<div class="sec-hdr">
    <div>
      <h1>${escapeHtml(title)}</h1>
      ${showSub ? `<p>${escapeHtml(sub)}</p>` : ''}
    </div>
    ${
      btnLabel
        ? `<button class="btn" data-action="${btnAction || ''}">${
            // "+" only on buttons that create something (not e.g. "Cetak").
            /^(Buat|Tambah|Catat)\b/i.test(btnLabel)
              ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg> `
              : ''
          }${escapeHtml(btnLabel)}
    </button>`
        : ''
    }
  </div>`;
}

export function statRow(items) {
  return `<div class="stat-row" style="grid-template-columns:repeat(${items.length},1fr)">
    ${items
      .map(
        s => `<div class="card stat-card">
      <div class="stat-label">${escapeHtml(s.label)}</div>
      <div class="stat-val" style="color:${s.color || 'var(--text)'}">${escapeHtml(s.value)}</div>
      <div class="stat-sub">${escapeHtml(s.sub)}</div>
    </div>`
      )
      .join('')}
  </div>`;
}

export function tblHdr(cols) {
  return `<thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`;
}

export function actionBtns(type, id) {
  // Quiet row button (style.css .row-edit); no inline handlers (CSP).
  return `<button type="button" class="row-edit" data-action="edit${type}" data-id="${escapeHtml(id)}" title="Edit">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
      </svg>
      Edit
    </button>`;
}

export function detailRow(label, value) {
  return `<div class="detail-item">
    <div class="detail-label">${escapeHtml(label)}</div>
    <div class="detail-value">${value}</div>
  </div>`;
}

// ── ID Generation ────────────────────────────────────────────────────────────
export function nextId(prefix, arr, field) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const base = prefix.split(/[-.]/)[0];
  const prefixWithYM = `${base}.${year}.${month}`;

  let max = 0;
  arr.forEach(item => {
    const id = String(item[field || 'id']);
    if (!id.startsWith(prefixWithYM + '.')) {
      return;
    }
    const parts = id.split('.');
    const n = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(n) && n > max) {
      max = n;
    }
  });

  const existingIds = new Set(arr.map(item => String(item[field || 'id'])));
  let candidate;
  do {
    max++;
    candidate = `${prefixWithYM}.${String(max).padStart(3, '0')}`;
  } while (existingIds.has(candidate));

  return candidate;
}

// Active per-view filter state. Lives in erp-core.js (not loaded), so the
// render functions in erp-view.js (sales/purchase/inventory/logistics) would
// throw "filters is not defined" without this. Seed it here, before those
// classic scripts run.
if (typeof window.filters === 'undefined') {
  window.filters = { sales: 'all', purchase: 'all', inventory: 'all', logistics: 'all' };
}

// Make helpers globally available
window.escapeHtml = escapeHtml;
window.sanitizeInput = sanitizeInput;
window.idr = idr;
window.idrFull = idrFull;
window.idrShort = idrShort;
window.today = today;
window.tgl = tgl;
window.badge = badge;
window.secHdr = secHdr;
window.statRow = statRow;
window.tblHdr = tblHdr;
window.actionBtns = actionBtns;
window.detailRow = detailRow;
window.nextId = nextId;
