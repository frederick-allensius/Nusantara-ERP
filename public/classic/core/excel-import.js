// Nusantara ERP — Import dari Excel  (excel-import.js)
// ─────────────────────────────────────────────────────────────────────────────
// Nusantara's source records live in spreadsheets, so this screen ingests an
// .xlsx workbook and commits it through the SAME engines the rest of the app
// uses: masters auto-create, documents get DocEngine numbers, and saveDB() fires
// the GL auto-posting + moving-average cost-ledger. Opening balances post as a
// balanced journal voucher; opening stock seeds item quantities/cost.
//
// Parsing uses SheetJS (window.XLSX, bridged from the ES-module side in
// src/main.js). The blank template is generated with the existing zero-dependency
// NSAXlsx writer so no extra code ships for exports.
//
// IIFE-wrapped classic <script>; exposes ONLY window.renderExcelImport.
(function () {
  'use strict';

  const esc =
    window.escapeHtml ||
    (s =>
      String(s == null ? '' : s).replace(
        /[&<>"']/g,
        m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]
      ));
  const toast = (m, t) => (window.showToast ? window.showToast(m, t) : console.log(m));

  // ── Sheet definitions: header → field, with required + type metadata ─────────
  // type: 'text' | 'num' | 'date'. req: required for a row to be valid.
  const SHEETS = {
    'Sales Orders': {
      collection: 'salesOrders',
      kind: 'order',
      cols: [
        { h: 'Tanggal', f: 'date', t: 'date', req: true },
        { h: 'Nomor', f: 'number', t: 'text' },
        { h: 'Customer', f: 'party', t: 'text', req: true },
        { h: 'Item Code', f: 'itemCode', t: 'text' },
        { h: 'Item Name', f: 'itemName', t: 'text', req: true },
        { h: 'Qty', f: 'qty', t: 'num', req: true },
        { h: 'Harga', f: 'price', t: 'num', req: true },
        { h: 'Diskon', f: 'discount', t: 'num' },
        { h: 'Unit', f: 'unit', t: 'text' },
        { h: 'Tax Rate', f: 'taxRate', t: 'num' },
        { h: 'Status', f: 'status', t: 'text' },
      ],
    },
    'Purchase Orders': {
      collection: 'purchaseOrders',
      kind: 'order',
      cols: [
        { h: 'Tanggal', f: 'date', t: 'date', req: true },
        { h: 'Nomor', f: 'number', t: 'text' },
        { h: 'Supplier', f: 'party', t: 'text', req: true },
        { h: 'Item Code', f: 'itemCode', t: 'text' },
        { h: 'Item Name', f: 'itemName', t: 'text', req: true },
        { h: 'Qty', f: 'qty', t: 'num', req: true },
        { h: 'Harga', f: 'price', t: 'num', req: true },
        { h: 'Diskon', f: 'discount', t: 'num' },
        { h: 'Unit', f: 'unit', t: 'text' },
        { h: 'Tax Rate', f: 'taxRate', t: 'num' },
        { h: 'Status', f: 'status', t: 'text' },
      ],
    },
    'Delivery Orders': {
      collection: 'deliveryOrders',
      kind: 'delivery',
      cols: [
        { h: 'Tanggal', f: 'date', t: 'date', req: true },
        { h: 'Nomor', f: 'number', t: 'text' },
        { h: 'SO Number', f: 'soRef', t: 'text' },
        { h: 'Customer', f: 'party', t: 'text', req: true },
        { h: 'Item Code', f: 'itemCode', t: 'text' },
        { h: 'Item Name', f: 'itemName', t: 'text', req: true },
        { h: 'Qty', f: 'qty', t: 'num', req: true },
        { h: 'Unit', f: 'unit', t: 'text' },
        { h: 'Destination', f: 'destination', t: 'text' },
        { h: 'Driver', f: 'driver', t: 'text' },
        { h: 'Vehicle', f: 'vehicle', t: 'text' },
        { h: 'Status', f: 'status', t: 'text' },
      ],
    },
    Invoices: {
      collection: 'salesInvoices',
      kind: 'invoice',
      cols: [
        { h: 'Tanggal', f: 'date', t: 'date', req: true },
        { h: 'Nomor', f: 'number', t: 'text' },
        { h: 'Customer', f: 'party', t: 'text', req: true },
        { h: 'Item Code', f: 'itemCode', t: 'text' },
        { h: 'Item Name', f: 'itemName', t: 'text', req: true },
        { h: 'Qty', f: 'qty', t: 'num', req: true },
        { h: 'Harga', f: 'price', t: 'num', req: true },
        { h: 'Diskon', f: 'discount', t: 'num' },
        { h: 'Unit', f: 'unit', t: 'text' },
        { h: 'Tax Rate', f: 'taxRate', t: 'num' },
        { h: 'Due Date', f: 'dueDate', t: 'date' },
        { h: 'Status', f: 'status', t: 'text' },
      ],
    },
    Payments: {
      collection: 'paymentLogs',
      kind: 'payment',
      cols: [
        { h: 'Tanggal', f: 'date', t: 'date', req: true },
        { h: 'Type', f: 'type', t: 'text', req: true },
        { h: 'Doc Number', f: 'orderId', t: 'text' },
        { h: 'Party', f: 'party', t: 'text' },
        { h: 'Amount', f: 'amount', t: 'num', req: true },
        { h: 'Method', f: 'method', t: 'text' },
        { h: 'Note', f: 'note', t: 'text' },
      ],
    },
    'Opening Balances': {
      kind: 'openingBalance',
      cols: [
        { h: 'Account No', f: 'accountNo', t: 'text', req: true },
        { h: 'Account Name', f: 'accountName', t: 'text' },
        { h: 'Debit', f: 'debit', t: 'num' },
        { h: 'Credit', f: 'credit', t: 'num' },
      ],
    },
    'Opening Stock': {
      kind: 'openingStock',
      cols: [
        { h: 'Item Code', f: 'itemCode', t: 'text' },
        { h: 'Item Name', f: 'itemName', t: 'text', req: true },
        { h: 'Category', f: 'category', t: 'text' },
        { h: 'Unit', f: 'unit', t: 'text' },
        { h: 'Qty', f: 'qty', t: 'num', req: true },
        { h: 'Cost', f: 'cost', t: 'num' },
      ],
    },
  };

  // Parsed state: { sheetName: { rows:[{_row, _errors:[], ...fields}], unknown:[headers] } }
  let _parsed = null;

  // ── value coercion ───────────────────────────────────────────────────────────
  function parseNum(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    const n = Number(
      String(v)
        .replace(/[^0-9.,-]/g, '')
        .replace(/\.(?=\d{3}\b)/g, '')
        .replace(',', '.')
    );
    return isNaN(n) ? NaN : n;
  }
  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    // Excel serial date (number) — SheetJS gives Date when cellDates:true, but guard anyway.
    if (typeof v === 'number') {
      const d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return isNaN(d) ? null : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }

  // Parse a sheet's array-of-arrays into validated rows + unknown headers.
  // Shared by the full-workbook screen (_handleFile) and the per-module importer.
  function _parseRows(aoa, def) {
    if (!aoa || !aoa.length) return { rows: [], unknown: [] };
    const headers = (aoa[0] || []).map(h => String(h).trim());
    const known = def.cols.map(c => c.h);
    const unknown = headers.filter(h => h && !known.includes(h));
    const idx = {};
    def.cols.forEach(c => {
      idx[c.f] = headers.indexOf(c.h);
    });
    const rows = [];
    for (let r = 1; r < aoa.length; r++) {
      const raw = aoa[r] || [];
      if (raw.every(c => String(c).trim() === '')) continue; // skip blank rows
      const rec = { _row: r + 1, _errors: [] };
      def.cols.forEach(c => {
        const cell = idx[c.f] >= 0 ? raw[idx[c.f]] : '';
        if (c.t === 'num') {
          const n = parseNum(cell);
          if (isNaN(n)) {
            rec._errors.push(`${c.h} bukan angka`);
            rec[c.f] = 0;
          } else {
            rec[c.f] = n;
          }
        } else if (c.t === 'date') {
          const d = parseDate(cell);
          if (!d && (c.req || String(cell).trim() !== '')) {
            rec._errors.push(`${c.h} tanggal tidak valid`);
          }
          rec[c.f] = d;
        } else {
          rec[c.f] = String(cell == null ? '' : cell).trim();
        }
        if (c.req && (rec[c.f] === '' || rec[c.f] == null)) {
          rec._errors.push(`${c.h} wajib diisi`);
        }
      });
      rows.push(rec);
    }
    return { rows, unknown };
  }

  // ── duplicate detection ──────────────────────────────────────────────────────
  // Re-uploading the same workbook should NOT create duplicate documents. We key
  // each document on a content signature that INCLUDES the transaction date, so
  // the same goods shipped/ordered on a different date still count as new (per
  // the requirement: "pakai tanggalnya untuk memastikan datanya beda").
  function _lineSigPart(l) {
    return `${String(l.itemName || '').toLowerCase().trim()}:${Number(l.qty) || 0}:${Number(l.price || l.unitPrice || 0)}`;
  }
  function _docSig(coll, date, party, lines) {
    const ls = (lines || []).map(_lineSigPart).sort().join(',');
    return [coll, date || '', String(party || '').toLowerCase().trim(), ls].join('|');
  }
  // Signatures of documents already in the DB for a collection.
  function _existingSigs(coll) {
    const set = new Set();
    (DB[coll] || []).forEach(d => {
      set.add(_docSig(coll, d.date, d.customer || d.supplier, d.lines));
    });
    return set;
  }
  // Lower-cased trimmed set of DO numbers already in the DB (for uniqueness).
  function _existingDoNumbers() {
    const set = new Set();
    (DB.deliveryOrders || []).forEach(d => {
      if (d.number) set.add(String(d.number).toLowerCase().trim());
    });
    return set;
  }

  // ── parse an uploaded workbook into _parsed ─────────────────────────────────
  function _handleFile(file) {
    if (!file) return;
    if (!window.XLSX) {
      toast('Parser Excel belum siap (XLSX). Muat ulang halaman.', 'danger');
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb = window.XLSX.read(new Uint8Array(ev.target.result), {
          type: 'array',
          cellDates: true,
        });
        _parsed = {};
        wb.SheetNames.forEach(name => {
          const def = SHEETS[name];
          if (!def) return; // ignore unknown sheets
          const ws = wb.Sheets[name];
          const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
          _parsed[name] = _parseRows(aoa, def);
        });
        _renderPreview();
        const total = Object.values(_parsed).reduce((s, p) => s + p.rows.length, 0);
        toast(
          total ? `${total} baris terbaca` : 'Tidak ada baris yang dikenali',
          total ? 'success' : 'warning'
        );
      } catch (err) {
        console.error('[excel-import] parse error', err);
        toast('Gagal membaca file Excel: ' + (err && err.message), 'danger');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── preview rendering ────────────────────────────────────────────────────────
  function _renderPreview() {
    const host = document.getElementById('excel-preview');
    if (!host) return;
    if (!_parsed || !Object.keys(_parsed).length) {
      host.innerHTML =
        '<div style="padding:24px;text-align:center;color:var(--muted)">Belum ada data. Pilih file .xlsx untuk pratinjau.</div>';
      _toggleCommit(false);
      return;
    }
    let html = '';
    let totalRows = 0;
    let totalErr = 0;
    Object.keys(_parsed).forEach(name => {
      const def = SHEETS[name];
      const p = _parsed[name];
      totalRows += p.rows.length;
      const errRows = p.rows.filter(r => r._errors.length).length;
      totalErr += errRows;
      html += `<div class="card" style="margin-bottom:14px;padding:14px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div style="font-weight:600;font-size:.875rem">${esc(name)}</div>
          <div style="font-size:.75rem;color:var(--muted)">${p.rows.length} baris${
            errRows
              ? ` · <span style="color:var(--danger)">${errRows} bermasalah</span>`
              : ''
          }</div>
        </div>`;
      if (p.unknown.length) {
        html += `<div style="font-size:.75rem;color:var(--warning);margin-bottom:8px">Kolom tak dikenal diabaikan: ${esc(
          p.unknown.join(', ')
        )}</div>`;
      }
      if (p.rows.length) {
        html +=
          '<div class="table-wrap" style="overflow:auto;max-height:240px"><table style="width:100%;font-size:.75rem"><thead><tr>';
        html += '<th style="text-align:left;padding:4px 8px">#</th>';
        def.cols.forEach(c => {
          html += `<th style="text-align:left;padding:4px 8px;white-space:nowrap">${esc(c.h)}</th>`;
        });
        html += '<th style="text-align:left;padding:4px 8px">Validasi</th></tr></thead><tbody>';
        p.rows.slice(0, 50).forEach(r => {
          const bad = r._errors.length > 0;
          html += `<tr style="${bad ? 'background:var(--danger-bg)' : ''}">`;
          html += `<td style="padding:4px 8px;color:var(--muted)">${r._row}</td>`;
          def.cols.forEach(c => {
            html += `<td style="padding:4px 8px;white-space:nowrap">${esc(r[c.f])}</td>`;
          });
          html += `<td style="padding:4px 8px;color:${bad ? 'var(--danger)' : 'var(--success)'};white-space:nowrap">${
            bad ? esc(r._errors.join('; ')) : '✓'
          }</td>`;
          html += '</tr>';
        });
        html += '</tbody></table></div>';
        if (p.rows.length > 50) {
          html += `<div style="font-size:.75rem;color:var(--muted);margin-top:6px">…dan ${p.rows.length - 50} baris lagi</div>`;
        }
      }
      html += '</div>';
    });
    const summary = `<div style="font-size:.75rem;color:var(--muted);margin-bottom:10px">Total ${totalRows} baris${
      totalErr ? ` · ${totalErr} baris bermasalah (akan dilewati)` : ''
    }</div>`;
    host.innerHTML = summary + html;
    _toggleCommit(totalRows > 0);
  }

  function _toggleCommit(on) {
    const btn = document.getElementById('excel-commit-btn');
    if (btn) btn.style.display = on ? '' : 'none';
  }

  // ── master helpers ───────────────────────────────────────────────────────────
  function _nextNumericId(coll) {
    const arr = DB[coll] || [];
    let max = 0;
    arr.forEach(x => {
      const n = Number(x.id);
      if (!isNaN(n) && n > max) max = n;
    });
    return max + 1;
  }
  function _ensureCustomer(name, created) {
    if (!name) return null;
    let c = (DB.customers || []).find(x => String(x.name).toLowerCase() === name.toLowerCase());
    if (!c) {
      c = { id: _nextNumericId('customers'), name, phone: '', address: '', email: '', npwp: '' };
      (DB.customers || (DB.customers = [])).push(c);
      created.customers++;
    }
    return c;
  }
  function _ensureSupplier(name, created) {
    if (!name) return null;
    let s = (DB.suppliers || []).find(x => String(x.name).toLowerCase() === name.toLowerCase());
    if (!s) {
      s = { id: _nextNumericId('suppliers'), name, contact: '', phone: '', address: '', npwp: '' };
      (DB.suppliers || (DB.suppliers = [])).push(s);
      created.suppliers++;
    }
    return s;
  }
  function _ensureItem(code, name, unit, price, created) {
    let it = null;
    if (code) it = (DB.inventoryItems || []).find(x => String(x.id) === String(code));
    if (!it && name) {
      it = (DB.inventoryItems || []).find(x => String(x.name).toLowerCase() === name.toLowerCase());
    }
    if (!it) {
      it = {
        id: _nextNumericId('inventoryItems'),
        name: name || `Item ${code || ''}`.trim(),
        category: 'Umum',
        unit: unit || 'pcs',
        stock: 0,
        min: 0,
        cost: 0,
        sell: Number(price) || 0,
        warehouseStock: {},
      };
      (DB.inventoryItems || (DB.inventoryItems = [])).push(it);
      created.items++;
    }
    return it;
  }
  function _docNumber(prefix, date) {
    if (window.DocEngine && typeof window.DocEngine.nextNumber === 'function') {
      try {
        return window.DocEngine.nextNumber(prefix, date, {
          sequences: DB.numberSequences,
          commit: true,
        });
      } catch (_) {
        /* fall through */
      }
    }
    return undefined;
  }

  // Group order/invoice/delivery rows into documents keyed by Nomor or party+date.
  function _group(rows) {
    const map = new Map();
    rows.forEach(r => {
      if (r._errors.length) return; // skip invalid rows
      const key = (r.number && r.number.trim()) || `${r.party}__${r.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return map;
  }
  function _lineOf(r, item) {
    const qty = Number(r.qty) || 0;
    const price = Number(r.price) || 0;
    const disc = Number(r.discount) || 0;
    return {
      itemId: item ? item.id : 'custom',
      itemName: r.itemName,
      unit: r.unit || (item && item.unit) || 'pcs',
      qty,
      price,
      lineDiscount: disc,
      subtotal: qty * price - disc,
    };
  }

  // ── commit ───────────────────────────────────────────────────────────────────
  // opts.module — when set (per-module import), refresh the active view in place
  // instead of navigating to the standalone Import screen.
  function _commit(opts) {
    opts = opts || {};
    if (!_parsed) return;
    const created = { customers: 0, suppliers: 0, items: 0 };
    const result = { created: 0, skipped: 0, duplicates: 0, doConflicts: [], errors: [] };

    try {
      // 1) Opening Stock first so transactions can reference the items.
      const os = _parsed['Opening Stock'];
      if (os) {
        os.rows.forEach(r => {
          if (r._errors.length) {
            result.skipped++;
            return;
          }
          const it = _ensureItem(r.itemCode, r.itemName, r.unit, 0, created);
          if (r.category) it.category = r.category;
          if (r.unit) it.unit = r.unit;
          it.stock = Number(r.qty) || 0;
          if (Number(r.cost) > 0) it.cost = Number(r.cost);
          it.warehouseStock = it.warehouseStock || {};
          it.warehouseStock['WH-DEFAULT'] = it.stock;
          result.created++;
        });
      }

      // 2) Orders / Invoices / Deliveries.
      const buildOrder = (sheetName, prefix, isPurchase) => {
        const p = _parsed[sheetName];
        if (!p) return;
        const coll = SHEETS[sheetName].collection;
        const seen = _existingSigs(coll);
        _group(p.rows).forEach(grp => {
          const head = grp[0];
          // Skip rows that duplicate an existing document (same date + party +
          // lines) or that repeat within this same import run.
          const sig = _docSig(
            coll,
            head.date,
            head.party,
            grp.map(r => ({ itemName: r.itemName, qty: r.qty, price: r.price }))
          );
          if (seen.has(sig)) {
            result.duplicates++;
            return;
          }
          seen.add(sig);
          const partyRec = isPurchase
            ? _ensureSupplier(head.party, created)
            : _ensureCustomer(head.party, created);
          const lines = grp.map(r =>
            _lineOf(r, _ensureItem(r.itemCode, r.itemName, r.unit, r.price, created))
          );
          const dpp = lines.reduce((s, l) => s + l.subtotal, 0);
          const taxRate = Number(head.taxRate) || 0;
          const tax = taxRate ? Math.round(dpp * taxRate) : 0;
          const doc = {
            id: _nextNumericId(coll),
            number: head.number || _docNumber(prefix, head.date) || undefined,
            date: head.date,
            status:
              head.status || (prefix === 'DO' ? 'Delivered' : prefix === 'SI' ? 'Outstanding' : 'Draft'),
            lines,
            amount: dpp + tax,
            taxRate,
            tax,
            stockMutated: false,
          };
          if (isPurchase) {
            doc.supplier = head.party;
            doc.supplierId = partyRec ? partyRec.id : null;
          } else {
            doc.customer = head.party;
            doc.customerId = partyRec ? partyRec.id : null;
          }
          if (prefix === 'SI') doc.dueDate = head.dueDate || null;
          if (prefix === 'SI') doc.paid = 0;
          (DB[coll] || (DB[coll] = [])).unshift(doc);
          result.created++;
        });
      };
      buildOrder('Sales Orders', 'SO', false);
      buildOrder('Purchase Orders', 'PO', true);
      buildOrder('Invoices', 'SI', false);

      // Delivery Orders (no price/tax).
      const doSheet = _parsed['Delivery Orders'];
      if (doSheet) {
        const doSeen = _existingSigs('deliveryOrders');
        const doNums = _existingDoNumbers();
        _group(doSheet.rows).forEach(grp => {
          const head = grp[0];
          // A DO number must be unique. Reject (do not import) any row whose
          // number collides with an existing DO or a duplicate within the file.
          const num = head.number ? String(head.number).trim() : '';
          if (num && doNums.has(num.toLowerCase())) {
            result.doConflicts.push(num);
            return;
          }
          // Same date + customer + lines = already imported → skip silently.
          const sig = _docSig(
            'deliveryOrders',
            head.date,
            head.party,
            grp.map(r => ({ itemName: r.itemName, qty: r.qty }))
          );
          if (doSeen.has(sig)) {
            result.duplicates++;
            return;
          }
          doSeen.add(sig);
          if (num) doNums.add(num.toLowerCase());
          const cust = _ensureCustomer(head.party, created);
          const lines = grp.map(r =>
            _lineOf(r, _ensureItem(r.itemCode, r.itemName, r.unit, 0, created))
          );
          const doc = {
            id: _nextNumericId('deliveryOrders'),
            number: head.number || _docNumber('DO', head.date) || undefined,
            soId: null,
            poId: null,
            customer: head.party,
            customerId: cust ? cust.id : null,
            supplierId: null,
            destination: head.destination || '',
            date: head.date,
            status: head.status || 'Delivered',
            driver: head.driver || '',
            vehicle: head.vehicle || '',
            customerPO: '',
            notes: head.soRef ? `Ref SO: ${head.soRef}` : '',
            lines,
          };
          (DB.deliveryOrders || (DB.deliveryOrders = [])).unshift(doc);
          result.created++;
        });
      }

      // 3) Payments → paymentLogs.
      const pay = _parsed['Payments'];
      if (pay) {
        pay.rows.forEach(r => {
          if (r._errors.length) {
            result.skipped++;
            return;
          }
          const id = _nextNumericId('paymentLogs');
          // Payment logs are keyed by order type ('SO' | 'PO') and the order's id;
          // the sheet may reference the order by id or by document number.
          const payType = /pur|beli|pemb/i.test(r.type) ? 'PO' : 'SO';
          const ref = String(r.orderId || '').trim();
          const order = (payType === 'PO' ? DB.purchaseOrders : DB.salesOrders || []).find(
            o => String(o.id) === ref || String(o.number || '') === ref
          );
          (DB.paymentLogs || (DB.paymentLogs = [])).push({
            id,
            type: payType,
            orderId: order ? order.id : ref,
            date: r.date,
            amount: Number(r.amount) || 0,
            method: r.method || 'Transfer',
            note: r.note || '',
          });
          result.created++;
        });
      }

      // 4) Opening Balances → balanced journal voucher.
      const ob = _parsed['Opening Balances'];
      if (ob && ob.rows.length && window.GL && typeof window.GL.postJournalVoucher === 'function') {
        const valid = ob.rows.filter(r => !r._errors.length);
        if (valid.length) {
          const rawLines = valid.map(r => ({
            accountNo: r.accountNo,
            debit: Number(r.debit) || 0,
            credit: Number(r.credit) || 0,
          }));
          const totD = rawLines.reduce((s, l) => s + l.debit, 0);
          const totC = rawLines.reduce((s, l) => s + l.credit, 0);
          // Auto-balance to Retained Earnings (320101) so the trial balance holds.
          if (totD !== totC) {
            const diff = totD - totC;
            rawLines.push({
              accountNo: '320101',
              debit: diff < 0 ? -diff : 0,
              credit: diff > 0 ? diff : 0,
            });
          }
          const date = valid[0].date || new Date().toISOString().slice(0, 10);
          try {
            window.GL.postJournalVoucher(date, rawLines, 'Saldo Awal (Import Excel)');
            result.created++;
          } catch (e) {
            result.errors.push('Opening Balances: ' + (e && e.message));
          }
        }
      }

      // Persist once — this fires the wrapped saveDB chain (GL reconcile +
      // cost-ledger + integrity + audit), so journals and COGS post correctly.
      if (typeof window.saveDB === 'function') window.saveDB();

      const msg =
        `Import selesai — ${result.created} dibuat` +
        (created.customers || created.suppliers || created.items
          ? ` (master baru: ${created.customers} customer, ${created.suppliers} supplier, ${created.items} item)`
          : '') +
        (result.duplicates ? `, ${result.duplicates} duplikat dilewati` : '') +
        (result.doConflicts.length ? `, ${result.doConflicts.length} No. DO bentrok` : '') +
        (result.skipped ? `, ${result.skipped} dilewati` : '') +
        (result.errors.length ? `, ${result.errors.length} error` : '');
      if (!opts.module) _showSummary(result, created);
      // A clashing DO number is a data error the user must fix — surface it loudly.
      if (result.doConflicts.length) {
        toast(
          `Nomor DO sudah dipakai (tidak diimpor): ${result.doConflicts.join(', ')}`,
          'danger'
        );
      } else {
        toast(msg, result.errors.length || result.duplicates ? 'warning' : 'success');
      }
      _parsed = null;
      if (typeof window.navigate === 'function') {
        // Re-render in place for a per-module import; otherwise show the standalone
        // Import screen's summary card.
        window.navigate(opts.module ? opts.view || window.activeView : 'excelImport');
      }
    } catch (err) {
      console.error('[excel-import] commit error', err);
      toast('Gagal commit import: ' + (err && err.message), 'danger');
    }
  }

  function _showSummary(result, created) {
    const host = document.getElementById('excel-preview');
    if (!host) return;
    host.innerHTML = `<div class="card" style="padding:18px">
      <div style="font-weight:600;font-size:.9375rem;margin-bottom:10px">Ringkasan Import</div>
      <ul style="font-size:.8125rem;line-height:1.9;margin:0;padding-left:18px">
        <li>Dokumen/entri dibuat: <strong>${result.created}</strong></li>
        <li>Customer baru: <strong>${created.customers}</strong></li>
        <li>Supplier baru: <strong>${created.suppliers}</strong></li>
        <li>Item baru: <strong>${created.items}</strong></li>
        <li>Duplikat dilewati (data sama, tanggal sama): <strong>${result.duplicates}</strong></li>
        <li>Baris dilewati (tidak valid): <strong>${result.skipped}</strong></li>
        ${result.doConflicts.length ? `<li style="color:var(--danger)">Nomor DO bentrok (tidak diimpor): ${esc(result.doConflicts.join(', '))}</li>` : ''}
        ${result.errors.length ? `<li style="color:var(--danger)">Error: ${esc(result.errors.join('; '))}</li>` : ''}
      </ul>
    </div>`;
  }

  // ── blank template (.xlsx) via NSAXlsx writer ────────────────────────────────
  function _downloadTemplate() {
    if (!window.NSAXlsx || typeof window.NSAXlsx.download !== 'function') {
      toast('Penulis Excel tidak tersedia', 'danger');
      return;
    }
    const sheets = Object.keys(SHEETS).map(name => ({
      name,
      columns: SHEETS[name].cols.map(c => ({
        header: c.h,
        type: c.t === 'num' ? 'currency' : 'text',
        width: Math.max(12, c.h.length + 4),
      })),
      rows: [],
    }));
    window.NSAXlsx.download('Template-Import-Nusantara.xlsx', sheets);
  }

  // ── per-module import (button inside Sales / Purchase / Logistics) ───────────
  // Lets the user import straight into one document type from its own list view,
  // instead of the full-workbook screen. Reuses the same parser, dedup, and
  // DO-number uniqueness as the global commit.
  const MODULE_IMPORT = {
    sales: { sheet: 'Sales Orders', label: 'Sales Order' },
    purchase: { sheet: 'Purchase Orders', label: 'Purchase Order' },
    logistics: { sheet: 'Delivery Orders', label: 'Delivery Order' },
  };

  function _showModuleConfirm(view, cfg, parsedSheet) {
    if (typeof window.openModal !== 'function') {
      // No modal layer — commit directly.
      _parsed = { [cfg.sheet]: parsedSheet };
      _commit({ module: true, view });
      return;
    }
    const def = SHEETS[cfg.sheet];
    const rows = parsedSheet.rows;
    const errRows = rows.filter(r => r._errors.length).length;
    let table =
      '<div class="table-wrap" style="overflow:auto;max-height:300px"><table style="width:100%;font-size:.75rem"><thead><tr>' +
      '<th style="text-align:left;padding:4px 8px">#</th>' +
      def.cols.map(c => `<th style="text-align:left;padding:4px 8px;white-space:nowrap">${esc(c.h)}</th>`).join('') +
      '<th style="text-align:left;padding:4px 8px">Validasi</th></tr></thead><tbody>';
    rows.slice(0, 50).forEach(r => {
      const bad = r._errors.length > 0;
      table += `<tr style="${bad ? 'background:var(--danger-bg)' : ''}">`;
      table += `<td style="padding:4px 8px;color:var(--muted)">${r._row}</td>`;
      def.cols.forEach(c => {
        table += `<td style="padding:4px 8px;white-space:nowrap">${esc(r[c.f])}</td>`;
      });
      table += `<td style="padding:4px 8px;color:${bad ? 'var(--danger)' : 'var(--success)'};white-space:nowrap">${
        bad ? esc(r._errors.join('; ')) : '✓'
      }</td></tr>`;
    });
    table += '</tbody></table></div>';
    if (rows.length > 50) {
      table += `<div style="font-size:.75rem;color:var(--muted);margin-top:6px">…dan ${rows.length - 50} baris lagi</div>`;
    }
    const body = `
      <div style="font-size:.75rem;color:var(--muted);margin-bottom:10px">
        ${rows.length} baris terbaca${errRows ? ` · <span style="color:var(--danger)">${errRows} bermasalah (dilewati)</span>` : ''}.
        Duplikat (data &amp; tanggal sama) otomatis dilewati${
          view === 'logistics' ? ', dan Nomor DO yang bentrok ditolak' : ''
        }.
      </div>
      ${parsedSheet.unknown.length ? `<div style="font-size:.75rem;color:var(--warning);margin-bottom:8px">Kolom tak dikenal diabaikan: ${esc(parsedSheet.unknown.join(', '))}</div>` : ''}
      ${table}`;
    const footer =
      '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
      '<button class="btn" id="mod-xls-commit">✓ Import</button>';
    window.openModal(`Import ${esc(cfg.label)} dari Excel`, body, footer, true);
    const btn = document.getElementById('mod-xls-commit');
    if (btn) {
      btn.addEventListener('click', () => {
        _parsed = { [cfg.sheet]: parsedSheet };
        if (typeof window.closeModal === 'function') window.closeModal();
        _commit({ module: true, view });
      });
    }
  }

  window.importModuleExcel = function importModuleExcel(view) {
    const cfg = MODULE_IMPORT[view];
    if (!cfg) return;
    if (!window.XLSX) {
      toast('Parser Excel belum siap (XLSX). Muat ulang halaman.', 'danger');
      return;
    }
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.xlsx,.xls';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', () => {
      const file = inp.files && inp.files[0];
      inp.remove();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        try {
          const wb = window.XLSX.read(new Uint8Array(ev.target.result), {
            type: 'array',
            cellDates: true,
          });
          const def = SHEETS[cfg.sheet];
          // Prefer the named sheet; fall back to the first sheet of a
          // single-sheet export.
          let ws = wb.Sheets[cfg.sheet];
          if (!ws) ws = wb.Sheets[wb.SheetNames[0]];
          const aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
          const parsedSheet = _parseRows(aoa, def);
          if (!parsedSheet.rows.length) {
            toast('Tidak ada baris yang dikenali di file ini', 'warning');
            return;
          }
          _showModuleConfirm(view, cfg, parsedSheet);
        } catch (err) {
          console.error('[excel-import] module parse error', err);
          toast('Gagal membaca file Excel: ' + (err && err.message), 'danger');
        }
      };
      reader.readAsArrayBuffer(file);
    });
    inp.click();
  };

  // ── view ─────────────────────────────────────────────────────────────────────
  window.renderExcelImport = function renderExcelImport() {
    return `
    <div class="sec-hdr" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
      <div>
        <h1>Import dari Excel</h1>
        <p class="sec-sub">Unggah file .xlsx untuk membuat data master dan transaksi. Jurnal dan nilai persediaan dihitung otomatis.</p>
      </div>
      <button class="btn-ghost" data-xls="template">Unduh Template</button>
    </div>

    <div class="card" style="padding:0;margin-bottom:16px">
      <div id="excel-dropzone" data-xls="pick"
        style="cursor:pointer;border:2px dashed var(--border);border-radius:var(--r);padding:34px 18px;text-align:center;transition:border-color .15s">
        <div style="margin-bottom:8px;color:var(--muted)"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>
        <div style="font-weight:600;font-size:.875rem;margin-bottom:4px">Tarik &amp; lepas file .xlsx di sini</div>
        <div style="font-size:.75rem;color:var(--muted)">atau klik untuk memilih file</div>
        <input id="excel-file" type="file" accept=".xlsx,.xls" style="display:none">
      </div>
    </div>

    <div id="excel-preview">
      <div style="padding:24px;text-align:center;color:var(--muted)">Belum ada data. Pilih file .xlsx untuk pratinjau.</div>
    </div>

    <div style="margin-top:16px;display:flex;gap:10px">
      <button class="btn" id="excel-commit-btn" data-xls="commit" style="display:none">✓ Commit Import</button>
    </div>`;
  };

  // ── delegated wiring (survives view re-renders) ──────────────────────────────
  document.addEventListener('change', e => {
    if (e.target && e.target.id === 'excel-file' && e.target.files && e.target.files[0]) {
      _handleFile(e.target.files[0]);
    }
  });
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-xls]');
    if (!t) return;
    e.preventDefault();
    const act = t.dataset.xls;
    if (act === 'template') _downloadTemplate();
    else if (act === 'commit') _commit();
    else if (act === 'pick') {
      const inp = document.getElementById('excel-file');
      if (inp) inp.click();
    }
  });
  document.addEventListener('dragover', e => {
    const dz = e.target.closest && e.target.closest('#excel-dropzone');
    if (dz) {
      e.preventDefault();
      dz.style.borderColor = 'var(--primary)';
    }
  });
  document.addEventListener('dragleave', e => {
    const dz = e.target.closest && e.target.closest('#excel-dropzone');
    if (dz) dz.style.borderColor = 'var(--border)';
  });
  document.addEventListener('drop', e => {
    const dz = e.target.closest && e.target.closest('#excel-dropzone');
    if (!dz) return;
    e.preventDefault();
    dz.style.borderColor = 'var(--border)';
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) _handleFile(f);
  });
})();
