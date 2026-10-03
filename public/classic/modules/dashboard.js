// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Ringkasan (dashboard)  (modules/dashboard.js)
//
// Answers "what does the owner or admin need to know right now?" (docs/09 §4),
// using only records the application keeps:
//   • Kas & bank          — ledger balance of cash/bank accounts (GL.trialBalance)
//   • Piutang / Hutang     — open items, overdue and due soon (Balances.summary)
//   • Penjualan bulan ini  — revenue and COGS journal lines, compared with last month
//   • Tren 6 bulan         — revenue vs purchases per month from journals
//   • Perlu tindakan       — documents waiting for their next step (statuses),
//                            trips not yet billed, weight changes after billing,
//                            pickup POs at their cut-off or quota
//   • Jatuh tempo, stok menipis, aktivitas terbaru (audit log)
//   • Trading pickups (window.TradingSummary over trading.js): Alur pengambilan,
//     Tagihan pelanggan, PO pengambilan berjalan, Tonase per bulan — see
//     _dashTrading below. Hidden for roles that cannot view the module.
// Blocks can be hidden per browser ("Atur Tampilan"); the company data checklist
// shows until the basics are filled in.
//
// Classic script sharing the bundle's global scope: renderDashboard, initCharts,
// destroyCharts and _initChartsImpl are globals used by nav.js and erp-view.js.
// ═══════════════════════════════════════════════════════════════════════════════

var DASH_HIDDEN_KEY = 'nsa_dash_hidden_v2';
var DASH_BLOCKS = [
  { id: 'pipeline', label: 'Alur pengambilan' },
  { id: 'collections', label: 'Tagihan pelanggan' },
  { id: 'pickupPOs', label: 'PO pengambilan berjalan' },
  { id: 'tonnage', label: 'Tonase per bulan' },
  { id: 'trend', label: 'Penjualan & pembelian 6 bulan' },
  { id: 'actions', label: 'Perlu tindakan' },
  { id: 'due', label: 'Jatuh tempo terdekat' },
  { id: 'stock', label: 'Stok menipis' },
  { id: 'activity', label: 'Aktivitas terbaru' },
];
var DASH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
var DASH_COLLECTIONS = {
  salesOrders: 'Pesanan penjualan',
  purchaseOrders: 'Pesanan pembelian',
  salesInvoices: 'Faktur penjualan',
  purchaseInvoices: 'Faktur pembelian',
  salesReceipts: 'Penerimaan pembayaran',
  purchasePayments: 'Pembayaran ke supplier',
  salesReturns: 'Retur penjualan',
  purchaseReturns: 'Retur pembelian',
  salesQuotations: 'Penawaran penjualan',
  purchaseQuotations: 'Penawaran pembelian',
  deliveryOrders: 'Surat jalan',
  goodsReceipts: 'Penerimaan barang',
  salesDownPayments: 'Uang muka penjualan',
  purchaseDownPayments: 'Uang muka pembelian',
  itemAdjustments: 'Penyesuaian stok',
  itemTransfers: 'Transfer antargudang',
  otherPayments: 'Pengeluaran lain',
  otherDeposits: 'Penerimaan lain',
  bankTransfers: 'Transfer antarrekening',
  paymentLogs: 'Pembayaran',
  journals: 'Jurnal umum',
  inventoryItems: 'Barang',
  customers: 'Pelanggan',
  suppliers: 'Supplier',
};
var DASH_VERBS = { create: 'dibuat', update: 'diubah', status: 'status diubah', delete: 'dihapus' };

// ── Preferences ──────────────────────────────────────────────────────────────
function _dashHidden() {
  try {
    var v = JSON.parse(localStorage.getItem(DASH_HIDDEN_KEY));
    return Array.isArray(v) ? v : [];
  } catch (_) {
    return [];
  }
}

function _dashSetHidden(ids) {
  try {
    localStorage.setItem(DASH_HIDDEN_KEY, JSON.stringify(ids));
  } catch (_) {
    /* storage unavailable */
  }
}

function _refreshDashboard() {
  if (typeof window.invalidateView === 'function') {
    window.invalidateView('dashboard');
  }
  navigate('dashboard');
}

// ── Charts (called by nav.js on every visit and theme change) ────────────────
function destroyCharts() {
  if (typeof _chartInitTimer !== 'undefined' && _chartInitTimer !== null) {
    clearTimeout(_chartInitTimer);
    _chartInitTimer = null;
  }
  Object.values(charts).forEach(function (c) {
    try {
      c.destroy();
    } catch (_) {
      /* already gone */
    }
  });
  charts = {};
}

function initCharts() {
  if (typeof _chartInitTimer !== 'undefined' && _chartInitTimer !== null) {
    clearTimeout(_chartInitTimer);
  }
  _chartInitTimer = setTimeout(_initChartsImpl, 60);
}

function _initChartsImpl() {
  var canvas = document.getElementById('dashTrendChart');
  if (typeof Chart === 'undefined' || !canvas || !document.body.contains(canvas)) {
    return;
  }
  var css = getComputedStyle(document.documentElement);
  var tok = function (name, fallback) {
    return (css.getPropertyValue(name) || '').trim() || fallback;
  };
  var series = _dashMonthly(6);
  var font = { family: tok('--font-sans', 'system-ui, sans-serif'), size: 11 };
  var money = typeof idr === 'function' ? idr : String;
  var short = typeof idrShort === 'function' ? idrShort : String;

  charts.dashTrend = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: series.keys.map(function (k) {
        return DASH_MONTHS[Number(k.slice(5, 7)) - 1];
      }),
      datasets: [
        {
          label: 'Penjualan',
          data: series.keys.map(function (k) {
            return Math.round(series.data[k].revenue);
          }),
          backgroundColor: tok('--chart-1', '#06845c'),
          borderRadius: 4,
          maxBarThickness: 22,
        },
        {
          label: 'Pembelian',
          data: series.keys.map(function (k) {
            return Math.round(series.data[k].purchases);
          }),
          backgroundColor: tok('--chart-3', '#d97706'),
          borderRadius: 4,
          maxBarThickness: 22,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tok('--surface-raised', '#ffffff'),
          titleColor: tok('--text', '#161b19'),
          bodyColor: tok('--text-secondary', '#46514d'),
          borderColor: tok('--border-strong', 'rgba(0,0,0,0.15)'),
          borderWidth: 1,
          cornerRadius: 8,
          padding: 10,
          titleFont: Object.assign({}, font, { weight: '600' }),
          bodyFont: font,
          callbacks: {
            label: function (c) {
              return c.dataset.label + ': ' + money(c.raw);
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { font: font, color: tok('--chart-text', '#66716d') },
        },
        y: {
          grid: { color: tok('--chart-grid', 'rgba(0,0,0,0.07)') },
          border: { display: false },
          ticks: {
            font: font,
            color: tok('--chart-text', '#66716d'),
            maxTicksLimit: 5,
            callback: function (v) {
              return short(v).replace('Rp ', '');
            },
          },
        },
      },
    },
  });
}

// ── Data ─────────────────────────────────────────────────────────────────────
function _dashMonthKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function _dashAccountTypes() {
  var chart =
    typeof GL !== 'undefined' && typeof GL.ensureChart === 'function'
      ? GL.ensureChart()
      : DB.accountsChart || [];
  var map = {};
  chart.forEach(function (a) {
    map[a.no] = a.type;
  });
  return map;
}

// Revenue, cost of goods sold and purchases per month for the last `months`
// months. Purchases are the stock/expense debits of purchase documents (invoice,
// receipt of an uninvoiced order) net of purchase returns — PPN excluded.
// With `throughDay`, each month counts only days 1..throughDay (month to date).
function _dashMonthly(months, throughDay) {
  var types = _dashAccountTypes();
  var now = new Date();
  var keys = [];
  var data = {};
  for (var i = months - 1; i >= 0; i--) {
    var k = _dashMonthKey(new Date(now.getFullYear(), now.getMonth() - i, 1));
    keys.push(k);
    data[k] = { revenue: 0, cogs: 0, purchases: 0 };
  }
  (DB.journals || []).forEach(function (j) {
    var date = String(j.date || '');
    var m = data[date.slice(0, 7)];
    if (!m || (throughDay && Number(date.slice(8, 10)) > throughDay)) {
      return;
    }
    var src = j.source && j.source.docType;
    var purchaseDoc = src === 'PI' || src === 'PO' || src === 'PRN';
    (j.lines || []).forEach(function (l) {
      var t = types[l.accountNo];
      var dr = Number(l.debit) || 0;
      var cr = Number(l.credit) || 0;
      if (t === 'REVENUE') {
        m.revenue += cr - dr;
      } else if (t === 'COGS') {
        m.cogs += dr - cr;
      }
      if (purchaseDoc && (t === 'INVENTORY' || t === 'EXPENSE' || t === 'COGS')) {
        m.purchases += dr - cr;
      }
    });
  });
  return { keys: keys, data: data };
}

function _dashCash() {
  var tb =
    typeof GL !== 'undefined' && typeof GL.trialBalance === 'function'
      ? GL.trialBalance()
      : { rows: [] };
  var accounts = tb.rows
    .filter(function (r) {
      return r.type === 'CASH_BANK';
    })
    .map(function (r) {
      return { name: r.name, balance: r.debit - r.credit };
    });
  return {
    accounts: accounts,
    total: accounts.reduce(function (s, a) {
      return s + a.balance;
    }, 0),
  };
}

function _dashBalances(side) {
  if (typeof Balances === 'undefined' || typeof Balances.summary !== 'function') {
    return { total: 0, overdue: 0, dueSoon: 0, count: 0, overdueCount: 0, items: [] };
  }
  return Balances.summary(side);
}

function _dashActions() {
  var so = DB.salesOrders || [];
  var po = DB.purchaseOrders || [];
  var invoiced = function (side, id) {
    return (
      typeof Balances !== 'undefined' &&
      typeof Balances.activeInvoiceFor === 'function' &&
      !!Balances.activeInvoiceFor(side, id)
    );
  };
  var drafts = [so, po, DB.salesInvoices || [], DB.purchaseInvoices || []].reduce(function (n, list) {
    return (
      n +
      list.filter(function (d) {
        return d.status === 'Draft';
      }).length
    );
  }, 0);
  // Orders opened for pickup and their surat jalan slots are followed in the
  // pickup blocks: a slot stays 'Pending' until a truck uses it, and the orders
  // stay 'Confirmed' until their quota or cut-off closes them.
  var notPickup = function (o) {
    return !o.pickupFlow && o.pickup !== true;
  };
  // The pickup flow is the core of the business: its rows come first.
  return _dashTrading
    .actions()
    .concat([
      {
        label: 'Pesanan penjualan belum dikirim',
        hint: 'Dikonfirmasi atau lunas, barang belum keluar',
        count: so.filter(function (o) {
          return (o.status === 'Confirmed' || o.status === 'Paid') && notPickup(o);
        }).length,
        open: 'Pesanan Penjualan',
      },
      {
        label: 'Pengiriman belum selesai',
        hint: 'Surat jalan pending atau dalam perjalanan',
        count: (DB.deliveryOrders || []).filter(function (d) {
          return (d.status === 'Pending' || d.status === 'In Transit') && notPickup(d);
        }).length,
        open: 'Surat Jalan',
      },
      {
        label: 'Pesanan terkirim tanpa faktur',
        hint: 'Barang sudah dikirim, faktur belum dibuat',
        count: so.filter(function (o) {
          return o.status === 'Delivered' && !invoiced('sales', o.id);
        }).length,
        open: 'Faktur Penjualan',
      },
      {
        label: 'Penawaran menunggu jawaban',
        hint: 'Penawaran penjualan yang sudah dikirim',
        count: (DB.salesQuotations || []).filter(function (q) {
          return q.status === 'Sent';
        }).length,
        open: 'Penawaran Penjualan',
      },
      {
        label: 'Pesanan pembelian belum diterima',
        hint: 'Dikonfirmasi atau lunas, barang belum masuk',
        count: po.filter(function (o) {
          return (o.status === 'Confirmed' || o.status === 'Paid') && notPickup(o);
        }).length,
        open: 'Pesanan Pembelian',
      },
      {
        label: 'Dokumen masih draft',
        hint: 'Pesanan dan faktur yang belum diposting',
        count: drafts,
        open: 'Pesanan Penjualan',
      },
    ])
    .filter(function (r) {
      return r.count > 0;
    });
}

function _dashLowStock() {
  return (DB.inventoryItems || [])
    .map(function (i) {
      return { item: i, min: Number(i.min != null ? i.min : i.minStock) || 0, stock: Number(i.stock) || 0 };
    })
    .filter(function (x) {
      return x.min > 0 && x.stock <= x.min;
    })
    .sort(function (a, b) {
      return a.stock / a.min - b.stock / b.min;
    });
}

// Company data checklist — shown until every basic item is in place.
function _companyPrepChecks() {
  var c = (DB.settings && DB.settings.company) || {};
  var u = (DB.settings && DB.settings.user) || {};
  var chart =
    typeof GL !== 'undefined' && typeof GL.ensureChart === 'function'
      ? GL.ensureChart()
      : DB.accountsChart || [];
  return [
    { label: 'Nama perusahaan', ok: !!c.name, action: 'editIdentity' },
    { label: 'Alamat perusahaan', ok: !!c.address, action: 'editIdentity' },
    { label: 'Telepon perusahaan', ok: !!c.phone, action: 'editIdentity' },
    { label: 'Nama pengguna', ok: !!u.name, action: 'editIdentity' },
    { label: 'Jabatan pengguna', ok: !!u.role, action: 'editIdentity' },
    { label: 'Bagan akun', ok: !!(chart && chart.length), open: 'Bagan Akun' },
    { label: 'Data pelanggan', ok: !!(DB.customers && DB.customers.length), open: 'Pelanggan' },
    { label: 'Data supplier', ok: !!(DB.suppliers && DB.suppliers.length), open: 'Supplier' },
    { label: 'Data barang', ok: !!(DB.inventoryItems && DB.inventoryItems.length), open: 'Barang & Stok' },
  ];
}

function _companyPrepComplete() {
  return _companyPrepChecks().every(function (c) {
    return c.ok;
  });
}

// ── Formatting ───────────────────────────────────────────────────────────────
function _dashDate(iso) {
  var p = String(iso || '').split('-');
  return p.length === 3 ? Number(p[2]) + ' ' + DASH_MONTHS[Number(p[1]) - 1] + ' ' + p[0] : iso || '';
}

function _dashTime(ts) {
  var d = new Date(ts);
  if (isNaN(d.getTime())) {
    return String(ts || '');
  }
  var hm = String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0');
  return d.toDateString() === new Date().toDateString()
    ? 'Hari ini ' + hm
    : d.getDate() + ' ' + DASH_MONTHS[d.getMonth()] + ' ' + hm;
}

function _dashCard(title, sub, body, more) {
  return (
    '<div class="card dash-list">' +
    '<div class="card-head"><div><div class="card-title">' +
    escapeHtml(title) +
    '</div>' +
    (sub ? '<div class="card-sub">' + escapeHtml(sub) + '</div>' : '') +
    '</div>' +
    (more
      ? '<button type="button" class="link-btn" data-dash-open="' +
        escapeHtml(more) +
        '">Lihat semua</button>'
      : '') +
    '</div>' +
    body +
    '</div>'
  );
}

function _dashEmpty(text) {
  return '<div class="empty-inline">' + escapeHtml(text) + '</div>';
}

// ── Trading pickups ──────────────────────────────────────────────────────────
// Blocks over window.TradingSummary (core/trading-summary.js): Alur pengambilan,
// Tagihan pelanggan, PO pengambilan berjalan, Tonase per bulan, and the rows the
// pickup flow adds to "Perlu tindakan". Every figure is counted from pickup POs,
// their surat jalan, trips and the invoices that list those trips. Kept in one
// object so this file adds a single name to the shared scope.
var _dashTrading = (function () {
  var MONTHS_LONG = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
  ];
  var LIST_LIMIT = 6;
  var ARROW =
    '<span class="pipe-arrow" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>';

  function S() {
    return window.TradingSummary || null;
  }
  // Respect the role's module access (rbac.js); pickup pages are 'purchases',
  // customer billing is 'sales'.
  function can(module) {
    var R = window.RBAC;
    return !R || typeof R.canView !== 'function' || R.canView(module);
  }
  function esc(s) {
    return escapeHtml(s);
  }
  function money(v) {
    return typeof idr === 'function' ? idr(v) : String(Math.round(v || 0));
  }
  function short(v) {
    return typeof idrShort === 'function' ? idrShort(v) : money(v);
  }
  function fmtNum(v) {
    return Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
  }
  // { Ton: 65, M3: 4 } → "65 Ton · 4 M3"
  function qty(map) {
    return Object.keys(map || {})
      .filter(function (u) {
        return Math.abs(Number(map[u]) || 0) > 0.0005;
      })
      .map(function (u) {
        return fmtNum(map[u]) + (u ? ' ' + u : '');
      })
      .join(' · ');
  }
  function today() {
    return typeof Balances !== 'undefined' && Balances.todayISO
      ? Balances.todayISO()
      : _dashMonthKey(new Date()) + '-' + String(new Date().getDate()).padStart(2, '0');
  }
  function daysSince(iso, asOf) {
    return typeof Balances !== 'undefined' && Balances.daysBetween
      ? Balances.daysBetween(iso, asOf)
      : 0;
  }
  function monthShort(key) {
    return DASH_MONTHS[Number(String(key).slice(5, 7)) - 1] || key;
  }
  function monthLong(key) {
    return (MONTHS_LONG[Number(String(key).slice(5, 7)) - 1] || '') + ' ' + String(key).slice(0, 4);
  }
  function pct(v) {
    return Math.round(Math.abs(v) * 100) + '%';
  }

  function hasData() {
    return !!S() && S().hasData();
  }

  // ── Perlu tindakan ─────────────────────────────────────────────────────────
  function actions() {
    if (!S() || !hasData()) {
      return [];
    }
    var asOf = today();
    var rows = [];
    if (can('sales')) {
      // Every customer with trips not yet invoiced (minimum age -1 = all).
      var ub = { count: 0, qty: {}, value: 0, oldDays: 0, customers: 0 };
      S()
        .unbilledAging(asOf, -1)
        .forEach(function (r) {
          ub.customers++;
          ub.count += r.count;
          ub.value += r.value;
          ub.oldDays = Math.max(ub.oldDays, r.oldDays);
          Object.keys(r.qty).forEach(function (u) {
            ub.qty[u] = (ub.qty[u] || 0) + r.qty[u];
          });
        });
      rows.push({
        label: 'Pengambilan belum ditagih',
        hint: [
          ub.customers + ' pelanggan',
          qty(ub.qty),
          short(ub.value),
          ub.count ? 'tertua ' + ub.oldDays + ' hari' : '',
        ]
          .filter(Boolean)
          .join(' · '),
        count: ub.count,
        open: 'Tagih Pelanggan',
      });
    }
    if (can('purchases')) {
      var diffs = S().supplierDiffs();
      rows.push({
        label: 'Perubahan timbangan belum ditindaklanjuti',
        hint: 'Berat berubah setelah pengambilan ditagih',
        count: diffs.alerts.length,
        open: 'Perubahan Timbangan',
      });
      var pos = S()
        .poProgress(asOf)
        .filter(function (p) {
          return p.flagged;
        });
      var past = pos.filter(function (p) {
        return p.pastCutoff;
      }).length;
      var near = pos.filter(function (p) {
        return p.nearCutoff;
      }).length;
      var full = pos.filter(function (p) {
        return p.nearQuota;
      }).length;
      rows.push({
        label: 'PO lewat cut-off / hampir penuh',
        hint:
          [
            past ? past + ' lewat cut-off' : '',
            near ? near + ' cut-off ≤ ' + S().NEAR_CUTOFF_DAYS + ' hari' : '',
            full ? full + ' kuota ≥ ' + Math.round(S().NEAR_QUOTA * 100) + '%' : '',
          ]
            .filter(Boolean)
            .join(' · ') || 'PO pengambilan',
        count: pos.length,
        open: 'PO Pengambilan',
      });
      rows.push({
        label: 'Tagihan supplier berbeda dari pengambilan',
        hint: 'Jumlah atau harga di faktur supplier tidak sama dengan timbangan',
        count: diffs.invoices,
        open: 'Tagihan Supplier',
      });
    }
    return rows;
  }

  // ── Alur pengambilan ───────────────────────────────────────────────────────
  function stage(o) {
    var zero = !o.count;
    return (
      '<button type="button" class="pipe-stage' +
      (o.tone && !zero ? ' is-' + o.tone : '') +
      (zero ? ' is-zero' : '') +
      '" data-dash-open="' +
      esc(o.open) +
      '"><span class="pipe-stage-label">' +
      esc(o.label) +
      '</span><span class="pipe-stage-count">' +
      o.count +
      ' <small>' +
      esc(o.noun) +
      '</small></span><span class="pipe-stage-sub">' +
      esc(o.sub || ' ') +
      '</span></button>'
    );
  }
  function flow(stages) {
    return '<div class="pipe-flow">' + stages.map(stage).join(ARROW) + '</div>';
  }
  function tripSub(st) {
    if (!st.count) {
      return 'Tidak ada';
    }
    return [qty(st.qty), short(st.value)].filter(Boolean).join(' · ');
  }

  function pipelineCard(asOf) {
    var head = function (sub, side) {
      return (
        '<div class="card-head"><div><div class="card-title">Alur pengambilan</div>' +
        '<div class="card-sub">' +
        esc(sub) +
        '</div></div>' +
        (side || '') +
        '</div>'
      );
    };
    if (!hasData()) {
      return (
        '<div class="card dash-pipe">' +
        head('PO supplier → surat jalan → truk mengambil → tagihan → lunas') +
        '<div class="empty-inline dash-pipe-empty">Belum ada PO pengambilan. Bagian ini terisi setelah PO supplier dibuka untuk pengambilan: surat jalan yang siap dipakai, truk yang sudah mengambil dan ditimbang, lalu tagihan ke pelanggan dan dari supplier sampai lunas.' +
        '<div><button type="button" class="btn-ghost btn-sm" data-dash-open="PO Pengambilan">Buka PO Pengambilan</button></div></div>' +
        '</div>'
      );
    }
    var p = S().pipeline(undefined, { asOf: asOf });
    var alerts = S().supplierDiffs().alerts.length;
    var side = alerts
      ? '<button type="button" class="chip chip-warning dash-chip-btn" data-dash-open="Perubahan Timbangan">' +
        alerts +
        ' perubahan timbangan belum ditindaklanjuti</button>'
      : '';
    var remaining = qty(p.openPOs.remaining);
    var top = flow([
      {
        label: 'PO supplier terbuka',
        count: p.openPOs.count,
        noun: 'PO',
        sub: p.openPOs.count
          ? remaining
            ? 'Sisa kuota ' + remaining
            : 'Kuota sudah terambil'
          : 'Tidak ada',
        open: 'PO Pengambilan',
      },
      {
        label: 'Surat jalan siap dipakai',
        count: p.slots.count,
        noun: 'SJ',
        sub: p.slots.count ? 'Belum dipakai truk' : 'Tidak ada',
        open: 'Catat Pengambilan',
      },
      {
        label: 'Sudah diambil bulan ini',
        count: p.taken.count,
        noun: 'truk',
        sub: tripSub(p.taken),
        open: 'Rekap Pengambilan',
      },
    ]);
    var lane = function (title, stages, note) {
      return (
        '<div class="pipe-lane"><div class="pipe-lane-label">' +
        esc(title) +
        '</div>' +
        flow(stages) +
        (note || '') +
        '</div>'
      );
    };
    var carry = function (st, text, open) {
      return st.count
        ? '<button type="button" class="link-btn pipe-note" data-dash-open="' +
            esc(open) +
            '">' +
            esc('+ ' + st.count + ' truk ' + text + ' · ' + tripSub(st)) +
            '</button>'
        : '';
    };
    var lanes =
      '<div class="pipe-lanes">' +
      (can('sales')
        ? lane(
            'Tagihan ke pelanggan',
            [
              {
                label: 'Belum ditagih',
                count: p.unbilled.count,
                noun: 'truk',
                sub: tripSub(p.unbilled),
                open: 'Tagih Pelanggan',
                tone: 'warning',
              },
              {
                label: 'Ditagih, belum lunas',
                count: p.billed.count,
                noun: 'truk',
                sub: tripSub(p.billed),
                open: 'Penerimaan Pembayaran',
              },
              {
                label: 'Lunas',
                count: p.paid.count,
                noun: 'truk',
                sub: tripSub(p.paid),
                open: 'Faktur Penjualan',
                tone: 'success',
              },
            ],
            carry(p.carryOver.unbilled, 'bulan sebelumnya belum ditagih', 'Tagih Pelanggan')
          )
        : '') +
      lane(
        'Tagihan dari supplier',
        [
          {
            label: 'Belum ditagih supplier',
            count: p.supplierUnbilled.count,
            noun: 'truk',
            sub: tripSub(p.supplierUnbilled),
            open: 'Tagihan Supplier',
          },
          {
            label: 'Ditagih, belum dibayar',
            count: p.supplierBilled.count,
            noun: 'truk',
            sub: tripSub(p.supplierBilled),
            open: 'Pembayaran ke Supplier',
          },
          {
            label: 'Dibayar',
            count: p.supplierPaid.count,
            noun: 'truk',
            sub: tripSub(p.supplierPaid),
            open: 'Faktur Pembelian',
            tone: 'success',
          },
        ],
        carry(
          p.carryOver.supplierUnbilled,
          'bulan sebelumnya belum ditagih supplier',
          'Tagihan Supplier'
        )
      ) +
      '</div>';
    return (
      '<div class="card dash-pipe">' +
      head(
        'Pengambilan ' + monthLong(p.period.key) + ' dan statusnya di faktur · nilai termasuk PPN',
        side
      ) +
      top +
      lanes +
      '</div>'
    );
  }

  // ── Tagihan pelanggan ──────────────────────────────────────────────────────
  function customerTable(bc, rows, asOf) {
    var cell = function (label, v, cls) {
      return (
        '<span class="dash-cust-num' +
        (cls && v > 0.5 ? ' ' + cls : '') +
        '"><span class="dash-cust-k">' +
        esc(label) +
        '</span>' +
        (v > 0.5 ? esc(money(v)) : '<span class="t-muted">—</span>') +
        '</span>'
      );
    };
    var head =
      '<div class="dash-cust-row dash-cust-head" aria-hidden="true"><span>Pelanggan</span>' +
      '<span>Belum ditagih</span><span>Ditagih, belum lunas</span><span>Lewat jatuh tempo</span>' +
      '<span>Diterima bulan ini</span></div>';
    var body = rows
      .map(function (r) {
        var notes = [];
        if (r.unbilledCount) {
          notes.push(
            r.unbilledCount +
              ' truk belum ditagih' +
              (qty(r.unbilledQty) ? ' (' + qty(r.unbilledQty) + ')' : '') +
              (r.oldestUnbilled ? ', tertua ' + daysSince(r.oldestUnbilled, asOf) + ' hari' : '')
          );
        }
        if (r.uninvoicedOrdersCount) {
          notes.push(r.uninvoicedOrdersCount + ' pesanan terkirim belum difakturkan');
        }
        if (r.invoicedCount) {
          notes.push(r.invoicedCount + ' faktur terbuka');
        }
        return (
          '<div class="dash-cust-row"><span class="dash-cust-name"><span class="dash-list-title">' +
          esc(r.customer) +
          '</span>' +
          (notes.length
            ? '<span class="dash-list-sub">' + esc(notes.join(' · ')) + '</span>'
            : '') +
          '</span>' +
          cell('Belum ditagih', r.unbilled + r.uninvoicedOrders, 'is-warning') +
          cell('Ditagih, belum lunas', r.invoiced) +
          cell('Lewat jatuh tempo', r.overdue, 'is-danger') +
          cell('Diterima bulan ini', r.paidThisMonth) +
          '</div>'
        );
      })
      .join('');
    var t = bc.totals;
    var foot =
      '<div class="dash-cust-row dash-cust-total"><span class="dash-cust-name"><span class="dash-list-title">Total ' +
      bc.rows.length +
      ' pelanggan</span></span>' +
      cell('Belum ditagih', t.unbilled + t.uninvoicedOrders) +
      cell('Ditagih, belum lunas', t.invoiced) +
      cell('Lewat jatuh tempo', t.overdue, 'is-danger') +
      cell('Diterima bulan ini', t.paidThisMonth) +
      '</div>';
    return '<div class="dash-cust">' + head + body + foot + '</div>';
  }

  function collectionsCard(asOf) {
    var bc = S().byCustomer(asOf);
    var more =
      bc.rows.length > LIST_LIMIT
        ? '<button type="button" class="link-btn" data-action="dashCustomersAll">Lihat semua (' +
          bc.rows.length +
          ')</button>'
        : '';
    return (
      '<div class="card dash-list dash-collect"><div class="card-head"><div>' +
      '<div class="card-title">Tagihan pelanggan</div><div class="card-sub">' +
      esc(
        bc.rows.length
          ? 'Terbuka ' + money(bc.totals.open) + ' · diurutkan dari yang terbesar · termasuk PPN'
          : 'Belum ditagih, sudah ditagih, dan yang diterima bulan ini'
      ) +
      '</div></div>' +
      more +
      '</div>' +
      (bc.rows.length
        ? customerTable(bc, bc.rows.slice(0, LIST_LIMIT), asOf)
        : _dashEmpty(
            'Tidak ada tagihan pelanggan yang terbuka dan belum ada penerimaan bulan ini.'
          )) +
      '</div>'
    );
  }

  function openCustomersAll() {
    if (!S() || typeof openModal !== 'function') {
      return;
    }
    var asOf = today();
    var bc = S().byCustomer(asOf);
    openModal(
      'Tagihan pelanggan',
      '<p class="form-hint dash-modal-hint">Per ' +
        esc(_dashDate(asOf)) +
        '. Belum ditagih: pengambilan dan pesanan terkirim yang belum ada fakturnya. Lewat jatuh tempo adalah bagian dari yang sudah ditagih. Nilai termasuk PPN.</p>' +
        (bc.rows.length
          ? customerTable(bc, bc.rows, asOf)
          : _dashEmpty('Tidak ada tagihan pelanggan.')),
      '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
      true
    );
  }

  // ── PO pengambilan berjalan ────────────────────────────────────────────────
  function poCard(asOf) {
    var list = S().poProgress(asOf);
    var rows = list.slice(0, LIST_LIMIT).map(function (p) {
      var chips = [];
      if (p.pastCutoff) {
        chips.push('<span class="chip chip-danger">Lewat cut-off</span>');
      } else if (p.nearCutoff) {
        chips.push(
          '<span class="chip chip-warning">' +
            (p.daysToCutoff === 0
              ? 'Cut-off hari ini'
              : 'Cut-off ' + p.daysToCutoff + ' hari lagi') +
            '</span>'
        );
      }
      if (p.over > 0) {
        chips.push(
          '<span class="chip chip-danger">Lebih ' + esc(fmtNum(p.over) + ' ' + p.unit) + '</span>'
        );
      } else if (p.nearQuota) {
        chips.push('<span class="chip chip-warning">Kuota ' + Math.round(p.pct * 100) + '%</span>');
      }
      var width = Math.max(0, Math.min(100, Math.round(p.pct * 100)));
      var tone = p.over > 0 || p.pastCutoff ? ' is-danger' : p.flagged ? ' is-warning' : '';
      return (
        '<button type="button" class="dash-po-row' +
        (p.flagged ? ' is-flagged' : '') +
        '" data-dash-open="PO Pengambilan">' +
        '<span class="dash-po-top"><span class="dash-list-title"><span class="doc-no">' +
        esc(p.number) +
        '</span></span>' +
        (chips.length ? '<span class="dash-po-chips">' + chips.join('') + '</span>' : '') +
        '</span>' +
        '<span class="dash-list-sub">' +
        esc([p.customer, p.supplier, p.itemName].filter(Boolean).join(' · ') || '—') +
        '</span>' +
        '<span class="dash-meter' +
        tone +
        '" role="img" aria-label="Diambil ' +
        width +
        '% dari kuota"><i style="width:' +
        width +
        '%"></i></span>' +
        '<span class="dash-po-meta">' +
        esc(
          'Diambil ' +
            fmtNum(p.taken) +
            ' dari ' +
            fmtNum(p.ordered) +
            ' ' +
            p.unit +
            ' (' +
            Math.round(p.pct * 100) +
            '%) · SJ ' +
            p.tripsUsed +
            '/' +
            p.tripsMax +
            (p.cutoff
              ? ' · cut-off ' +
                _dashDate(p.cutoff) +
                (p.daysToCutoff > 3 ? ' (' + p.daysToCutoff + ' hari)' : '')
              : '')
        ) +
        '</span></button>'
      );
    });
    var flagged = list.filter(function (p) {
      return p.flagged;
    }).length;
    return _dashCard(
      'PO pengambilan berjalan',
      list.length
        ? list.length + ' PO terbuka' + (flagged ? ' · ' + flagged + ' perlu perhatian' : '')
        : 'Kuota, surat jalan terpakai, dan batas cut-off',
      list.length
        ? '<div class="dash-list-body dash-po-list">' + rows.join('') + '</div>'
        : _dashEmpty('Tidak ada PO pengambilan yang masih berjalan.'),
      'PO Pengambilan'
    );
  }

  // ── Tonase per bulan ───────────────────────────────────────────────────────
  function trendChip(t) {
    if (!t) {
      return '<span class="t-muted">—</span>';
    }
    if (t.dir === 'tetap') {
      return '<span class="chip">Tetap</span>';
    }
    var label = (t.dir === 'naik' ? 'Naik' : 'Turun') + (t.pct !== null ? ' ' + pct(t.pct) : '');
    return (
      '<span class="chip ' +
      (t.dir === 'naik' ? 'chip-success' : 'chip-warning') +
      '">' +
      esc(label) +
      '</span>'
    );
  }
  function basePeriod(m) {
    var prevKey = m.keys.length > 1 ? m.keys[m.keys.length - 2] : '';
    if (!prevKey) {
      return 'bulan lalu';
    }
    return m.partial
      ? (m.throughDay > 1 ? '1–' + m.throughDay : '1') + ' ' + monthShort(prevKey)
      : monthLong(prevKey);
  }

  function tonnageCard(asOf) {
    var m = S().monthlyTonnage(6, { asOf: asOf });
    if (!m.hasData) {
      return '';
    }
    var unit = m.unit || '';
    var max = Math.max.apply(
      null,
      m.totals
        .map(function (t) {
          return t.value;
        })
        .concat([0])
    );
    var last = m.totals.length - 1;
    var bars = m.totals
      .map(function (t, i) {
        var h = max > 0 ? Math.round((t.value / max) * 100) : 0;
        var partial = i === last && m.partial;
        return (
          '<div class="dash-col' +
          (partial ? ' is-partial' : '') +
          '"><span class="dash-col-val">' +
          (t.value > 0 ? esc(fmtNum(t.value)) : '<span class="t-muted">0</span>') +
          '</span><span class="dash-col-track"><i style="height:' +
          h +
          '%"></i></span><span class="dash-col-key">' +
          esc(monthShort(t.key)) +
          (partial ? '<small>s/d ' + m.throughDay + '</small>' : '') +
          '</span></div>'
        );
      })
      .join('');
    var t = m.trend;
    var summary = t
      ? 'Bulan ini ' +
        fmtNum(t.current) +
        ' ' +
        unit +
        ', ' +
        (t.dir === 'tetap'
          ? 'sama dengan'
          : t.dir + (t.pct !== null ? ' ' + pct(t.pct) : '') + ' dibanding') +
        ' ' +
        basePeriod(m) +
        ' (' +
        fmtNum(t.base) +
        ' ' +
        unit +
        ').'
      : '';
    var otherUnits = m.units.filter(function (u) {
      return u !== m.unit;
    });
    var customers = m.customers
      .filter(function (r) {
        return r.unit === m.unit;
      })
      .slice(0, 5);
    var list =
      '<div class="dash-ton-side"><div class="dash-ton-side-head"><span>Per pelanggan</span><span>Bulan ini</span></div>' +
      customers
        .map(function (r) {
          return (
            '<div class="dash-list-row is-static"><span class="dash-list-main"><span class="dash-list-title">' +
            esc(r.name) +
            '</span><span class="dash-list-sub">6 bulan: ' +
            esc(fmtNum(r.total) + ' ' + r.unit) +
            '</span></span><span class="dash-list-side"><span class="t-strong t-num">' +
            esc(fmtNum(r.current) + ' ' + r.unit) +
            '</span>' +
            trendChip(r.trend) +
            '</span></div>'
          );
        })
        .join('') +
      '<button type="button" class="link-btn dash-ton-more" data-action="dashTonnagePO">Lihat per PO (3 bulan)</button>' +
      '</div>';
    return (
      '<div class="card dash-ton"><div class="card-head"><div><div class="card-title">Tonase per bulan</div>' +
      '<div class="card-sub">' +
      esc('Netto timbangan pengambilan, 6 bulan terakhir' + (unit ? ' (' + unit + ')' : '')) +
      '</div></div></div>' +
      '<div class="dash-ton-grid"><div class="dash-ton-main">' +
      '<div class="dash-cols" role="img" aria-label="Tonase pengambilan per bulan, enam bulan terakhir">' +
      bars +
      '</div>' +
      (summary
        ? '<p class="dash-ton-note">' +
          esc(summary) +
          ' Tren pelanggan memakai perbandingan yang sama.</p>'
        : '') +
      (otherUnits.length
        ? '<p class="dash-ton-note">' +
          esc(
            'Grafik hanya ' + unit + '; ada juga pengambilan dalam ' + otherUnits.join(', ') + '.'
          ) +
          '</p>'
        : '') +
      '</div>' +
      list +
      '</div></div>'
    );
  }

  function openTonnagePO() {
    if (!S() || typeof openModal !== 'function') {
      return;
    }
    var m = S().monthlyTonnage(3, { asOf: today() });
    var heads = m.keys.map(function (k, i) {
      return (
        monthShort(k) + (i === m.keys.length - 1 && m.partial ? ' (1–' + m.throughDay + ')' : '')
      );
    });
    // rows: { number, party, unit, values, trend }
    var table = function (title, rows, first) {
      if (!rows.length) {
        return '';
      }
      return (
        '<h4 class="dash-modal-sub">' +
        esc(title) +
        '</h4><div class="table-wrap"><table class="data-table compact dash-ton-table"><thead><tr><th>' +
        esc(first) +
        '</th>' +
        heads
          .map(function (h) {
            return '<th class="t-num">' + esc(h) + '</th>';
          })
          .join('') +
        '<th>Tren</th></tr></thead><tbody>' +
        rows
          .map(function (r) {
            return (
              '<tr><td><span class="doc-no">' +
              esc(r.number || '—') +
              '</span><div class="dash-list-sub">' +
              esc(r.party || '—') +
              '</div></td>' +
              r.values
                .map(function (v) {
                  return (
                    '<td class="t-num">' +
                    (v > 0 ? esc(fmtNum(v) + ' ' + r.unit) : '<span class="t-muted">—</span>') +
                    '</td>'
                  );
                })
                .join('') +
              '<td>' +
              trendChip(r.trend) +
              '</td></tr>'
            );
          })
          .join('') +
        '</tbody></table></div>'
      );
    };
    openModal(
      'Tonase per PO',
      '<p class="form-hint dash-modal-hint">' +
        esc('Netto timbangan per bulan. Tren: bulan ini dibanding ' + basePeriod(m) + '.') +
        '</p>' +
        (m.hasData
          ? table(
              'Per PO pelanggan',
              m.salesOrders.map(function (r) {
                return Object.assign({}, r, { party: r.customer });
              }),
              'PO pelanggan'
            ) +
            table(
              'Per PO supplier',
              m.purchaseOrders.map(function (r) {
                return Object.assign({}, r, {
                  party: r.supplier + (r.customer ? ' → ' + r.customer : ''),
                });
              }),
              'PO supplier'
            )
          : _dashEmpty('Belum ada pengambilan dalam 3 bulan terakhir.')),
      '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
      true
    );
  }

  // ── Page section ───────────────────────────────────────────────────────────
  // show(id) tells whether a block is switched on in "Atur Tampilan".
  function render(show) {
    if (!S()) {
      return '';
    }
    var asOf = today();
    var data = hasData();
    var buy = can('purchases');
    var html = '';
    if (show('pipeline') && buy) {
      html += pipelineCard(asOf);
    }
    var row = [];
    if (show('collections') && can('sales')) {
      row.push(collectionsCard(asOf));
    }
    if (show('pickupPOs') && buy && data) {
      row.push(poCard(asOf));
    }
    if (row.length) {
      html += '<div class="dash-row dash-row-a">' + row.join('') + '</div>';
    }
    if (show('tonnage') && buy && data) {
      html += tonnageCard(asOf);
    }
    return html;
  }

  return {
    hasData: hasData,
    actions: actions,
    render: render,
    openCustomersAll: openCustomersAll,
    openTonnagePO: openTonnagePO,
  };
})();

// ── Render ───────────────────────────────────────────────────────────────────
function renderDashboard() {
  var money = typeof idr === 'function' ? idr : String;
  var short = typeof idrShort === 'function' ? idrShort : money;
  var hidden = _dashHidden();
  var show = function (id) {
    return hidden.indexOf(id) === -1;
  };
  var now = new Date();
  var todayIso =
    typeof Balances !== 'undefined' && Balances.todayISO ? Balances.todayISO() : _dashMonthKey(now);

  // KPI tiles
  var cash = _dashCash();
  var ar = _dashBalances('sales');
  var ap = _dashBalances('purchases');
  var arUnbilled = ar.items.reduce(function (s, it) {
    return s + (it.unbilled ? it.outstanding : 0);
  }, 0);
  var months = _dashMonthly(2);
  var cur = months.data[months.keys[1]];
  var gross = cur.revenue - cur.cogs;
  // This month so far against the same days of last month, not the whole month.
  var prevDays = Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate());
  var prev = _dashMonthly(2, prevDays).data[months.keys[0]];
  var delta =
    prev.revenue > 0 ? Math.round(((cur.revenue - prev.revenue) / prev.revenue) * 100) : null;
  var prevMonth = DASH_MONTHS[Number(months.keys[0].slice(5, 7)) - 1];
  var prevPeriod = (prevDays > 1 ? '1–' + prevDays : '1') + ' ' + prevMonth;

  var tile = function (o) {
    return (
      '<button type="button" class="card kpi-tile" data-dash-open="' +
      escapeHtml(o.open) +
      '">' +
      '<span class="kpi-tile-label">' +
      escapeHtml(o.label) +
      '</span>' +
      '<span class="kpi-tile-value">' +
      escapeHtml(o.value) +
      '</span>' +
      '<span class="kpi-tile-sub' +
      (o.tone ? ' is-' + o.tone : '') +
      '">' +
      escapeHtml(o.sub) +
      '</span></button>'
    );
  };

  var tiles = [
    tile({
      label: 'Kas & bank',
      value: money(cash.total),
      sub: cash.accounts.length
        ? cash.accounts
            .slice(0, 3)
            .map(function (a) {
              return a.name + ' ' + short(a.balance);
            })
            .join(' · ')
        : 'Belum ada saldo kas atau bank',
      open: 'Riwayat Kas & Bank',
    }),
    tile({
      label: 'Piutang',
      value: money(ar.total),
      sub:
        (ar.overdueCount
          ? short(ar.overdue) + ' lewat jatuh tempo · ' + ar.overdueCount + ' dokumen'
          : ar.count
            ? ar.count + ' dokumen belum lunas, belum ada yang lewat tempo'
            : 'Tidak ada tagihan terbuka') +
        // Trips not yet invoiced are part of the receivable (Balances): say so.
        (arUnbilled > 0.5 ? ' · termasuk ' + short(arUnbilled) + ' belum ditagih' : ''),
      tone: ar.overdueCount ? 'warning' : '',
      open: 'Faktur Penjualan',
    }),
    tile({
      label: 'Hutang',
      value: money(ap.total),
      sub: ap.overdueCount
        ? short(ap.overdue) + ' lewat jatuh tempo · ' + ap.overdueCount + ' dokumen'
        : ap.dueSoon
          ? short(ap.dueSoon) + ' jatuh tempo dalam 7 hari'
          : ap.count
            ? ap.count + ' dokumen belum lunas'
            : 'Tidak ada hutang terbuka',
      tone: ap.overdueCount ? 'danger' : ap.dueSoon ? 'warning' : '',
      open: 'Faktur Pembelian',
    }),
    tile({
      label: 'Penjualan bulan ini',
      value: money(cur.revenue),
      sub:
        'Laba kotor ' +
        short(gross) +
        (delta === null ? '' : ' · ' + (delta >= 0 ? '+' : '−') + Math.abs(delta) + '% vs ' + prevPeriod),
      open: 'Laba Rugi',
    }),
  ].join('');

  // Company data checklist
  var prep = '';
  if (!_companyPrepComplete()) {
    var checks = _companyPrepChecks();
    var missing = checks.filter(function (c) {
      return !c.ok;
    });
    prep =
      '<div class="card dash-prep">' +
      '<div class="card-head"><div><div class="card-title">Lengkapi data dasar</div>' +
      '<div class="card-sub">' +
      (checks.length - missing.length) +
      ' dari ' +
      checks.length +
      ' siap. Data ini dipakai pada dokumen dan laporan.</div></div></div>' +
      '<div class="dash-prep-list">' +
      missing
        .map(function (c) {
          return (
            '<button type="button" class="btn-ghost btn-sm" ' +
            (c.action
              ? 'data-action="' + c.action + '"'
              : 'data-dash-open="' + escapeHtml(c.open) + '"') +
            '>' +
            escapeHtml(c.label) +
            '</button>'
          );
        })
        .join('') +
      '</div></div>';
  }

  // Trend
  var trend = '';
  if (show('trend')) {
    var six = _dashMonthly(6);
    var anyData = six.keys.some(function (k) {
      return six.data[k].revenue || six.data[k].purchases;
    });
    trend =
      '<div class="card dash-trend">' +
      '<div class="card-head"><div><div class="card-title">Penjualan & pembelian</div>' +
      '<div class="card-sub">6 bulan terakhir, dari jurnal yang diposting</div></div>' +
      (anyData
        ? '<div class="chart-legend"><span><i style="background:var(--chart-1)"></i>Penjualan</span>' +
          '<span><i style="background:var(--chart-3)"></i>Pembelian</span></div>'
        : '') +
      '</div>' +
      (anyData
        ? '<div class="chart-wrap"><canvas id="dashTrendChart" role="img" aria-label="Grafik penjualan dan pembelian enam bulan terakhir"></canvas></div>'
        : _dashEmpty('Belum ada penjualan atau pembelian yang diposting dalam 6 bulan terakhir.')) +
      '</div>';
  }

  // Needs action
  var actions = '';
  if (show('actions')) {
    var rows = _dashActions();
    actions = _dashCard(
      'Perlu tindakan',
      'Dokumen yang menunggu langkah berikutnya',
      rows.length
        ? '<div class="dash-list-body">' +
            rows
              .map(function (r) {
                return (
                  '<button type="button" class="dash-list-row" data-dash-open="' +
                  escapeHtml(r.open) +
                  '"><span class="dash-list-main"><span class="dash-list-title">' +
                  escapeHtml(r.label) +
                  '</span><span class="dash-list-sub">' +
                  escapeHtml(r.hint) +
                  '</span></span><span class="dash-count">' +
                  r.count +
                  '</span></button>'
                );
              })
              .join('') +
            '</div>'
        : _dashEmpty('Tidak ada dokumen yang menunggu tindakan.')
    );
  }

  // Due soon (receivables and payables)
  var due = '';
  if (show('due')) {
    var dueItems = ar.items
      .map(function (it) {
        return Object.assign({ side: 'Piutang' }, it);
      })
      .concat(
        ap.items.map(function (it) {
          return Object.assign({ side: 'Hutang' }, it);
        })
      )
      .filter(function (it) {
        return it.dueDate;
      })
      .sort(function (a, b) {
        return String(a.dueDate).localeCompare(String(b.dueDate));
      })
      .slice(0, 6);
    due = _dashCard(
      'Jatuh tempo terdekat',
      'Piutang dan hutang yang belum lunas',
      dueItems.length
        ? '<div class="dash-list-body">' +
            dueItems
              .map(function (it) {
                var open =
                  it.docType === 'SI' || it.docType === 'PI'
                    ? 'data-action="invView" data-type="' + it.docType + '"'
                    : 'data-action="' + (it.docType === 'SO' ? 'viewSO' : 'viewPO') + '"';
                var days =
                  typeof Balances !== 'undefined' && Balances.daysBetween
                    ? Balances.daysBetween(todayIso, it.dueDate)
                    : null;
                var chip = it.overdue
                  ? '<span class="chip chip-danger">Lewat ' + it.daysOverdue + ' hari</span>'
                  : days !== null && days <= 7
                    ? '<span class="chip chip-warning">' +
                      (days === 0 ? 'Hari ini' : days === 1 ? 'Besok' : days + ' hari lagi') +
                      '</span>'
                    : '<span class="t-muted">' + escapeHtml(_dashDate(it.dueDate)) + '</span>';
                return (
                  '<button type="button" class="dash-list-row" ' +
                  open +
                  ' data-id="' +
                  escapeHtml(it.id) +
                  '"><span class="dash-list-main"><span class="dash-list-title"><span class="doc-no">' +
                  escapeHtml(docNum(it.number, it.id)) +
                  '</span></span><span class="dash-list-sub">' +
                  escapeHtml(it.side + ' · ' + (it.party || '—')) +
                  '</span></span><span class="dash-list-side"><span class="t-strong t-num">' +
                  escapeHtml(money(it.outstanding)) +
                  '</span>' +
                  chip +
                  '</span></button>'
                );
              })
              .join('') +
            '</div>'
        : _dashEmpty('Tidak ada piutang atau hutang yang belum lunas.'),
      'Ringkasan Keuangan'
    );
  }

  // Low stock
  var stock = '';
  if (show('stock')) {
    var low = _dashLowStock();
    stock = _dashCard(
      'Stok menipis',
      low.length ? low.length + ' barang di bawah atau sama dengan stok minimum' : 'Stok minimum per barang',
      low.length
        ? '<div class="dash-list-body">' +
            low
              .slice(0, 6)
              .map(function (x) {
                return (
                  '<button type="button" class="dash-list-row" data-action="viewItem" data-id="' +
                  escapeHtml(x.item.id) +
                  '"><span class="dash-list-main"><span class="dash-list-title">' +
                  escapeHtml(x.item.name || x.item.id) +
                  '</span><span class="dash-list-sub">Minimum ' +
                  x.min +
                  ' ' +
                  escapeHtml(x.item.unit || '') +
                  '</span></span><span class="dash-list-side">' +
                  (x.stock <= 0
                    ? '<span class="chip chip-danger">Habis</span>'
                    : '<span class="t-strong t-num">' + x.stock + ' ' + escapeHtml(x.item.unit || '') + '</span>') +
                  '</span></button>'
                );
              })
              .join('') +
            '</div>'
        : _dashEmpty('Semua barang di atas stok minimum.'),
      low.length ? 'Barang & Stok' : ''
    );
  }

  // Activity: audit log, or the latest documents while the log is still empty
  var activity = '';
  if (show('activity')) {
    var log = (DB.auditLog || []).slice(-6).reverse();
    var body;
    var title = 'Aktivitas terbaru';
    var sub = 'Perubahan data yang tercatat';
    if (log.length) {
      body =
        '<div class="dash-list-body">' +
        log
          .map(function (e) {
            var what = DASH_COLLECTIONS[e.collection] || e.collection || 'Data';
            return (
              '<div class="dash-list-row is-static"><span class="dash-list-main"><span class="dash-list-title">' +
              escapeHtml(what) +
              (e.number ? ' <span class="doc-no">' + escapeHtml(e.number) + '</span>' : '') +
              ' ' +
              escapeHtml(DASH_VERBS[e.action] || e.action || '') +
              '</span><span class="dash-list-sub">' +
              escapeHtml(_dashTime(e.ts) + (e.user ? ' · ' + e.user : '')) +
              '</span></span>' +
              (e.summary ? '<span class="dash-list-side"><span class="chip">' + escapeHtml(e.summary) + '</span></span>' : '') +
              '</div>'
            );
          })
          .join('') +
        '</div>';
    } else {
      title = 'Dokumen terbaru';
      sub = 'Berdasarkan tanggal dokumen';
      var docs = []
        .concat(
          (DB.salesOrders || []).map(function (d) {
            return { d: d, what: 'Pesanan penjualan', party: d.customer, action: 'viewSO' };
          }),
          (DB.purchaseOrders || []).map(function (d) {
            return { d: d, what: 'Pesanan pembelian', party: d.supplier, action: 'viewPO' };
          }),
          (DB.deliveryOrders || []).map(function (d) {
            return { d: d, what: 'Surat jalan', party: d.customer, action: 'viewDO' };
          })
        )
        .filter(function (x) {
          return x.d.date;
        })
        .sort(function (a, b) {
          return String(b.d.date).localeCompare(String(a.d.date));
        })
        .slice(0, 6);
      body = docs.length
        ? '<div class="dash-list-body">' +
          docs
            .map(function (x) {
              return (
                '<button type="button" class="dash-list-row" data-action="' +
                x.action +
                '" data-id="' +
                escapeHtml(x.d.id) +
                '"><span class="dash-list-main"><span class="dash-list-title">' +
                escapeHtml(x.what) +
                ' <span class="doc-no">' +
                escapeHtml(docNum(x.d.number, x.d.id)) +
                '</span></span><span class="dash-list-sub">' +
                escapeHtml(_dashDate(x.d.date) + (x.party ? ' · ' + x.party : '')) +
                '</span></span></button>'
              );
            })
            .join('') +
          '</div>'
        : _dashEmpty('Belum ada dokumen.');
    }
    activity = _dashCard(title, sub, body);
  }

  var rowA = [trend, actions].filter(Boolean);
  var rowB = [due, stock, activity].filter(Boolean);
  var dateLabel = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    '<div class="sec-hdr"><div><h1>Ringkasan</h1><p>' +
    escapeHtml(dateLabel) +
    ' · dihitung dari transaksi yang tercatat</p></div>' +
    '<div><button type="button" class="btn-ghost" data-action="dashLayout">Atur Tampilan</button></div></div>' +
    prep +
    '<div class="dash-kpis">' +
    tiles +
    '</div>' +
    _dashTrading.render(show) +
    (rowA.length ? '<div class="dash-row dash-row-a">' + rowA.join('') + '</div>' : '') +
    (rowB.length ? '<div class="dash-row dash-row-b">' + rowB.join('') + '</div>' : '')
  );
}

// ── Interactions ─────────────────────────────────────────────────────────────
// Tiles, list rows and links carry the sidebar entry they open.
document.addEventListener('click', function (e) {
  var el = e.target && e.target.closest ? e.target.closest('[data-dash-open]') : null;
  if (!el) {
    return;
  }
  e.preventDefault();
  if (window.NSANav) {
    window.NSANav.open(el.getAttribute('data-dash-open'));
  }
});

(function _registerDashActions() {
  function _reg() {
    ERP.registerAction('dashLayout', function () {
      var hidden = _dashHidden();
      var body =
        '<p class="form-hint" style="margin:0 0 12px">Pilih bagian yang ditampilkan. Pilihan tersimpan di browser ini.</p>' +
        DASH_BLOCKS.map(function (b) {
          return (
            '<label class="dash-opt"><input type="checkbox" class="dash-opt-input" value="' +
            b.id +
            '"' +
            (hidden.indexOf(b.id) === -1 ? ' checked' : '') +
            '><span>' +
            escapeHtml(b.label) +
            '</span></label>'
          );
        }).join('');
      if (typeof openModal === 'function') {
        openModal(
          'Atur Tampilan Ringkasan',
          body,
          '<button class="btn-ghost" data-action="closeModal">Batal</button>' +
            '<button class="btn" data-action="dashLayoutApply">Terapkan</button>'
        );
      }
      return true;
    });

    ERP.registerAction('dashCustomersAll', function () {
      _dashTrading.openCustomersAll();
      return true;
    });

    ERP.registerAction('dashTonnagePO', function () {
      _dashTrading.openTonnagePO();
      return true;
    });

    ERP.registerAction('dashLayoutApply', function () {
      var hidden = [];
      document.querySelectorAll('.dash-opt-input').forEach(function (b) {
        if (!b.checked) {
          hidden.push(b.value);
        }
      });
      _dashSetHidden(hidden);
      if (typeof closeModal === 'function') {
        closeModal();
      }
      _refreshDashboard();
      return true;
    });
  }

  if (typeof ERP !== 'undefined' && ERP.registerAction) {
    _reg();
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      if (typeof ERP !== 'undefined' && ERP.registerAction) {
        _reg();
      }
    });
  }
})();
