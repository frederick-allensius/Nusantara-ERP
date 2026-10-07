// ══════════════════════════════════════════════════════════════════════════════
//  TAX EXTRAS  — Pajak & PPN page, Ekspor Coretax (faktur pajak keluaran),
//  Tax Invoice Email, e-Faktur format lama
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';

  function db() {
    return window.DB || {};
  }
  function save() {
    window.saveDB && window.saveDB();
  }
  function toast(msg, type) {
    window.showToast && window.showToast(msg, type || 'success');
  }
  function esc(s) {
    return window.escapeHtml ? window.escapeHtml(s) : String(s == null ? '' : s);
  }
  function money(v) {
    return window.idrFull ? window.idrFull(v) : 'Rp ' + (v || 0);
  }
  function today() {
    return new Date().toISOString().slice(0, 10);
  }
  function modal(t, b, f, w) {
    window.openModal && window.openModal(t, b, f || '', w);
  }
  function closeM() {
    window.closeModal && window.closeModal();
  }

  function injectView(html) {
    window.invalidateView && window.invalidateView('tax');
    window.navigate && window.navigate('tax');
    setTimeout(function () {
      var el = document.getElementById('view-tax');
      if (el) el.innerHTML = html;
    }, 0);
  }

  // ── Output tax documents ──────────────────────────────────────────────────
  // The documents that post PPN Keluaran to the ledger, with the same rules as
  // Rekap PPN (report-extras.js): active sales invoices, and delivered sales
  // orders that have no active invoice yet. Drafts and cancelled documents never
  // count. DPP and PPN come from the lines and the stored tax (tax-inclusive
  // prices handled), so they match the journals.
  //
  // Each row also carries per-line DPP, which the Coretax export needs.
  function docTax(d) {
    var rate = Number(d.taxRate) || 0;
    var lines = d.lines || [];
    var net = lines.reduce(function (s, l) {
      return s + (Number(l.subtotal) || 0);
    }, 0);
    if (rate <= 0) return { rate: 0, dpp: net, ppn: 0, incl: false };
    var incl = !!d.taxInclusive;
    var ppn =
      typeof d.tax === 'number'
        ? Math.round(d.tax)
        : Math.round(incl ? (net * rate) / (1 + rate) : net * rate);
    return { rate: rate, dpp: incl ? net - ppn : net, ppn: ppn, incl: incl };
  }

  function taxLines(d, t) {
    return (d.lines || []).map(function (l) {
      var qty = Number(l.qty) || 0;
      var sub = Number(l.subtotal) || 0;
      var price = Number(l.price) || 0;
      if (t.incl && t.rate > 0) {
        sub = sub / (1 + t.rate);
        price = price / (1 + t.rate);
      }
      return {
        itemId: l.itemId,
        name: l.itemName || l.name || '',
        unit: l.unit || '',
        qty: qty,
        price: price,
        discount: Math.max(0, qty * price - sub),
        dpp: sub,
      };
    });
  }

  function getVatInvoices(period) {
    var B = window.Balances;
    var customers = db().customers || [];
    var invoices = db().salesInvoices || [];
    var rows = [];
    function inPeriod(d) {
      return !period || (d.date || '').slice(0, 7) === period;
    }
    function add(d, docType) {
      var t = docTax(d);
      if (t.ppn <= 0) return;
      var cust =
        customers.find(function (c) {
          return String(c.id) === String(d.customerId);
        }) ||
        customers.find(function (c) {
          return c.name === d.customer;
        }) ||
        null;
      rows.push({
        key: docType + ':' + d.id,
        docType: docType,
        docId: d.id,
        id: d.number || d.id,
        number: d.number || d.id,
        orderId: docType === 'SO' ? d.id : d.sourceId || '',
        date: d.date || '',
        customerId: cust ? cust.id : d.customerId || '',
        customerName: d.customer || (cust ? cust.name : '—'),
        npwp: (cust && cust.npwp) || '',
        address: (cust && cust.address) || '',
        email: (cust && cust.email) || '',
        rate: t.rate,
        dpp: t.dpp,
        ppn: t.ppn,
        total: t.dpp + t.ppn,
        status: d.status,
        efakturNo: d.efakturNo || '',
        emailSent: !!d.emailSent,
        lines: taxLines(d, t),
      });
    }
    invoices.forEach(function (inv) {
      var active = B
        ? B.isActiveInvoice(inv)
        : inv.status === 'Outstanding' || inv.status === 'Paid';
      if (active && inPeriod(inv)) add(inv, 'SI');
    });
    (db().salesOrders || []).forEach(function (so) {
      if (so.status !== 'Delivered' || !inPeriod(so)) return;
      var invoiced = B
        ? B.activeInvoiceFor('sales', so.id)
        : invoices.some(function (i) {
            return i.sourceId === so.id && i.status !== 'Draft' && i.status !== 'Cancelled';
          });
      if (!invoiced) add(so, 'SO');
    });
    return rows.sort(function (a, b) {
      return a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    });
  }

  // ── Coretax (DJP) XML ─────────────────────────────────────────────────────
  // Layout of the "Faktur Pajak Keluaran" import file, following DJP's sample
  // XML that ships with the Excel template/converter (TaxInvoiceBulk → TaxInvoice →
  // ListOfGoodService → GoodService). DJP publishes no XSD; the first export must
  // be checked by importing it in Coretax (Faktur Keluaran → Impor). PPN 11% is
  // reported the Coretax way for kode 04: VATRate 12 on a DPP Nilai Lain of
  // 11/12 × DPP, which gives the same PPN.
  var CORETAX_DEFAULTS = {
    trxCode: '04',
    goodsCode: '000000',
    otherUnitCode: 'UM.0033', // "Lainnya"
    unitCodes: {
      ton: 'UM.0001',
      kg: 'UM.0003',
      liter: 'UM.0007',
      unit: 'UM.0018',
      pcs: 'UM.0021',
    },
  };

  function digits(s) {
    return String(s || '').replace(/\D/g, '');
  }

  // NPWP for Coretax is 16 digits; a 15-digit (old format) NPWP gets a leading 0.
  function tin16(npwp) {
    var d = digits(npwp);
    return d.length === 15 ? '0' + d : d;
  }

  function xmlText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dec(n) {
    return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
  }

  function coretaxCfg() {
    var s = db().settings || {};
    var cfg = s.efakturCfg || {};
    return {
      npwp: cfg.npwp || (s.tax && s.tax.npwp) || '',
      nitku: cfg.nitku || '',
      trxCode: cfg.trxCode || CORETAX_DEFAULTS.trxCode,
      unitCodes: cfg.unitCodes || {},
      goodsCodes: cfg.goodsCodes || {},
    };
  }

  function unitCode(unit, cfg) {
    var u = String(unit || '').trim();
    return (
      (cfg.unitCodes && cfg.unitCodes[u]) ||
      CORETAX_DEFAULTS.unitCodes[u.toLowerCase()] ||
      CORETAX_DEFAULTS.otherUnitCode
    );
  }

  // Problems that would make Coretax reject the file or leave the data incomplete.
  function coretaxWarnings(rows, cfg) {
    var out = [];
    if (tin16(cfg.npwp).length !== 16) {
      out.push('NPWP perusahaan belum diisi atau bukan 16 digit (lihat Konfigurasi).');
    }
    var noNpwp = {};
    var otherUnits = {};
    rows.forEach(function (r) {
      if (tin16(r.npwp).length !== 16) noNpwp[r.customerName] = true;
      r.lines.forEach(function (l) {
        if (unitCode(l.unit, cfg) === CORETAX_DEFAULTS.otherUnitCode) {
          otherUnits[l.unit || '(kosong)'] = true;
        }
      });
    });
    var names = Object.keys(noNpwp);
    if (names.length) {
      out.push(
        'Pelanggan tanpa NPWP 16 digit: ' +
          names.join(', ') +
          '. Fakturnya diekspor dengan dokumen "Other ID"; lengkapi NPWP di data pelanggan bila ada.'
      );
    }
    var units = Object.keys(otherUnits);
    if (units.length) {
      out.push(
        'Satuan tanpa kode Coretax (dipakai UM.0033 "Lainnya"): ' + units.join(', ') + '.'
      );
    }
    return out;
  }

  function coretaxXml(rows, cfg) {
    cfg = cfg || coretaxCfg();
    var tin = tin16(cfg.npwp);
    var sellerIdtku = digits(cfg.nitku) || tin + '000000';
    var x = [];
    x.push('<?xml version="1.0" encoding="utf-8"?>');
    x.push(
      '<TaxInvoiceBulk xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    );
    x.push('  <TIN>' + xmlText(tin) + '</TIN>');
    x.push('  <ListOfTaxInvoice>');
    rows.forEach(function (r) {
      var buyerTin = tin16(r.npwp);
      var hasTin = buyerTin.length === 16;
      x.push('    <TaxInvoice>');
      x.push('      <TaxInvoiceDate>' + xmlText(r.date) + '</TaxInvoiceDate>');
      x.push('      <TaxInvoiceOpt>Normal</TaxInvoiceOpt>');
      x.push('      <TrxCode>' + xmlText(cfg.trxCode) + '</TrxCode>');
      x.push('      <AddInfo></AddInfo>');
      x.push('      <CustomDoc></CustomDoc>');
      x.push('      <RefDesc>' + xmlText(r.number) + '</RefDesc>');
      x.push('      <FacilityStamp></FacilityStamp>');
      x.push('      <SellerIDTKU>' + xmlText(sellerIdtku) + '</SellerIDTKU>');
      x.push('      <BuyerTin>' + (hasTin ? buyerTin : '0000000000000000') + '</BuyerTin>');
      x.push('      <BuyerDocument>' + (hasTin ? 'TIN' : 'Other ID') + '</BuyerDocument>');
      x.push('      <BuyerCountry>IDN</BuyerCountry>');
      x.push(
        '      <BuyerDocumentNumber>' +
          xmlText(hasTin ? '-' : r.customerId || '-') +
          '</BuyerDocumentNumber>'
      );
      x.push('      <BuyerName>' + xmlText(r.customerName) + '</BuyerName>');
      x.push('      <BuyerAdress>' + xmlText(r.address) + '</BuyerAdress>');
      x.push('      <BuyerEmail>' + xmlText(r.email) + '</BuyerEmail>');
      x.push('      <BuyerIDTKU>' + (hasTin ? buyerTin + '000000' : '000000') + '</BuyerIDTKU>');
      x.push('      <ListOfGoodService>');
      // Lines share the document's PPN in proportion to their DPP; the last line
      // takes the rounding remainder, so the file totals equal the ledger.
      var left = r.ppn;
      r.lines.forEach(function (l, i) {
        var vat =
          i === r.lines.length - 1 ? left : Math.round(r.dpp ? (r.ppn * l.dpp) / r.dpp : 0);
        left -= vat;
        var other = r.rate >= 0.12 ? l.dpp : (l.dpp * 11) / 12;
        var code = (cfg.goodsCodes && cfg.goodsCodes[l.itemId]) || CORETAX_DEFAULTS.goodsCode;
        x.push('        <GoodService>');
        x.push('          <Opt>A</Opt>');
        x.push('          <Code>' + xmlText(code) + '</Code>');
        x.push('          <Name>' + xmlText(l.name) + '</Name>');
        x.push('          <Unit>' + xmlText(unitCode(l.unit, cfg)) + '</Unit>');
        x.push('          <Price>' + dec(l.price) + '</Price>');
        x.push('          <Qty>' + (Number(l.qty) || 0) + '</Qty>');
        x.push('          <TotalDiscount>' + dec(l.discount) + '</TotalDiscount>');
        x.push('          <TaxBase>' + dec(l.dpp) + '</TaxBase>');
        x.push('          <OtherTaxBase>' + dec(other) + '</OtherTaxBase>');
        x.push('          <VATRate>12</VATRate>');
        x.push('          <VAT>' + dec(vat) + '</VAT>');
        x.push('          <STLGRate>0</STLGRate>');
        x.push('          <STLG>0</STLG>');
        x.push('        </GoodService>');
      });
      x.push('      </ListOfGoodService>');
      x.push('    </TaxInvoice>');
    });
    x.push('  </ListOfTaxInvoice>');
    x.push('</TaxInvoiceBulk>');
    return x.join('\n');
  }

  function downloadFile(content, filename, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('File ' + filename + ' diunduh', 'success');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 0  PAJAK & PPN (view 'tax')
  // ══════════════════════════════════════════════════════════════════════════
  // Page renderer of the tax view (renderTax() in erp-view.js calls it): PPN of
  // one tax period (masa pajak) from the documents that post PPN to the ledger —
  // the figures, CSV and document lists come from report-extras.js (Rekap PPN) —
  // then the tax settings and compliance status. Explanations sit behind a
  // "Penjelasan" toggle (style.css .tax-…).
  var _taxPeriod = null;

  function taxFact(label, value) {
    return (
      '<div class="tax-fact"><span class="t-muted">' +
      esc(label) +
      '</span><span class="t-num">' +
      esc(value) +
      '</span></div>'
    );
  }

  function taxExplain(text) {
    return (
      '<details class="tax-explain"><summary>Penjelasan</summary><p>' +
      esc(text) +
      '</p></details>'
    );
  }

  function renderTaxPage() {
    if (typeof window.calcTaxSummary !== 'function') return '';
    var summary = window.calcTaxSummary();
    var tax = summary.tax;
    var ratePct = (tax.ppnRate * 100).toFixed(2).replace(/\.00$/, '');
    var roundingLabel =
      tax.rounding === 'floor'
        ? 'Dibulatkan ke bawah'
        : tax.rounding === 'ceil'
          ? 'Dibulatkan ke atas'
          : 'Dibulatkan normal';
    var efakturCount = summary.salesOrders.filter(function (o) {
      return o.status === 'Paid' || o.status === 'Delivered';
    }).length;

    var rx = window._reportExtras;
    var periods = rx && rx.sptPeriods ? rx.sptPeriods() : [today().slice(0, 7)];
    var period = _taxPeriod && periods.indexOf(_taxPeriod) !== -1 ? _taxPeriod : today().slice(0, 7);
    var pOpts = periods
      .map(function (p) {
        return (
          '<option value="' +
          esc(p) +
          '"' +
          (p === period ? ' selected' : '') +
          '>' +
          esc(periodLabel(p)) +
          '</option>'
        );
      })
      .join('');

    var header =
      '<div class="sec-hdr"><div><h1>Pajak &amp; PPN</h1>' +
      '<p>Per masa pajak, dari dokumen yang sudah diposting. Faktur pajak dan SPT tetap lewat aplikasi DJP.</p></div>' +
      '<div><select class="form-select" id="tax-period" aria-label="Masa pajak" style="width:auto">' +
      pOpts +
      '</select>' +
      '<button class="btn-ghost" data-action="exportSPT">Ekspor CSV</button>' +
      '<button class="btn-ghost" data-action="editTaxSettings">Ubah Pengaturan Pajak</button></div></div>';

    var section =
      rx && rx.sptSectionHTML
        ? rx.sptSectionHTML(period, { label: 'Tarif PPN', value: ratePct + '%', sub: roundingLabel })
        : '';

    return (
      header +
      section +
      '<div class="card"><div class="card-head"><div class="card-title">Status Kepatuhan</div></div>' +
      '<div class="tax-facts">' +
      taxFact('Status PKP', tax.pkp ? 'Terdaftar' : 'Belum PKP') +
      taxFact('NPWP', tax.npwp) +
      taxFact('e-Faktur siap kirim', efakturCount + ' transaksi') +
      '</div>' +
      taxExplain('e-Faktur siap kirim dihitung dari transaksi penjualan berstatus Paid/Delivered.') +
      '</div>'
    );
  }

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'tax-period') {
      _taxPeriod = e.target.value;
      var el = document.getElementById('view-tax');
      if (el) el.innerHTML = renderTaxPage();
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // § 1  FAKTUR PAJAK KELUARAN — ekspor Coretax (dan CSV format lama)
  // ══════════════════════════════════════════════════════════════════════════
  var _efPeriod = null;

  function efPeriods() {
    var set = {};
    set[today().slice(0, 7)] = true;
    (db().salesInvoices || []).concat(db().salesOrders || []).forEach(function (d) {
      if (d.date) set[d.date.slice(0, 7)] = true;
    });
    return Object.keys(set).sort().reverse();
  }

  function periodLabel(p) {
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return m[Number(p.slice(5, 7)) - 1] + ' ' + p.slice(0, 4);
  }

  function openEFakturCTAS() {
    var period = _efPeriod || today().slice(0, 7);
    var invoices = getVatInvoices(period);
    var cfg = coretaxCfg();
    var warnings = coretaxWarnings(invoices, cfg);
    var totalDPP = invoices.reduce(function (s, i) {
      return s + i.dpp;
    }, 0);
    var totalPPN = invoices.reduce(function (s, i) {
      return s + i.ppn;
    }, 0);

    var rows =
      invoices
        .map(function (inv) {
          var tinOk = tin16(inv.npwp).length === 16;
          return (
            '<tr>' +
            '<td class="td-p" style="white-space:nowrap">' +
            esc(inv.date) +
            '</td>' +
            '<td class="td-p">' +
            esc(inv.number) +
            (inv.docType === 'SO'
              ? ' <span class="badge badge-neutral" title="Pesanan terkirim yang belum difakturkan">Belum difakturkan</span>'
              : '') +
            '</td>' +
            '<td class="td-p">' +
            esc(inv.customerName) +
            '</td>' +
            '<td class="td-p">' +
            (tinOk ? esc(inv.npwp) : '<span class="badge badge-warning">Tanpa NPWP</span>') +
            '</td>' +
            '<td class="td-p" style="text-align:right">' +
            money(inv.dpp) +
            '</td>' +
            '<td class="td-p" style="text-align:right">' +
            money(inv.ppn) +
            '</td>' +
            '<td class="td-p">' +
            esc(inv.efakturNo || '—') +
            '</td>' +
            '<td class="td-p" style="text-align:center">' +
            '<button class="btn-ghost btn-sm" data-action="setEfakturNo" data-key="' +
            esc(inv.key) +
            '">No. Faktur Pajak</button>' +
            '</td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="8" class="td-empty">Tidak ada faktur ber-PPN pada periode ini.</td></tr>';

    var options = efPeriods()
      .map(function (p) {
        return (
          '<option value="' +
          p +
          '"' +
          (p === period ? ' selected' : '') +
          '>' +
          periodLabel(p) +
          '</option>'
        );
      })
      .join('');

    injectView(
      '<div class="sec-hdr"><div><h1>Ekspor Coretax</h1><p>File XML faktur pajak keluaran untuk ' +
        'Coretax DJP (Faktur Keluaran → Impor)</p></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<button class="btn-ghost" data-action="cfgEfaktur">Konfigurasi</button>' +
        '<button class="btn-ghost" data-action="exportCTAS" title="Format CSV aplikasi e-Faktur lama">CSV format lama</button>' +
        '<button class="btn" data-action="exportCoretax"' +
        (invoices.length ? '' : ' disabled') +
        '>Ekspor XML Coretax</button></div></div>' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">' +
        '<label class="form-label" for="ef-period" style="margin:0">Masa pajak</label>' +
        '<select class="form-select" id="ef-period" style="width:auto">' +
        options +
        '</select></div>' +
        '<div class="stat-row">' +
        '<div class="card stat-card"><div class="stat-label">Faktur</div><div class="stat-val">' +
        invoices.length.toLocaleString('id-ID') +
        '</div><div class="stat-sub">' +
        esc(periodLabel(period)) +
        '</div></div>' +
        '<div class="card stat-card"><div class="stat-label">DPP</div><div class="stat-val">' +
        money(totalDPP) +
        '</div></div>' +
        '<div class="card stat-card"><div class="stat-label">PPN Keluaran</div><div class="stat-val">' +
        money(totalPPN) +
        '</div><div class="stat-sub">Sama dengan Rekap PPN</div></div>' +
        '<div class="card stat-card"><div class="stat-label">NPWP perusahaan</div><div class="stat-val tax-stat-text">' +
        esc(cfg.npwp || 'Belum diatur') +
        '</div></div></div>' +
        (warnings.length
          ? '<div class="notice notice-warning"><div><strong>Periksa sebelum ekspor</strong><ul class="tax-warn-list">' +
            warnings
              .map(function (w) {
                return '<li>' + esc(w) + '</li>';
              })
              .join('') +
            '</ul></div></div>'
          : '') +
        '<div class="notice notice-info">Uji impor pertama di Coretax sebelum dipakai rutin; ' +
        'cocokkan kode barang dan kode satuan di Konfigurasi.</div>' +
        taxExplain(
          'Format XML mengikuti contoh dari template konverter DJP. Kode barang Coretax terdiri dari 6 digit.'
        ) +
        '<div class="card" style="overflow-x:auto"><table class="data-table" style="width:100%">' +
        '<thead><tr><th>Tanggal</th><th>No. Dokumen</th><th>Pelanggan</th><th>NPWP</th>' +
        '<th style="text-align:right">DPP</th><th style="text-align:right">PPN</th><th>No. Faktur Pajak</th><th></th></tr></thead><tbody>' +
        rows +
        '</tbody></table></div>'
    );
  }

  function exportCoretax() {
    var period = _efPeriod || today().slice(0, 7);
    var rows = getVatInvoices(period);
    if (!rows.length) {
      toast('Tidak ada faktur ber-PPN pada periode ini', 'warning');
      return;
    }
    var cfg = coretaxCfg();
    if (tin16(cfg.npwp).length !== 16) {
      toast('Isi NPWP perusahaan (16 digit) di Konfigurasi terlebih dahulu', 'warning');
      cfgEfakturModal();
      return;
    }
    downloadFile(
      coretaxXml(rows, cfg),
      'coretax_faktur_keluaran_' + period.replace('-', '') + '.xml',
      'application/xml;charset=utf-8'
    );
  }

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'ef-period') {
      _efPeriod = e.target.value;
      openEFakturCTAS();
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // § 2  TAX INVOICE EMAIL
  // ══════════════════════════════════════════════════════════════════════════
  function openTaxInvoiceEmail() {
    var invoices = getVatInvoices();
    var sent = invoices.filter(function (i) {
      return i.emailSent;
    });
    var pending = invoices.filter(function (i) {
      return !i.emailSent;
    });
    var emailLog = (db().taxEmailLog || []).slice().reverse();

    var pendingRows =
      pending
        .slice(0, 50)
        .map(function (inv) {
          var email = inv.email || '—';
          return (
            '<tr>' +
            '<td class="td-p" style="font-size:.75rem;white-space:nowrap">' +
            esc(inv.date) +
            '</td>' +
            '<td class="td-p" style="font-size:.75rem">' +
            esc(inv.id) +
            '</td>' +
            '<td class="td-p">' +
            esc(inv.customerName) +
            '</td>' +
            '<td class="td-p" style="font-size:.75rem;color:var(--muted)">' +
            esc(email) +
            '</td>' +
            '<td class="td-p" style="text-align:right">' +
            money(inv.ppn) +
            '</td>' +
            '<td class="td-p" style="text-align:center">' +
            '<button class="btn" style="font-size:.75rem;padding:4px 10px" data-action="sendTaxEmail" data-id="' +
            esc(inv.key) +
            '" data-invid="' +
            esc(inv.id) +
            '" data-cust="' +
            esc(inv.customerName) +
            '" data-ppn="' +
            inv.ppn +
            '">Kirim</button>' +
            '</td></tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--muted)">Semua faktur sudah dikirimkan.</td></tr>';

    var logRows =
      emailLog
        .slice(0, 30)
        .map(function (l) {
          return (
            '<tr>' +
            '<td class="td-p" style="font-size:.75rem">' +
            esc(l.sentAt || '') +
            '</td>' +
            '<td class="td-p" style="font-size:.75rem">' +
            esc(l.invoiceId) +
            '</td>' +
            '<td class="td-p">' +
            esc(l.customerName) +
            '</td>' +
            '<td class="td-p" style="font-size:.75rem">' +
            esc(l.to) +
            '</td>' +
            '<td class="td-p" style="text-align:center"><span class="badge badge-success">Terkirim</span></td>' +
            '</tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="5" style="text-align:center;padding:12px;color:var(--muted)">Belum ada email dikirim.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>Kirim Faktur Pajak via Email</h1></div>' +
        '<button class="btn" data-action="sendAllTaxEmail">Kirim Semua</button></div>' +
        '<div class="stat-row" style="grid-template-columns:repeat(3,1fr);margin-bottom:16px">' +
        '<div class="card stat-card"><div class="stat-label">Total Faktur</div><div class="stat-val">' +
        invoices.length +
        '</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Sudah Dikirim</div><div class="stat-val">' +
        sent.length +
        '</div></div>' +
        '<div class="card stat-card"><div class="stat-label">Belum Dikirim</div><div class="stat-val">' +
        pending.length +
        '</div></div>' +
        '</div>' +
        '<div class="card" style="margin-bottom:16px">' +
        '<div class="card-head"><div class="card-title">Antrian Pengiriman (' +
        pending.length +
        ')</div></div>' +
        '<div style="overflow-x:auto"><table>' +
        '<thead><tr><th>Tanggal</th><th>No. Faktur</th><th>Pelanggan</th>' +
        '<th>Email</th><th class="t-num">PPN</th><th></th></tr></thead>' +
        '<tbody>' +
        pendingRows +
        '</tbody></table></div></div>' +
        '<div class="card">' +
        '<div class="card-head"><div class="card-title">Log Pengiriman</div></div>' +
        '<div style="overflow-x:auto"><table>' +
        '<thead><tr><th>Waktu</th><th>Faktur</th><th>Pelanggan</th>' +
        '<th>Email Tujuan</th><th style="text-align:center">Status</th></tr></thead>' +
        '<tbody>' +
        logRows +
        '</tbody></table></div></div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // § 3  e-FAKTUR LEGACY (format lama CSV/txt)
  // ══════════════════════════════════════════════════════════════════════════
  function openEFakturLegacy() {
    var invoices = getVatInvoices();
    var cfg = (db().settings && db().settings.efakturCfg) || {};

    // Periode filter
    var months = {};
    invoices.forEach(function (i) {
      if (i.date) months[i.date.slice(0, 7)] = true;
    });
    var monthList = Object.keys(months).sort().reverse();
    var monthOpts = monthList
      .map(function (m) {
        return '<option value="' + m + '">' + m + '</option>';
      })
      .join('');

    var rows =
      invoices
        .slice(0, 100)
        .map(function (inv, idx) {
          return (
            '<tr>' +
            '<td class="td-p" style="font-size:.75rem;text-align:center">' +
            (idx + 1) +
            '</td>' +
            '<td class="td-p" style="font-size:.75rem">' +
            esc(inv.date.replace(/-/g, '')) +
            '</td>' +
            '<td class="td-p" style="font-size:.75rem">' +
            esc(inv.efakturNo || '0') +
            '</td>' +
            '<td class="td-p">' +
            esc(inv.customerName) +
            '</td>' +
            '<td class="td-p" style="font-size:.75rem">' +
            esc(inv.npwp.replace(/\D/g, '') || '000000000000000') +
            '</td>' +
            '<td class="td-p" style="text-align:right">' +
            inv.dpp +
            '</td>' +
            '<td class="td-p" style="text-align:right">' +
            inv.ppn +
            '</td>' +
            '</tr>'
          );
        })
        .join('') ||
      '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">Tidak ada faktur.</td></tr>';

    injectView(
      '<div class="sec-hdr"><div><h1>e-Faktur Format Lama</h1><p>CSV untuk aplikasi e-Faktur versi sebelum 4.x</p></div>' +
        '<div style="display:flex;gap:8px">' +
        (monthOpts
          ? '<select class="form-select" id="legacy-month" style="font-size:.8125rem">' +
            monthOpts +
            '</select>'
          : '') +
        '<button class="btn" data-action="exportLegacyCSV">Export CSV Legacy</button></div></div>' +
        '<div class="notice notice-warning">Pakai format ini hanya untuk aplikasi e-Faktur versi lama (sebelum 4.0); ' +
        'untuk versi terbaru gunakan menu Ekspor Coretax.</div>' +
        '<div class="card">' +
        '<div class="card-head"><div class="card-title">Preview Data Faktur</div></div>' +
        '<div style="overflow-x:auto"><table>' +
        '<thead><tr><th>#</th><th>Tgl (YYYYMMDD)</th>' +
        '<th>No. Faktur</th><th>Nama Pembeli</th>' +
        '<th>NPWP Pembeli</th><th class="t-num">DPP</th>' +
        '<th class="t-num">PPN</th></tr></thead>' +
        '<tbody>' +
        rows +
        '</tbody></table></div>' +
        (invoices.length > 100
          ? '<div style="text-align:center;padding:8px;font-size:.75rem;color:var(--muted)">Menampilkan 100 dari ' +
            invoices.length +
            ' baris</div>'
          : '') +
        '</div>'
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════
  function exportCTAScsv() {
    var period = _efPeriod || today().slice(0, 7);
    var invoices = getVatInvoices(period);
    var header =
      'FK,KD_JENIS_TRANSAKSI,FG_PENGGANTI,NOMOR_FAKTUR,MASA_PAJAK,TAHUN_PAJAK,TANGGAL_FAKTUR,NPWP,NAMA,ALAMAT_LENGKAP,JUMLAH_DPP,JUMLAH_PPN,JUMLAH_PPNBM,ID_KETERANGAN_TAMBAHAN,FG_UANG_MUKA,UANG_MUKA_DPP,UANG_MUKA_PPN,UANG_MUKA_PPNBM,REFERENSI';
    var lines = [header];
    invoices.forEach(function (inv) {
      var d = inv.date || today();
      lines.push(
        [
          'FK',
          '01',
          '0',
          inv.efakturNo || '',
          d.slice(5, 7),
          d.slice(0, 4),
          d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4),
          digits(inv.npwp) || '000000000000000',
          '"' + String(inv.customerName).replace(/"/g, '""') + '"',
          '"' + String(inv.address || '').replace(/"/g, '""') + '"',
          Math.round(inv.dpp),
          Math.round(inv.ppn),
          0,
          '',
          '0',
          0,
          0,
          0,
          '"' + inv.number + '"',
        ].join(',')
      );
    });
    downloadCSV(lines.join('\r\n'), 'efaktur_' + period.replace('-', '') + '.csv');
  }

  function exportLegacyCSV() {
    var invoices = getVatInvoices();
    var header = 'NOMOR_FAKTUR,TANGGAL,NPWP_PEMBELI,NAMA_PEMBELI,DPP,PPN';
    var lines = [header];
    invoices.forEach(function (inv, idx) {
      lines.push(
        [
          inv.efakturNo || '0' + String(idx + 1).padStart(12, '0'),
          inv.date.replace(/-/g, ''),
          inv.npwp.replace(/\D/g, '') || '000000000000000',
          '"' + inv.customerName.replace(/"/g, '""') + '"',
          inv.dpp,
          inv.ppn,
        ].join(',')
      );
    });
    downloadCSV(lines.join('\r\n'), 'efaktur_legacy_' + today().replace(/-/g, '') + '.csv');
  }

  function downloadCSV(content, filename) {
    downloadFile(content, filename, 'text/csv;charset=utf-8;');
  }

  // Seller identity and the Coretax codes. Unit and goods codes are per company:
  // check them against the REF sheet of DJP's template (REQUIRES USER CONFIRMATION
  // for the codes that fit this business's goods).
  function cfgEfakturModal() {
    if (!db().settings) window.DB.settings = {};
    var cfg = db().settings.efakturCfg || {};
    var unitCodes = cfg.unitCodes || {};
    var goodsCodes = cfg.goodsCodes || {};
    var units = (db().settings.units || []).slice();
    (db().inventoryItems || []).forEach(function (i) {
      if (i.unit && units.indexOf(i.unit) === -1) units.push(i.unit);
    });
    var unitRows = units
      .map(function (u) {
        return (
          '<tr><td class="td-p">' +
          esc(u) +
          '</td><td class="td-p"><input class="form-input ef-unit" data-unit="' +
          esc(u) +
          '" value="' +
          esc(unitCodes[u] || unitCode(u, { unitCodes: {} })) +
          '" placeholder="UM.0033" style="width:130px"></td></tr>'
        );
      })
      .join('');
    var itemRows = (db().inventoryItems || [])
      .map(function (i) {
        return (
          '<tr><td class="td-p">' +
          esc(i.name) +
          '</td><td class="td-p"><input class="form-input ef-goods" data-item="' +
          esc(i.id) +
          '" value="' +
          esc(goodsCodes[i.id] || '') +
          '" placeholder="000000" maxlength="6" inputmode="numeric" style="width:110px"></td></tr>'
        );
      })
      .join('');
    modal(
      'Konfigurasi Faktur Pajak',
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">NPWP perusahaan (16 digit)</label><input class="form-input" id="ef-npwp" value="' +
        esc(cfg.npwp || (db().settings.tax && db().settings.tax.npwp) || '') +
        '" placeholder="0000000000000000" maxlength="20" inputmode="numeric"></div>' +
        '<div class="form-group"><label class="form-label">NITKU penjual (22 digit)</label><input class="form-input" id="ef-nitku" value="' +
        esc(cfg.nitku || '') +
        '" placeholder="Kosong = NPWP + 000000 (kantor pusat)" maxlength="22" inputmode="numeric"></div>' +
        '</div>' +
        '<div class="form-row">' +
        '<div class="form-group"><label class="form-label">Nama PKP</label><input class="form-input" id="ef-name" value="' +
        esc(cfg.companyName || '') +
        '" placeholder="PT ..."></div>' +
        '<div class="form-group"><label class="form-label">Kode transaksi</label><select class="form-select" id="ef-trx">' +
        [
          ['04', '04 — DPP nilai lain (PPN 12% × 11/12), penyerahan umum'],
          ['01', '01 — Penyerahan kepada selain pemungut PPN'],
          ['02', '02 — Kepada pemungut instansi pemerintah'],
          ['03', '03 — Kepada pemungut selain instansi pemerintah'],
        ]
          .map(function (o) {
            return (
              '<option value="' +
              o[0] +
              '"' +
              ((cfg.trxCode || CORETAX_DEFAULTS.trxCode) === o[0] ? ' selected' : '') +
              '>' +
              esc(o[1]) +
              '</option>'
            );
          })
          .join('') +
        '</select></div></div>' +
        '<div class="form-group"><label class="form-label">KPP terdaftar</label><input class="form-input" id="ef-kpp" value="' +
        esc(cfg.kpp || '') +
        '" placeholder="KPP Pratama ..."></div>' +
        '<div class="form-label" style="margin-top:8px">Kode satuan Coretax</div>' +
        '<table class="data-table" style="width:100%;margin-bottom:12px"><tbody>' +
        (unitRows || '<tr><td class="td-empty">Belum ada satuan.</td></tr>') +
        '</tbody></table>' +
        '<div class="form-label">Kode barang Coretax (6 digit, kosong = 000000)</div>' +
        '<table class="data-table" style="width:100%"><tbody>' +
        (itemRows || '<tr><td class="td-empty">Belum ada barang.</td></tr>') +
        '</tbody></table>',
      '<button class="btn" id="saveEfakturCfg">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>',
      true
    );
    setTimeout(function () {
      var btn = document.getElementById('saveEfakturCfg');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var npwp = digits(document.getElementById('ef-npwp').value);
        if (npwp && tin16(npwp).length !== 16) {
          toast('NPWP harus 16 digit (atau 15 digit format lama)', 'warning');
          return;
        }
        var nitku = digits(document.getElementById('ef-nitku').value);
        if (nitku && nitku.length !== 22) {
          toast('NITKU harus 22 digit, atau kosongkan', 'warning');
          return;
        }
        var nextUnits = {};
        document.querySelectorAll('.ef-unit').forEach(function (el) {
          var v = el.value.trim().toUpperCase();
          if (v) nextUnits[el.getAttribute('data-unit')] = v;
        });
        var nextGoods = {};
        var badGoods = false;
        document.querySelectorAll('.ef-goods').forEach(function (el) {
          var v = digits(el.value);
          if (!v) return;
          if (v.length !== 6) badGoods = true;
          nextGoods[el.getAttribute('data-item')] = v;
        });
        if (badGoods) {
          toast('Kode barang Coretax harus 6 digit', 'warning');
          return;
        }
        db().settings.efakturCfg = {
          npwp: npwp,
          nitku: nitku,
          companyName: document.getElementById('ef-name').value.trim(),
          kpp: document.getElementById('ef-kpp').value.trim(),
          trxCode: document.getElementById('ef-trx').value,
          unitCodes: nextUnits,
          goodsCodes: nextGoods,
        };
        save();
        closeM();
        toast('Konfigurasi faktur pajak disimpan', 'success');
        if (window.activeView === 'tax') openEFakturCTAS();
      });
    }, 60);
  }

  // `key` is the row key from getVatInvoices ('SI:<id>' or 'SO:<id>').
  function sendTaxEmailModal(key, invoiceId, custName, ppnAmount) {
    var row = getVatInvoices().find(function (r) {
      return r.key === key;
    });
    var defEmail = row ? row.email : '';
    modal(
      'Kirim Tax Invoice',
      '<div class="form-group"><label class="form-label">Faktur</label><input class="form-input" value="' +
        esc(invoiceId) +
        '" disabled></div>' +
        '<div class="form-group"><label class="form-label">Pelanggan</label><input class="form-input" value="' +
        esc(custName) +
        '" disabled></div>' +
        '<div class="form-group"><label class="form-label">Nilai PPN</label><input class="form-input" value="' +
        money(ppnAmount) +
        '" disabled></div>' +
        '<div class="form-group"><label class="form-label">Email Tujuan</label><input class="form-input" id="tax-email" value="' +
        esc(defEmail) +
        '" type="email" placeholder="email@domain.com"></div>' +
        '<div class="form-group"><label class="form-label">Catatan (opsional)</label><input class="form-input" id="tax-note" placeholder="Terlampir faktur pajak ..."></div>',
      '<button class="btn" id="doSendTaxEmail">Kirim</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
    );
    setTimeout(function () {
      var btn = document.getElementById('doSendTaxEmail');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var email = document.getElementById('tax-email').value.trim();
        if (!email || !email.includes('@')) {
          toast('Email tidak valid', 'warning');
          return;
        }
        if (!window.DB.taxEmailLog) window.DB.taxEmailLog = [];
        window.DB.taxEmailLog.push({
          invoiceId: invoiceId,
          customerName: custName,
          to: email,
          sentAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
          note: document.getElementById('tax-note').value.trim(),
        });
        // Mark the invoice (or the uninvoiced order) as sent.
        if (row) {
          var coll = row.docType === 'SO' ? 'salesOrders' : 'salesInvoices';
          var doc = (db()[coll] || []).find(function (d) {
            return String(d.id) === String(row.docId);
          });
          if (doc) doc.emailSent = true;
        }
        save();
        closeM();
        toast('Tax invoice dikirim ke ' + email, 'success');
        openTaxInvoiceEmail();
      });
    }, 60);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT DELEGATION
  // ══════════════════════════════════════════════════════════════════════════
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;

    switch (action) {
      case 'exportCTAS':
        exportCTAScsv();
        break;
      case 'exportCoretax':
        exportCoretax();
        break;
      case 'exportLegacyCSV':
        exportLegacyCSV();
        break;
      case 'cfgEfaktur':
        cfgEfakturModal();
        break;
      case 'sendTaxEmail': {
        sendTaxEmailModal(
          btn.dataset.id,
          btn.dataset.invid,
          btn.dataset.cust,
          parseFloat(btn.dataset.ppn) || 0
        );
        break;
      }
      case 'sendAllTaxEmail': {
        toast('Fitur kirim massal memerlukan konfigurasi SMTP server', 'warning');
        break;
      }
      case 'setEfakturNo': {
        var key = btn.dataset.key || '';
        var parts = key.split(':');
        var coll = parts[0] === 'SO' ? 'salesOrders' : 'salesInvoices';
        var docId = parts.slice(1).join(':');
        var doc = (db()[coll] || []).find(function (d) {
          return String(d.id) === docId;
        });
        if (!doc) {
          toast('Dokumen tidak ditemukan', 'warning');
          break;
        }
        modal(
          'Nomor Faktur Pajak',
          '<div class="form-group"><label class="form-label">Nomor faktur pajak dari Coretax untuk ' +
            esc(doc.number || doc.id) +
            '</label>' +
            '<input class="form-input" id="efno-input" value="' +
            esc(doc.efakturNo || '') +
            '" placeholder="Nomor faktur pajak" maxlength="30"></div>',
          '<button class="btn" id="saveEFNo">Simpan</button><button class="btn-ghost" data-action="closeModal">Batal</button>'
        );
        setTimeout(function () {
          var sb = document.getElementById('saveEFNo');
          if (!sb) return;
          sb.addEventListener('click', function () {
            doc.efakturNo = document.getElementById('efno-input').value.trim();
            save();
            closeM();
            toast('Nomor faktur pajak disimpan', 'success');
            openEFakturCTAS();
          });
        }, 60);
        break;
      }
    }
  });

  window._taxExtras = {
    renderTaxPage: renderTaxPage,
    openEFakturCTAS: openEFakturCTAS,
    getVatInvoices: getVatInvoices,
    coretaxXml: coretaxXml,
    coretaxWarnings: coretaxWarnings,
    openTaxInvoiceEmail: openTaxInvoiceEmail,
    openEFakturLegacy: openEFakturLegacy,
  };
  console.log('[TaxExtras] Tax extras ready');
})();
