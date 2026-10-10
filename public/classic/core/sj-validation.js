// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Validasi SJ Supplier  (sj-validation.js)
// ------------------------------------------------------------------------------
// Section 2 of the trading refactor: an anti under-invoicing cross-check that
// compares the FIELD Surat Jalan / weighbridge data (captured by FEAT-002 in
// goodsReceipts: per-line weighing.netQty + unitPrice, keyed by PO/DO/item)
// against the SUPPLIER's own Excel recap (rekap supplier) BEFORE a purchase
// invoice is issued.
//
// Why: a supplier recap that overstates tonnage or price relative to what the
// weighbridge actually recorded silently inflates the payable. Flagging the
// variance before invoicing prevents paying for goods that never arrived.
//
// This module ships three concerns, all exposed on the single window.SJValidation
// object:
//
//   1. CROSS-CHECK ENGINE (pure, unit-testable, no DOM)
//        crossCheck(fieldLines, recapRows, options) → {
//          rows: [{ key, matched, field, recap,
//                   tonnageVariance, tonnagePct, priceVariance, pricePct,
//                   tonnageMismatch, priceMismatch, mismatch }],
//          unmatchedRecap: [...],   // recap rows with no field counterpart
//          summary: { total, matched, mismatched, unmatchedRecap, unmatchedField }
//        }
//      Matching is by DO number / PO number / item (+ optional date). Tonnage
//      and price variances beyond a small CONFIGURABLE tolerance raise a
//      mismatch flag.
//
//   2. SUPPLIER RECAP PARSING (SheetJS, reusing the excel-import.js reader
//      pattern). parseRecapWorkbook(arrayBuffer) → recap rows in the engine's
//      expected shape. Column headers follow Template-Import-Nusantara.xlsx.
//
//   3. PLUGGABLE RECAP SOURCE CONTRACT: registerRecapSource({ id, label,
//      fetchRecaps }) lets a future e-mail mailbox adapter feed recaps through
//      the SAME contract the shipped manual file-upload source uses. NO live
//      mailbox/network provider is wired here (deferred by design).
//
// The 'Validasi SJ Supplier' view (openValidation) lists reconciled receipts,
// lets the operator attach a supplier recap via a registered source, runs the
// cross-check and colour-codes every tonnage / price mismatch.
//
// IIFE-wrapped classic <script>; declares NO top-level globals and exposes ONLY
// window.SJValidation.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function esc(s) {
    return typeof window.escapeHtml === 'function'
      ? window.escapeHtml(s)
      : String(s == null ? '' : s);
  }
  function money(v) {
    return typeof window.idrFull === 'function'
      ? window.idrFull(v)
      : typeof window.idr === 'function'
        ? window.idr(v)
        : 'Rp ' + (v || 0);
  }
  function db() {
    return window.DB || {};
  }
  function toast(m, t) {
    if (typeof window.showToast === 'function') window.showToast(m, t);
  }
  function nav(v) {
    if (typeof window.navigate === 'function') window.navigate(v);
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function round2(v) {
    return Math.round((num(v) + Number.EPSILON) * 100) / 100;
  }
  function injectView(hostView, html) {
    if (window.activeView !== hostView) nav(hostView);
    var el = document.getElementById('view-' + hostView);
    if (!el) {
      nav(hostView);
      el = document.getElementById('view-' + hostView);
    }
    if (el) el.innerHTML = html;
  }

  // Default variance tolerances. Configurable per call via options, so a
  // stricter/looser policy can be applied without touching the engine.
  //   tonnageAbs : absolute tonnage tolerance (same unit as netQty, e.g. tons)
  //   tonnagePct : relative tonnage tolerance (fraction, 0.01 = 1%)
  //   priceAbs   : absolute price/unit tolerance (Rp)
  //   pricePct   : relative price tolerance (fraction)
  // A variance within EITHER the absolute OR the percentage band passes; it must
  // breach BOTH to flag, which absorbs rounding noise on tiny quantities/prices.
  var DEFAULT_TOLERANCE = {
    tonnageAbs: 0.05,
    tonnagePct: 0.01,
    priceAbs: 1,
    pricePct: 0.005,
  };

  // ════════════════════════════════════════════════════════════════════════════
  // CROSS-CHECK ENGINE  (pure — no DOM, unit-testable)
  // ════════════════════════════════════════════════════════════════════════════

  // Normalise any string used as part of a match key: trimmed, upper-cased,
  // punctuation/space collapsed so "PO-2026/06.001" and "po 2026 06 001" align.
  function normKey(s) {
    return String(s == null ? '' : s)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '')
      .trim();
  }

  // Build the composite match key for a record. We key on PO number, DO number
  // and item. Item NAME is the primary item token because it is the identifier
  // that reliably appears on BOTH the field Surat Jalan and the supplier recap
  // (a supplier rarely knows our internal item code/id); code/id are the
  // fallback. Date is folded in ONLY when matchDate is on, so a recap that omits
  // the field date still matches by document + item.
  function matchKey(rec, matchDate) {
    var po = normKey(rec.poId || rec.poNumber || rec.po || '');
    var doNo = normKey(rec.doId || rec.doNumber || rec.do || rec.suratJalan || '');
    var item = normKey(rec.itemName || rec.item || rec.itemCode || rec.itemId || '');
    var docPart = po || doNo; // either document identifier anchors the row
    var key = docPart + '|' + item;
    if (matchDate && rec.date) key += '|' + normKey(rec.date);
    return key;
  }

  // Coerce an arbitrary field line (a goodsReceipt item + its receipt context)
  // into the engine's canonical field record.
  function normalizeFieldLine(line) {
    line = line || {};
    var w = line.weighing || {};
    // Weighed netto is the field truth; fall back to surat-jalan qty, then the
    // ordered qty, mirroring pipeline-extras.invoiceBasisQty precedence.
    var tonnage =
      line.netQty != null
        ? num(line.netQty)
        : w.netQty != null && (w.netQty || w.grossQty)
          ? num(w.netQty)
          : w.suratJalanQty != null && w.suratJalanQty
            ? num(w.suratJalanQty)
            : num(line.qty);
    return {
      poId: line.poId || line.poNumber || '',
      doId: line.doId || line.doNumber || line.suratJalan || '',
      itemId: line.itemId != null ? line.itemId : '',
      itemCode: line.itemCode || '',
      itemName: line.itemName || line.item || '',
      date: line.date || '',
      tonnage: round2(tonnage),
      unitPrice: round2(line.unitPrice != null ? line.unitPrice : line.price),
    };
  }

  // Coerce a parsed recap row into the canonical recap record.
  function normalizeRecapRow(row) {
    row = row || {};
    var tonnage = row.tonnage != null ? row.tonnage : row.qty != null ? row.qty : row.netQty;
    var price = row.unitPrice != null ? row.unitPrice : row.price != null ? row.price : row.harga;
    return {
      poId: row.poId || row.poNumber || row.po || '',
      doId: row.doId || row.doNumber || row.do || row.suratJalan || row.nomor || '',
      itemCode: row.itemCode || '',
      itemName: row.itemName || row.item || '',
      date: row.date || row.tanggal || '',
      tonnage: round2(tonnage),
      unitPrice: round2(price),
    };
  }

  // Absolute + relative variance test. Passes (no flag) when within EITHER band.
  function beyondTolerance(fieldVal, recapVal, absTol, pctTol) {
    var diff = Math.abs(num(recapVal) - num(fieldVal));
    if (diff <= num(absTol)) return false;
    var base = Math.abs(num(fieldVal));
    if (base > 0 && diff / base <= num(pctTol)) return false;
    return true;
  }

  function pct(fieldVal, variance) {
    var base = Math.abs(num(fieldVal));
    if (base === 0) return null;
    return round2((num(variance) / base) * 100);
  }

  // The core cross-check. Compares field Surat Jalan / weighed lines against a
  // parsed supplier recap and flags tonnage or price mismatches beyond tolerance.
  function crossCheck(fieldLines, recapRows, options) {
    options = options || {};
    var tol = {
      tonnageAbs: options.tonnageAbs != null ? options.tonnageAbs : DEFAULT_TOLERANCE.tonnageAbs,
      tonnagePct: options.tonnagePct != null ? options.tonnagePct : DEFAULT_TOLERANCE.tonnagePct,
      priceAbs: options.priceAbs != null ? options.priceAbs : DEFAULT_TOLERANCE.priceAbs,
      pricePct: options.pricePct != null ? options.pricePct : DEFAULT_TOLERANCE.pricePct,
    };
    var matchDate = !!options.matchDate;

    var fields = (fieldLines || []).map(normalizeFieldLine);
    var recaps = (recapRows || []).map(normalizeRecapRow);

    // Index recap rows by match key; keep a used-flag to surface unmatched ones.
    var recapIndex = {};
    recaps.forEach(function (r, i) {
      var k = matchKey(r, matchDate);
      if (!recapIndex[k]) recapIndex[k] = [];
      recapIndex[k].push({ row: r, idx: i, used: false });
    });

    var rows = [];
    var unmatchedField = 0;
    fields.forEach(function (f) {
      var k = matchKey(f, matchDate);
      var bucket = recapIndex[k];
      var hit = bucket && bucket.find(function (b) {
        return !b.used;
      });
      if (!hit) {
        unmatchedField++;
        rows.push({
          key: k,
          matched: false,
          field: f,
          recap: null,
          tonnageVariance: null,
          tonnagePct: null,
          priceVariance: null,
          pricePct: null,
          tonnageMismatch: false,
          priceMismatch: false,
          mismatch: true, // an unmatched field line cannot be validated → flag it
        });
        return;
      }
      hit.used = true;
      var r = hit.row;
      var tonnageVariance = round2(r.tonnage - f.tonnage);
      var priceVariance = round2(r.unitPrice - f.unitPrice);
      var tonnageMismatch = beyondTolerance(f.tonnage, r.tonnage, tol.tonnageAbs, tol.tonnagePct);
      var priceMismatch = beyondTolerance(f.unitPrice, r.unitPrice, tol.priceAbs, tol.pricePct);
      rows.push({
        key: k,
        matched: true,
        field: f,
        recap: r,
        tonnageVariance: tonnageVariance,
        tonnagePct: pct(f.tonnage, tonnageVariance),
        priceVariance: priceVariance,
        pricePct: pct(f.unitPrice, priceVariance),
        tonnageMismatch: tonnageMismatch,
        priceMismatch: priceMismatch,
        mismatch: tonnageMismatch || priceMismatch,
      });
    });

    // Recap rows that never matched a field line — potential phantom charges.
    var unmatchedRecap = [];
    Object.keys(recapIndex).forEach(function (k) {
      recapIndex[k].forEach(function (b) {
        if (!b.used) unmatchedRecap.push(b.row);
      });
    });

    var matched = rows.filter(function (r) {
      return r.matched;
    }).length;
    var mismatched = rows.filter(function (r) {
      return r.mismatch;
    }).length;
    // `clean` is the count that a "safe to invoice" widget should show: rows that
    // are matched to a recap counterpart AND carry no tonnage/price flag. It is
    // NOT `matched` (which includes matched-but-flagged rows) and it is NOT
    // `matched - mismatched` (mismatched also counts unmatched-field rows, so
    // that arithmetic double-subtracts). Deriving it here keeps callers/UI from
    // re-computing it incorrectly.
    var clean = rows.filter(function (r) {
      return r.matched && !r.mismatch;
    }).length;

    return {
      rows: rows,
      unmatchedRecap: unmatchedRecap,
      summary: {
        total: rows.length,
        matched: matched,
        clean: clean,
        mismatched: mismatched,
        unmatchedRecap: unmatchedRecap.length,
        unmatchedField: unmatchedField,
      },
    };
  }

  // Flatten reconciled goods receipts into engine field lines. Each receipt item
  // becomes one field line carrying its PO id, weighing and unit price.
  function fieldLinesFromReceipts(receipts) {
    var out = [];
    (receipts || []).forEach(function (r) {
      (r.items || []).forEach(function (it) {
        out.push({
          poId: r.poId || '',
          doId: r.doId || r.doNumber || '',
          date: r.reconciledAt || r.date || '',
          itemId: it.itemId,
          itemCode: it.itemCode || '',
          itemName: it.itemName || '',
          qty: it.qty,
          weighing: it.weighing,
          netQty: it.reconciledQty != null ? it.reconciledQty : undefined,
          unitPrice: it.unitPrice != null ? it.unitPrice : it.price,
        });
      });
    });
    return out;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SUPPLIER RECAP PARSING  (SheetJS — mirrors excel-import.js reader pattern)
  // ════════════════════════════════════════════════════════════════════════════

  // Header → canonical field. Accepts both the Template-Import-Nusantara.xlsx
  // "Delivery Orders" headers and a plainer supplier recap layout.
  var RECAP_COLS = [
    { keys: ['Tanggal', 'Date', 'Tgl'], f: 'date', t: 'date' },
    { keys: ['Nomor', 'No', 'No DO', 'DO Number', 'Nomor DO', 'Surat Jalan'], f: 'doNumber', t: 'text' },
    { keys: ['PO Number', 'Nomor PO', 'No PO'], f: 'poNumber', t: 'text' },
    { keys: ['SO Number'], f: 'soNumber', t: 'text' },
    { keys: ['Item Code', 'Kode Item', 'Kode'], f: 'itemCode', t: 'text' },
    { keys: ['Item Name', 'Nama Item', 'Item', 'Barang'], f: 'itemName', t: 'text' },
    { keys: ['Qty', 'Tonase', 'Tonnage', 'Netto', 'Berat', 'Kuantitas'], f: 'qty', t: 'num' },
    { keys: ['Unit', 'Satuan'], f: 'unit', t: 'text' },
    { keys: ['Harga', 'Price', 'Unit Price', 'Harga Satuan'], f: 'price', t: 'num' },
  ];

  function _parseNum(v) {
    if (v == null || v === '') return 0;
    if (typeof v === 'number') return v;
    var n = Number(
      String(v)
        .replace(/[^0-9.,-]/g, '')
        .replace(/\.(?=\d{3}\b)/g, '')
        .replace(',', '.')
    );
    return isNaN(n) ? 0 : n;
  }
  function _parseDate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') {
      var d = new Date(Math.round((v - 25569) * 86400 * 1000));
      return isNaN(d) ? '' : d.toISOString().slice(0, 10);
    }
    var s = String(v).trim();
    var m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    var dd = new Date(s);
    return isNaN(dd) ? s : dd.toISOString().slice(0, 10);
  }

  // Turn an array-of-arrays (SheetJS sheet_to_json with header:1) into recap rows.
  function rowsFromAoa(aoa) {
    if (!aoa || !aoa.length) return [];
    var headers = (aoa[0] || []).map(function (h) {
      return String(h == null ? '' : h).trim();
    });
    var idx = {};
    RECAP_COLS.forEach(function (c) {
      var found = -1;
      c.keys.some(function (k) {
        var i = headers.findIndex(function (h) {
          return h.toLowerCase() === k.toLowerCase();
        });
        if (i >= 0) {
          found = i;
          return true;
        }
        return false;
      });
      idx[c.f] = found;
    });
    var out = [];
    for (var r = 1; r < aoa.length; r++) {
      var raw = aoa[r] || [];
      if (raw.every(function (c) {
        return String(c == null ? '' : c).trim() === '';
      }))
        continue;
      var rec = {};
      RECAP_COLS.forEach(function (c) {
        var cell = idx[c.f] >= 0 ? raw[idx[c.f]] : '';
        if (c.t === 'num') rec[c.f] = _parseNum(cell);
        else if (c.t === 'date') rec[c.f] = _parseDate(cell);
        else rec[c.f] = String(cell == null ? '' : cell).trim();
      });
      // Only keep rows that carry at least an item and a document identifier.
      if (!rec.itemName && !rec.itemCode) continue;
      out.push(rec);
    }
    return out;
  }

  // Parse an uploaded supplier recap workbook (ArrayBuffer / Uint8Array) into
  // canonical recap rows. Reads the first sheet, or a sheet named like a recap.
  function parseRecapWorkbook(data) {
    if (!window.XLSX) throw new Error('Parser Excel (XLSX) belum siap');
    var wb = window.XLSX.read(data instanceof Uint8Array ? data : new Uint8Array(data), {
      type: 'array',
      cellDates: true,
    });
    var preferred = wb.SheetNames.find(function (n) {
      return /recap|rekap|delivery|surat|do|sj/i.test(n);
    });
    var sheetName = preferred || wb.SheetNames[0];
    var ws = wb.Sheets[sheetName];
    var aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    return rowsFromAoa(aoa);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // PLUGGABLE RECAP SOURCE CONTRACT
  // ------------------------------------------------------------------------------
  // A recap source is an adapter the app calls to obtain supplier recap rows:
  //   { id:string, label:string, fetchRecaps(ctx) → Promise<recapRow[]> }
  // The shipped source is a manual file upload. A FUTURE e-mail mailbox source
  // (deferred — no e-mail API here) implements the SAME contract, e.g.:
  //   SJValidation.registerRecapSource({
  //     id: 'mailbox',
  //     label: 'Kotak Masuk Email Supplier',
  //     fetchRecaps: function () {  // pulls the latest attachment from a mailbox
  //       return mailboxApi.latestAttachment().then(parseRecapWorkbook);
  //     }
  //   });
  // so attaching live e-mail ingestion later needs NO change to the engine/UI.
  // ════════════════════════════════════════════════════════════════════════════
  var _sources = {};

  function registerRecapSource(source) {
    if (!source || !source.id || typeof source.fetchRecaps !== 'function') {
      throw new Error('Sumber rekap tidak valid: butuh { id, label, fetchRecaps() }');
    }
    _sources[source.id] = {
      id: source.id,
      label: source.label || source.id,
      fetchRecaps: source.fetchRecaps,
    };
    return source.id;
  }
  function getRecapSources() {
    return Object.keys(_sources).map(function (id) {
      return { id: _sources[id].id, label: _sources[id].label };
    });
  }
  function fetchFromSource(id, ctx) {
    var s = _sources[id];
    if (!s) return Promise.reject(new Error('Sumber rekap "' + id + '" belum terdaftar'));
    return Promise.resolve().then(function () {
      return s.fetchRecaps(ctx || {});
    });
  }

  // Shipped source: manual file upload. Opens a hidden <input type=file>, parses
  // the chosen workbook and resolves with recap rows.
  function _pickFile() {
    return new Promise(function (resolve, reject) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xls,.csv';
      input.style.display = 'none';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) {
          reject(new Error('Tidak ada file dipilih'));
          return;
        }
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            resolve(parseRecapWorkbook(ev.target.result));
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = function () {
          reject(new Error('Gagal membaca file'));
        };
        reader.readAsArrayBuffer(file);
      });
      document.body.appendChild(input);
      input.click();
      setTimeout(function () {
        if (input.parentNode) input.parentNode.removeChild(input);
      }, 0);
    });
  }

  registerRecapSource({
    id: 'upload',
    label: 'Unggah File Excel',
    fetchRecaps: function () {
      return _pickFile();
    },
  });

  // ════════════════════════════════════════════════════════════════════════════
  // DEMO SEED
  // ------------------------------------------------------------------------------
  // Seeds one reconciled receipt (field Surat Jalan / timbangan) plus a supplier
  // recap holding one MATCHING row and one MISMATCHING row, so the colour-coded
  // flagging is demonstrable without real data. Idempotent (keyed by id).
  // ════════════════════════════════════════════════════════════════════════════
  var DEMO_RECEIPT_ID = 'GR-DEMO-SJ';

  function seedDemo() {
    var receipts = db().goodsReceipts || (db().goodsReceipts = []);
    if (!receipts.find(function (r) {
      return r.id === DEMO_RECEIPT_ID;
    })) {
      receipts.push({
        id: DEMO_RECEIPT_ID,
        poId: 'PO-DEMO-SJ',
        doId: 'DO-DEMO-SJ',
        supplierName: 'CV Batu Alam Sejahtera (Demo)',
        date: '2026-06-10',
        reconciled: true,
        reconciledAt: '2026-06-10',
        items: [
          {
            itemId: 'ANDESIT-20',
            itemName: 'Batu Andesit 20cm',
            qty: 25,
            unitPrice: 185000,
            weighing: { suratJalanQty: 25, grossQty: 40, tareQty: 15, netQty: 24.6 },
            reconciledQty: 24.6,
          },
          {
            itemId: 'PASIR-COR',
            itemName: 'Pasir Cor',
            qty: 30,
            unitPrice: 210000,
            weighing: { suratJalanQty: 30, grossQty: 45, tareQty: 15, netQty: 30 },
            reconciledQty: 30,
          },
        ],
      });
    }
    // Demo supplier recap: row 1 matches within tolerance, row 2 overstates both
    // tonnage AND price (under-invoicing risk → must flag).
    var recap = [
      {
        poNumber: 'PO-DEMO-SJ',
        doNumber: 'DO-DEMO-SJ',
        itemName: 'Batu Andesit 20cm',
        date: '2026-06-10',
        qty: 24.6,
        price: 185000,
      },
      {
        poNumber: 'PO-DEMO-SJ',
        doNumber: 'DO-DEMO-SJ',
        itemName: 'Pasir Cor',
        date: '2026-06-10',
        qty: 33, // overstates 30 → +3 tons
        price: 225000, // overstates 210000 → +15.000/unit
      },
    ];
    return { recapRows: recap };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW  (Validasi SJ Supplier)  — host view: 'purchase'
  // ════════════════════════════════════════════════════════════════════════════
  var HOST_VIEW = 'purchase';
  // Last recap attached in the UI (in-memory), so re-renders keep the result.
  var _attachedRecap = null;

  function _reconciledReceipts() {
    return (db().goodsReceipts || []).filter(function (r) {
      return r.reconciled;
    });
  }

  // kind: success | warning | danger (style.css .badge-*).
  function _badge(text, kind) {
    return '<span class="badge badge-' + kind + '">' + esc(text) + '</span>';
  }

  function _resultRowsHtml(result) {
    if (!result.rows.length) {
      return (
        '<tr><td colspan="8" class="td-empty" style="text-align:center;padding:24px;color:var(--muted)">Belum ada baris untuk divalidasi.</td></tr>'
      );
    }
    return result.rows
      .map(function (row) {
        var f = row.field;
        var r = row.recap;
        var rowBg = row.mismatch ? 'background:var(--danger-bg)' : '';
        var okBadge = _badge('Sesuai', 'success');
        var flagT = row.tonnageMismatch ? _badge('Selisih Tonase', 'danger') : '';
        var flagP = row.priceMismatch ? _badge('Selisih Harga', 'danger') : '';
        var flagU = !row.matched ? _badge('Tidak ada di rekap', 'warning') : '';
        var status = row.mismatch ? flagT + ' ' + flagP + ' ' + flagU : okBadge;
        var tv = row.tonnageVariance == null ? '—' : (row.tonnageVariance > 0 ? '+' : '') + row.tonnageVariance;
        var pv = row.priceVariance == null ? '—' : (row.priceVariance > 0 ? '+' : '') + money(row.priceVariance);
        var varColor = function (mm) {
          return mm ? 'color:var(--danger);font-weight:700' : 'color:var(--muted)';
        };
        return (
          '<tr style="' + rowBg + '">' +
          '<td class="td-p" style="font-size:.875rem">' + esc(f.itemName || f.itemCode || f.itemId) + '</td>' +
          '<td class="td-p" style="font-size:.8125rem;color:var(--primary)">' + esc(f.poId || f.doId || '—') + '</td>' +
          '<td class="td-p" style="text-align:right;font-size:.875rem">' + f.tonnage + '</td>' +
          '<td class="td-p" style="text-align:right;font-size:.875rem">' + (r ? r.tonnage : '—') + '</td>' +
          '<td class="td-p" style="text-align:right;font-size:.875rem;' + varColor(row.tonnageMismatch) + '">' + tv + '</td>' +
          '<td class="td-p" style="text-align:right;font-size:.875rem">' + money(f.unitPrice) + '</td>' +
          '<td class="td-p" style="text-align:right;font-size:.875rem;' + varColor(row.priceMismatch) + '">' + pv + '</td>' +
          '<td class="td-p">' + status + '</td>' +
          '</tr>'
        );
      })
      .join('');
  }

  function _unmatchedRecapHtml(result) {
    if (!result.unmatchedRecap.length) return '';
    var rows = result.unmatchedRecap
      .map(function (r) {
        return (
          '<tr style="background:var(--warning-bg)">' +
          '<td class="td-p" style="font-size:.875rem">' + esc(r.itemName || r.itemCode) + '</td>' +
          '<td class="td-p" style="font-size:.8125rem">' + esc(r.poId || r.doId || '—') + '</td>' +
          '<td class="td-p" style="text-align:right;font-size:.875rem">' + r.tonnage + '</td>' +
          '<td class="td-p" style="text-align:right;font-size:.875rem">' + money(r.unitPrice) + '</td>' +
          '</tr>'
        );
      })
      .join('');
    return (
      '<div class="card" style="margin-top:16px;border-left:4px solid var(--warning)">' +
      '<h3 style="font-size:1rem;margin:0 0 4px">Baris Rekap Tanpa Padanan Lapangan</h3>' +
      '<p style="font-size:.8125rem;color:var(--muted);margin:0 0 10px">Baris rekap supplier ini tidak ada di data Surat Jalan / timbangan lapangan — potensi tagihan fiktif. Periksa sebelum faktur.</p>' +
      '<div class="table-wrap"><table style="width:100%">' +
      '<thead><tr><th>Item</th><th>Dokumen</th><th style="text-align:right">Tonase Rekap</th><th style="text-align:right">Harga Rekap</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>'
    );
  }

  function _renderResult() {
    var host = document.getElementById('sjv-result');
    if (!host) return;
    if (!_attachedRecap) {
      host.innerHTML =
        '<div class="card" style="text-align:center;padding:26px;color:var(--muted);font-size:.875rem">Lampirkan rekap supplier untuk menjalankan validasi silang.</div>';
      return;
    }
    var fieldLines = fieldLinesFromReceipts(_reconciledReceipts());
    var result = crossCheck(fieldLines, _attachedRecap);
    var s = result.summary;
    // Safe to invoice only when every field line matches within tolerance AND
    // the recap has no rows without a field counterpart (possible phantom charges).
    var problems = [];
    if (s.mismatched > 0) problems.push(s.mismatched + ' baris bermasalah');
    if (s.unmatchedRecap > 0) problems.push(s.unmatchedRecap + ' baris rekap tanpa padanan');
    var banner =
      s.total === 0
        ? '<div class="notice notice-info">Belum ada penerimaan yang direkonsiliasi untuk dicocokkan dengan rekap ini.</div>'
        : problems.length > 0
          ? '<div class="notice" style="display:block;background:var(--danger-bg);border-color:transparent;color:var(--text)">' +
            '<div style="font-size:.9375rem;font-weight:600;color:var(--danger)">' + problems.join(' dan ') + ' — jangan terbitkan faktur sebelum diperiksa</div>' +
            '<div style="margin-top:4px">Rekap supplier berbeda dari data timbangan lapangan (tonase/harga) atau memuat baris yang tidak ada di lapangan. Ini mencegah kurang tagih atau lebih bayar.</div>' +
            '</div>'
          : '<div class="notice notice-success"><strong>Semua baris cocok dalam toleransi — aman untuk difakturkan</strong></div>';
    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Baris Divalidasi', value: String(s.total), sub: 'Dari data lapangan' },
            { label: 'Cocok', value: String(s.clean != null ? s.clean : 0), sub: 'Cocok & dalam toleransi', color: 'var(--success)' },
            { label: 'Bermasalah', value: String(s.mismatched), sub: 'Selisih / tidak ada di rekap', color: 'var(--danger)' },
            { label: 'Rekap Tanpa Padanan', value: String(s.unmatchedRecap), sub: 'Cek tagihan fiktif', color: 'var(--warning)' },
          ])
        : '';
    host.innerHTML =
      banner +
      stats +
      '<div class="card"><div class="table-wrap"><table style="width:100%">' +
      '<thead><tr>' +
      '<th>Item</th><th>Dokumen</th>' +
      '<th style="text-align:right">Tonase Lapangan</th><th style="text-align:right">Tonase Rekap</th><th style="text-align:right">Selisih</th>' +
      '<th style="text-align:right">Harga Lapangan</th><th style="text-align:right">Selisih Harga</th>' +
      '<th>Status</th>' +
      '</tr></thead><tbody>' +
      _resultRowsHtml(result) +
      '</tbody></table></div></div>' +
      _unmatchedRecapHtml(result);
  }

  function openValidation() {
    var receipts = _reconciledReceipts();
    var sources = getRecapSources();
    var sourceOpts = sources
      .map(function (s) {
        return '<option value="' + esc(s.id) + '">' + esc(s.label) + '</option>';
      })
      .join('');

    var header =
      typeof window.secHdr === 'function'
        ? window.secHdr(
            'Validasi SJ Supplier',
            'Cocokkan tonase & harga Surat Jalan lapangan dengan rekap supplier sebelum faktur',
            'Muat Contoh Demo',
            'sjvSeedDemo',
            { showSub: true }
          )
        : '<h1>Validasi SJ Supplier</h1>';

    var stats =
      typeof window.statRow === 'function'
        ? window.statRow([
            { label: 'Penerimaan Direkonsiliasi', value: String(receipts.length), sub: 'Sumber data lapangan' },
            { label: 'Sumber Rekap', value: String(sources.length), sub: 'Cara memuat rekap' },
          ])
        : '';

    var controls =
      '<div class="card" style="margin-bottom:14px">' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:end">' +
      '<label style="display:flex;flex-direction:column;gap:4px;font-size:.875rem;font-weight:500;color:var(--text-secondary)">Sumber Rekap Supplier' +
      '<select id="sjv-source" style="padding:9px 11px;border:1px solid var(--border);border-radius:8px;font-size:.875rem;background:var(--surface);color:var(--text)">' +
      sourceOpts +
      '</select></label>' +
      '<button class="btn-primary" data-action="sjvAttach" style="font-size:.875rem;padding:10px 16px">Lampirkan & Validasi</button>' +
      (_attachedRecap ? '<button class="btn-ghost" data-action="sjvClear" style="font-size:.875rem;padding:10px 16px">Bersihkan</button>' : '') +
      '</div>' +
      '<div style="font-size:.8125rem;color:var(--muted);margin-top:8px">Pilih sumber rekap, lalu lampirkan rekap supplier untuk dicocokkan dengan data timbangan lapangan.</div>' +
      '</div>';

    injectView(
      HOST_VIEW,
      header + stats + controls + '<div id="sjv-result"></div>'
    );
    setTimeout(_renderResult, 0);
  }

  function _attach() {
    var sel = document.getElementById('sjv-source');
    var id = sel ? sel.value : 'upload';
    fetchFromSource(id)
      .then(function (rows) {
        if (!rows || !rows.length) {
          toast('Tidak ada baris rekap yang terbaca', 'warning');
          return;
        }
        _attachedRecap = rows;
        toast(rows.length + ' baris rekap dimuat', 'success');
        _renderResult();
      })
      .catch(function (err) {
        toast('Gagal memuat rekap: ' + (err && err.message ? err.message : err), 'danger');
      });
  }

  function _seedDemoAndShow() {
    var demo = seedDemo();
    if (typeof window.saveDB === 'function') window.saveDB();
    _attachedRecap = demo.recapRows;
    toast('Data contoh demo dimuat', 'success');
    openValidation();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION
  // ════════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest && e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'sjvAttach':
        _attach();
        break;
      case 'sjvClear':
        _attachedRecap = null;
        _renderResult();
        break;
      case 'sjvSeedDemo':
        _seedDemoAndShow();
        break;
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // EXPOSE  (single window global)
  // ════════════════════════════════════════════════════════════════════════════
  window.SJValidation = {
    // pure engine (unit-testable)
    crossCheck: crossCheck,
    normalizeFieldLine: normalizeFieldLine,
    normalizeRecapRow: normalizeRecapRow,
    matchKey: matchKey,
    fieldLinesFromReceipts: fieldLinesFromReceipts,
    DEFAULT_TOLERANCE: DEFAULT_TOLERANCE,
    // recap parsing
    parseRecapWorkbook: parseRecapWorkbook,
    rowsFromAoa: rowsFromAoa,
    // pluggable source contract
    registerRecapSource: registerRecapSource,
    getRecapSources: getRecapSources,
    fetchFromSource: fetchFromSource,
    // demo
    seedDemo: seedDemo,
    // view
    openValidation: openValidation,
  };

  console.log('[SJValidation] Supplier SJ cross-check ready');
})();
