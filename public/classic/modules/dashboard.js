// ═══════════════════════════════════════════════════════════════════════════════
// Nusantara ERP — Ringkasan (dashboard)  (modules/dashboard.js)
//
// Answers "what does the owner or admin need to know right now?" (docs/09 §4),
// using only records the application keeps. Top to bottom:
//   • Header with the period switch (Bulan ini · 3 bulan · Tahun ini); the
//     choice is kept per browser and drives every period figure on the page
//   • Kas & bank, Piutang, Hutang (GL.trialBalance, Balances.summary) and the
//     gross profit of the period (revenue and COGS journal lines)
//   • Alur transaksi — the flow of the period as vertical funnels whose layers
//     narrow with the value: pickups (TradingSummary.pipeline) Diambil →
//     Ditagih → Dibayar for customers and suppliers side by side, and warehouse
//     orders Dipesan → Dikirim/Diterima → Difakturkan → Lunas
//     (OrderPipeline.summary). See _dashTrading below.
//   • Perlu tindakan — documents waiting for their next step, most important
//     first; Tren 6 bulan — sales vs purchases from journals, or pickup tonnage
//   • Optional blocks, off until switched on in "Atur Tampilan": Tagihan
//     pelanggan, PO pengambilan berjalan, Tonase per bulan, Jatuh tempo, Stok
//     menipis, Aktivitas terbaru.
// Blocks are hidden for roles that cannot view their module. The company data
// checklist shows until the basics are filled in.
//
// Classic script sharing the bundle's global scope: renderDashboard, initCharts,
// destroyCharts and _initChartsImpl are globals used by nav.js and erp-view.js.
// ═══════════════════════════════════════════════════════════════════════════════

// Hidden block ids per browser. Without a stored choice the blocks marked
// `on: false` stay hidden.
var DASH_HIDDEN_KEY = 'nsa_dash_hidden_v3';
var DASH_BLOCKS = [
  { id: 'pipeline', label: 'Alur transaksi', on: true },
  { id: 'actions', label: 'Perlu tindakan', on: true },
  { id: 'trend', label: 'Tren 6 bulan', on: true },
  { id: 'collections', label: 'Tagihan pelanggan', on: false },
  { id: 'pickupPOs', label: 'PO pengambilan berjalan', on: false },
  { id: 'tonnage', label: 'Tonase per bulan', on: false },
  { id: 'due', label: 'Jatuh tempo terdekat', on: false },
  { id: 'stock', label: 'Stok menipis', on: false },
  { id: 'activity', label: 'Aktivitas terbaru', on: false },
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
    if (Array.isArray(v)) {
      return v;
    }
  } catch (_) {
    /* storage unavailable */
  }
  return DASH_BLOCKS.filter(function (b) {
    return !b.on;
  }).map(function (b) {
    return b.id;
  });
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

// Tren 6 bulan: sales vs purchases from journals ("Rp"), or the net weight of
// pickup trips per month ("Ton", TradingSummary.monthlyTonnage).
function _initChartsImpl() {
  var canvas = document.getElementById('dashTrendChart');
  if (typeof Chart === 'undefined' || !canvas || !document.body.contains(canvas)) {
    return;
  }
  var css = getComputedStyle(document.documentElement);
  var tok = function (name, fallback) {
    return (css.getPropertyValue(name) || '').trim() || fallback;
  };
  var font = { family: tok('--font-sans', 'system-ui, sans-serif'), size: 11 };
  var money = typeof idr === 'function' ? idr : String;
  var short = typeof idrShort === 'function' ? idrShort : String;
  var monthLabel = function (k) {
    return DASH_MONTHS[Number(String(k).slice(5, 7)) - 1];
  };
  var bar = function (label, data, color) {
    return {
      label: label,
      data: data,
      backgroundColor: color,
      borderRadius: 4,
      maxBarThickness: 22,
    };
  };
  var labels;
  var datasets;
  var tipValue;
  var tickValue;
  if (canvas.getAttribute('data-mode') === 'ton') {
    var m = _dashTrading.tonnage();
    var unit = m.unit || '';
    var qty = function (v) {
      return Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 1 });
    };
    labels = m.keys.map(monthLabel);
    datasets = [
      bar(
        'Netto',
        m.totals.map(function (t) {
          return t.value;
        }),
        tok('--chart-2', '#3b82f6')
      ),
    ];
    tipValue = function (v) {
      return qty(v) + (unit ? ' ' + unit : '');
    };
    tickValue = qty;
  } else {
    var series = _dashMonthly(6);
    labels = series.keys.map(monthLabel);
    datasets = [
      bar(
        'Penjualan',
        series.keys.map(function (k) {
          return Math.round(series.data[k].revenue);
        }),
        tok('--chart-1', '#06845c')
      ),
      bar(
        'Pembelian',
        series.keys.map(function (k) {
          return Math.round(series.data[k].purchases);
        }),
        tok('--chart-3', '#d97706')
      ),
    ];
    tipValue = money;
    tickValue = function (v) {
      return short(v).replace('Rp ', '');
    };
  }

  charts.dashTrend = new Chart(canvas, {
    type: 'bar',
    data: { labels: labels, datasets: datasets },
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
              return c.dataset.label + ': ' + tipValue(c.raw);
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
            callback: tickValue,
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

// Rows for "Perlu tindakan", most important first (`rank`): money not yet
// billed, billed figures that no longer match, then the order flow. Each row
// also says what to do (`title`), what its count counts (`unit`) and the flow
// it belongs to (`flow`: pickups / sales / purchases / other); `urgent` rows
// are money or figures to settle. The sidebar shows the same counts beside
// the flow stages (ui/nav.js).
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
  // pickup rows: a slot stays 'Pending' until a truck uses it, and the orders
  // stay 'Confirmed' until their quota or cut-off closes them.
  var notPickup = function (o) {
    return !o.pickupFlow && o.pickup !== true;
  };
  return _dashTrading
    .actions()
    .concat([
      {
        label: 'Pesanan terkirim tanpa faktur',
        hint: 'Barang sudah dikirim, faktur belum dibuat',
        count: so.filter(function (o) {
          return o.status === 'Delivered' && !invoiced('sales', o.id);
        }).length,
        open: 'Faktur Penjualan',
        rank: 3,
        title: 'Buat faktur pesanan terkirim',
        unit: 'pesanan',
        flow: 'sales',
        urgent: true,
      },
      {
        label: 'Pengiriman belum selesai',
        hint: 'Surat jalan pending atau dalam perjalanan',
        count: (DB.deliveryOrders || []).filter(function (d) {
          return (d.status === 'Pending' || d.status === 'In Transit') && notPickup(d);
        }).length,
        open: 'Surat Jalan',
        rank: 6,
        title: 'Selesaikan pengiriman',
        unit: 'surat jalan',
        flow: 'sales',
      },
      {
        label: 'Pesanan penjualan belum dikirim',
        hint: 'Dikonfirmasi atau lunas, barang belum keluar',
        count: so.filter(function (o) {
          return (o.status === 'Confirmed' || o.status === 'Paid') && notPickup(o);
        }).length,
        open: 'Pesanan Penjualan',
        rank: 7,
        title: 'Kirim pesanan penjualan',
        unit: 'pesanan',
        flow: 'sales',
      },
      {
        label: 'Pesanan pembelian belum diterima',
        hint: 'Dikonfirmasi atau lunas, barang belum masuk',
        count: po.filter(function (o) {
          return (o.status === 'Confirmed' || o.status === 'Paid') && notPickup(o);
        }).length,
        open: 'Pesanan Pembelian',
        rank: 8,
        title: 'Terima barang pesanan pembelian',
        unit: 'pesanan',
        flow: 'purchases',
      },
      {
        label: 'Penawaran menunggu jawaban',
        hint: 'Penawaran penjualan yang sudah dikirim',
        count: (DB.salesQuotations || []).filter(function (q) {
          return q.status === 'Sent';
        }).length,
        open: 'Penawaran Penjualan',
        rank: 9,
        title: 'Tindak lanjuti penawaran',
        unit: 'penawaran',
        flow: 'sales',
      },
      {
        label: 'Dokumen masih draft',
        hint: 'Pesanan dan faktur yang belum diposting',
        count: drafts,
        open: 'Pesanan Penjualan',
        rank: 10,
        title: 'Selesaikan dokumen draft',
        unit: 'dokumen',
        flow: 'other',
      },
    ])
    .filter(function (r) {
      return r.count > 0;
    })
    .map(function (r, i) {
      return { row: r, i: i };
    })
    .sort(function (a, b) {
      return a.row.rank - b.row.rank || a.i - b.i;
    })
    .map(function (x) {
      return x.row;
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

// Flows of "Perlu tindakan", in the sidebar's order, with the sidebar's icons.
var _DASH_FLOWS = [
  { key: 'pickups', title: 'Pengambilan', icon: 'truck' },
  { key: 'sales', title: 'Penjualan', icon: 'trending-up' },
  { key: 'purchases', title: 'Pembelian', icon: 'shopping-cart' },
  { key: 'other', title: 'Lainnya', icon: 'file' },
];
var _DASH_FLOW_ICONS = {
  truck:
    '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  'shopping-cart':
    '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
};
function _dashFlowIcon(name) {
  return (
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (_DASH_FLOW_ICONS[name] || '') +
    '</svg>'
  );
}

// ── Period, flow, trend and trading blocks ───────────────────────────────────
// Kept in one object so this file adds a single name to the shared scope:
//   • the period switch (Bulan ini · 3 bulan · Tahun ini), kept per browser
//   • Alur transaksi: pickups (window.TradingSummary over trading.js) and
//     warehouse orders (window.OrderPipeline) drawn as vertical funnels
//   • Tren 6 bulan card, in Rupiah or tonnage
//   • the pickup rows of "Perlu tindakan" and the optional blocks Tagihan
//     pelanggan, PO pengambilan berjalan and Tonase per bulan
// Every figure is counted from documents; nothing here writes to DB.
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
  var PERIOD_KEY = 'nsa_dash_period';
  var TREND_KEY = 'nsa_dash_trend';
  var PERIODS = {
    month: { label: 'Bulan ini', tile: 'bulan ini' },
    '3m': { label: '3 bulan', tile: '3 bulan' },
    year: { label: 'Tahun ini', tile: 'tahun ini' },
  };
  var PERIOD_ORDER = ['month', '3m', 'year'];
  var DEFAULT_PERIOD = '3m';
  // Tab of Alur transaksi chosen in this session (kept across re-renders).
  var chosenTab = null;

  function S() {
    return window.TradingSummary || null;
  }
  function OP() {
    return window.OrderPipeline || null;
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
  // Compact form for the flow: { Ton: 5946.2 } → "5.946 t"
  function qtyShort(map) {
    return Object.keys(map || {})
      .filter(function (u) {
        return Math.abs(Number(map[u]) || 0) > 0.0005;
      })
      .map(function (u) {
        var v = Number(map[u]) || 0;
        var n = v.toLocaleString('id-ID', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 });
        return n + (u ? ' ' + (/^ton$/i.test(u) ? 't' : u) : '');
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
  function trucks(n) {
    return n + ' truk';
  }

  function hasData() {
    return !!S() && S().hasData();
  }

  // ── Period ─────────────────────────────────────────────────────────────────
  function periodKey() {
    try {
      var v = localStorage.getItem(PERIOD_KEY);
      if (PERIODS[v]) {
        return v;
      }
    } catch (_) {
      /* storage unavailable */
    }
    return DEFAULT_PERIOD;
  }
  function setPeriod(key) {
    if (!PERIODS[key]) {
      return false;
    }
    try {
      localStorage.setItem(PERIOD_KEY, key);
    } catch (_) {
      /* storage unavailable */
    }
    return true;
  }
  // { key, label, months, from, to }: from the 1st of the first month to today.
  // Bulan ini = this month, 3 bulan = this month and the two before, Tahun ini
  // = since 1 January.
  function period(key) {
    key = PERIODS[key] ? key : periodKey();
    var to = today();
    var y = Number(to.slice(0, 4));
    var m = Number(to.slice(5, 7));
    var months = key === 'month' ? 1 : key === '3m' ? 3 : m;
    return {
      key: key,
      label: PERIODS[key].label,
      tile: PERIODS[key].tile,
      months: months,
      from: _dashMonthKey(new Date(y, m - months, 1)) + '-01',
      to: to,
    };
  }
  // "1 Agu – 3 Okt 2026"
  function rangeLabel(per) {
    var a = String(per.from).split('-');
    var b = String(per.to).split('-');
    return (
      Number(a[2]) +
      ' ' +
      DASH_MONTHS[Number(a[1]) - 1] +
      (a[0] !== b[0] ? ' ' + a[0] : '') +
      ' – ' +
      _dashDate(per.to)
    );
  }
  function periodSwitch(per) {
    return (
      '<div class="seg-tabs dash-period" role="group" aria-label="Periode">' +
      PERIOD_ORDER.map(function (k) {
        var on = k === per.key;
        return (
          '<button type="button" class="seg-tab' +
          (on ? ' active' : '') +
          '" aria-pressed="' +
          on +
          '" data-action="dashPeriod" data-val="' +
          k +
          '">' +
          esc(PERIODS[k].label) +
          '</button>'
        );
      }).join('') +
      '</div>'
    );
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
        rank: 1,
        title: 'Tagih pengambilan',
        unit: 'truk',
        flow: 'pickups',
        urgent: true,
      });
    }
    if (can('purchases')) {
      var diffs = S().supplierDiffs();
      rows.push({
        label: 'Perubahan timbangan belum ditindaklanjuti',
        hint: 'Berat berubah setelah pengambilan ditagih',
        count: diffs.alerts.length,
        open: 'Perubahan Timbangan',
        rank: 2,
        title: 'Periksa perubahan timbangan',
        unit: 'surat jalan',
        flow: 'pickups',
        urgent: true,
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
        rank: 5,
        title: 'Periksa PO pengambilan',
        unit: 'PO',
        flow: 'pickups',
      });
      rows.push({
        label: 'Tagihan supplier berbeda dari pengambilan',
        hint: 'Jumlah atau harga di faktur supplier tidak sama dengan timbangan',
        count: diffs.invoices,
        open: 'Tagihan Supplier',
        rank: 4,
        title: 'Cocokkan tagihan supplier',
        unit: 'tagihan',
        flow: 'pickups',
        urgent: true,
      });
    }
    return rows;
  }

  // ── Alur transaksi: data ───────────────────────────────────────────────────
  // Every funnel is a list of cumulative stages, widest first. A stage carries
  // its figures (count, value), a short description (`sub`), where it opens
  // (`open` = sidebar entry, `action` = registered action) and the `leak`: what
  // stopped before reaching it, so stage[i − 1] − stage[i] = stage[i].leak.
  //
  // Pickups of the period per side, from TradingSummary.pipeline (each trip is
  // in exactly one billing state per side):
  //   Diambil = every trip taken · Ditagih = on an invoice (open or paid) ·
  //   Dibayar = on a paid invoice
  function stageOf(label, parts, extra) {
    var st = { label: label, count: 0, value: 0 };
    parts.forEach(function (p) {
      st.count += p.count;
      st.value += p.value;
    });
    return Object.assign(st, extra || {});
  }
  // "131 truk · 95%": the count, and the value as a share of the first stage.
  function shareOf(st, base, unit) {
    var n = st.count + ' ' + unit;
    return base.value > 0.5 ? n + ' · ' + pct(st.value / base.value) : n;
  }
  function leakOf(part, text, target) {
    return Object.assign({ count: part.count, value: part.value, text: text }, target);
  }
  function pickupFlow(per) {
    per = per || period();
    var p = S().pipeline({ from: per.from, to: per.to }, { asOf: per.to });
    var tons = qtyShort(p.taken.qty);
    var bands = [];
    if (can('sales')) {
      var taken = stageOf('Diambil', [p.taken], { open: 'Rekap Pengambilan' });
      taken.sub = [trucks(taken.count), tons].filter(Boolean).join(' · ');
      var billed = stageOf('Ditagih', [p.billed, p.paid], {
        leak: leakOf(p.unbilled, 'truk belum ditagih', { open: 'Tagih Pelanggan' }),
      });
      billed.sub = shareOf(billed, taken, 'truk');
      var paid = stageOf('Dibayar', [p.paid], {
        leak: leakOf(p.billed, 'belum lunas', { open: 'Faktur Penjualan' }),
      });
      paid.sub = shareOf(paid, taken, 'truk');
      bands.push({
        key: 'sales',
        label: 'Ke pelanggan',
        unit: 'nilai jual',
        stages: shape([taken, billed, paid]),
      });
    }
    var sTaken = stageOf('Diambil', [p.supplierUnbilled, p.supplierBilled, p.supplierPaid], {
      open: 'Rekap Pengambilan',
    });
    sTaken.sub = [trucks(sTaken.count), tons].filter(Boolean).join(' · ');
    var sBilled = stageOf('Ditagih', [p.supplierBilled, p.supplierPaid], {
      leak: leakOf(p.supplierUnbilled, 'belum ditagih supplier', { open: 'Tagihan Supplier' }),
    });
    sBilled.sub = shareOf(sBilled, sTaken, 'truk');
    var sPaid = stageOf('Dibayar', [p.supplierPaid], {
      leak: leakOf(p.supplierBilled, 'belum dibayar', { open: 'Faktur Pembelian' }),
    });
    sPaid.sub = shareOf(sPaid, sTaken, 'truk');
    bands.push({
      key: 'purchases',
      label: 'Dari supplier',
      unit: 'nilai beli',
      stages: shape([sTaken, sBilled, sPaid]),
    });
    var T = window.Trading;
    return {
      period: per,
      pipeline: p,
      bands: bands,
      alerts: T && typeof T.openAlerts === 'function' ? T.openAlerts().length : 0,
    };
  }
  // Warehouse orders of the period (pickup orders left out) per stage.
  function orderFlow(side, per) {
    per = per || period();
    return OP().summary(side, { from: per.from, to: per.to, pickup: false });
  }
  // The same orders as a cumulative funnel over the OrderPipeline stages:
  //   Dipesan     = confirmed + delivered + unpaid + paid (every order past draft)
  //   Dikirim /   = delivered + unpaid + paid
  //   Diterima
  //   Difakturkan = unpaid + paid
  //   Lunas       = paid
  // Each stage opens the order list at its own OrderPipeline stage; drafts are
  // counted apart.
  function orderFunnel(side, per) {
    var s = orderFlow(side, per);
    var by = {};
    s.stages.forEach(function (st) {
      by[st.key] = st;
    });
    var at = function (key) {
      return { action: { name: 'dashOrderStage', type: side, val: key } };
    };
    var sales = side === 'sales';
    var ordered = stageOf('Dipesan', [by.confirmed, by.delivered, by.unpaid, by.paid], at('confirmed'));
    ordered.sub = ordered.count + ' pesanan';
    var moved = stageOf(
      sales ? 'Dikirim' : 'Diterima',
      [by.delivered, by.unpaid, by.paid],
      Object.assign(at('delivered'), {
        leak: leakOf(by.confirmed, sales ? 'belum dikirim' : 'belum diterima', at('confirmed')),
      })
    );
    var invoiced = stageOf(
      'Difakturkan',
      [by.unpaid, by.paid],
      Object.assign(at('unpaid'), {
        leak: leakOf(by.delivered, 'belum difakturkan', at('delivered')),
      })
    );
    var unpaid = leakOf(by.unpaid, 'belum lunas', at('unpaid'));
    if (by.unpaid.outstanding > 0.5 && Math.abs(by.unpaid.outstanding - by.unpaid.value) > 0.5) {
      unpaid.note = 'sisa ' + short(by.unpaid.outstanding);
    }
    var paid = stageOf('Lunas', [by.paid], Object.assign(at('paid'), { leak: unpaid }));
    [moved, invoiced, paid].forEach(function (st) {
      st.sub = shareOf(st, ordered, 'pesanan');
    });
    return {
      key: side,
      label: sales ? 'Penjualan gudang' : 'Pembelian gudang',
      stages: shape([ordered, moved, invoiced, paid]),
      draft: Object.assign({ count: by.draft.count, value: by.draft.value }, at('draft')),
      total: s.total,
    };
  }
  // Tabs of Alur transaksi that have data the role may see, in this order.
  function flowTabs() {
    var tabs = [];
    if (can('purchases') && hasData()) {
      tabs.push({ key: 'pickup', label: 'Pengambilan' });
    }
    if (OP()) {
      if (can('sales') && OP().summary('sales', { pickup: false }).total > 0) {
        tabs.push({ key: 'sales', label: 'Penjualan gudang' });
      }
      if (can('purchases') && OP().summary('purchases', { pickup: false }).total > 0) {
        tabs.push({ key: 'purchases', label: 'Pembelian gudang' });
      }
    }
    return tabs;
  }

  // ── Alur transaksi: drawing ────────────────────────────────────────────────
  // A classic vertical funnel: one layer per stage, stacked top to bottom and
  // narrowing downward. A layer's top edge is its own width and its bottom edge
  // the width of the next layer; the last one closes to a neck. Widths follow
  // the value on the funnel's own scale (first stage = full width) and never
  // grow downward. Each layer is a row: the stage text on the left, its slice
  // of the funnel (an inline SVG stretched to the row) on the right, so text
  // never sits on a shape. Fills are one hue from light (top) to dark.
  var FUNNEL = { neck: 0.35, min: 0.02, h: 60 };
  function r3(v) {
    return Math.round(v * 1000) / 1000;
  }
  // Adds w (top edge) and wb (bottom edge), as shares of the full width. The
  // last layer with a value closes to the neck; empty layers are not drawn.
  function shape(stages) {
    var top = stages.length ? stages[0].value : 0;
    var prev = 1;
    stages.forEach(function (s) {
      var w = top > 0.5 && s.value > 0.5 ? Math.max(FUNNEL.min, Math.min(1, s.value / top)) : 0;
      w = Math.min(prev, w);
      s.w = r3(w);
      prev = w;
    });
    stages.forEach(function (s, i) {
      var next = i < stages.length - 1 ? stages[i + 1].w : 0;
      s.wb = next > 0 ? next : r3(s.w * FUNNEL.neck);
    });
    return stages;
  }
  // Where a stage or a leak goes: a sidebar entry or a registered action.
  function targetAttrs(t) {
    if (t.open) {
      return ' data-dash-open="' + esc(t.open) + '"';
    }
    if (t.action) {
      return (
        ' data-action="' +
        esc(t.action.name) +
        '" data-type="' +
        esc(t.action.type) +
        '" data-val="' +
        esc(t.action.val) +
        '"'
      );
    }
    return '';
  }
  function layerPath(w, wb) {
    var H = FUNNEL.h;
    var x = function (share, side) {
      return r3(50 + side * share * 50);
    };
    return (
      'M' + x(w, -1) + ' 0H' + x(w, 1) + 'L' + x(wb, 1) + ' ' + H + 'H' + x(wb, -1) + 'Z'
    );
  }
  // "7 truk belum ditagih · Rp 39 jt" as parts that do not break inside, so a
  // narrow column wraps only between them.
  function parts(list) {
    return list
      .filter(Boolean)
      .map(function (part) {
        return '<span>' + esc(part) + '</span>';
      })
      .join(' · ');
  }
  function leakLine(lk) {
    if (!lk || !lk.count) {
      return '';
    }
    return (
      '<button type="button" class="dash-funnel-leak"' +
      targetAttrs(lk) +
      '>' +
      parts([lk.count + ' ' + lk.text, short(lk.value), lk.note]) +
      '</button>'
    );
  }
  function funnelRow(band, s, i) {
    var n = band.stages.length;
    var attrs = targetAttrs(s);
    var zero = !(s.value > 0.5) && !s.count ? ' is-zero' : '';
    var inner =
      '<span class="dash-funnel-line"><span class="dash-funnel-name">' +
      esc(s.label) +
      '</span><span class="dash-funnel-value">' +
      esc(short(s.value)) +
      '</span></span><span class="dash-funnel-desc">' +
      parts(String(s.sub || '').split(' · ')) +
      '</span>';
    var aria = s.label + ', ' + band.label.toLowerCase() + ': ' + short(s.value) + ', ' + (s.sub || '');
    var stage = attrs
      ? '<button type="button" class="dash-funnel-stage' +
        zero +
        '"' +
        attrs +
        ' aria-label="' +
        esc(aria) +
        '">' +
        inner +
        '</button>'
      : '<div class="dash-funnel-stage' + zero + '">' + inner + '</div>';
    var tone = n > 1 ? r3(i / (n - 1)) : 1;
    var layer =
      s.w > 0
        ? '<path class="dash-funnel-layer" style="--t:' +
          tone +
          '" d="' +
          layerPath(s.w, s.wb) +
          '"' +
          attrs +
          '/>'
        : '';
    return (
      '<div class="dash-funnel-row' +
      (attrs ? ' is-link' : '') +
      '"><div class="dash-funnel-label">' +
      stage +
      leakLine(s.leak) +
      '</div><div class="dash-funnel-plot"><svg class="dash-funnel-shape" viewBox="0 0 100 ' +
      FUNNEL.h +
      '" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
      layer +
      '</svg></div></div>'
    );
  }
  // One funnel; `head` shows the band's name above it (pickup sides).
  function funnelBlock(band, head) {
    return (
      '<section class="dash-funnel is-' +
      band.key +
      '" aria-label="' +
      esc(band.label) +
      '">' +
      (head
        ? '<div class="dash-funnel-head"><span class="dash-funnel-title">' +
          esc(band.label) +
          '</span>' +
          (band.unit ? ' <span class="dash-funnel-unit">' + esc(band.unit) + '</span>' : '') +
          '</div>'
        : '') +
      '<div class="dash-funnel-body">' +
      band.stages
        .map(function (s, i) {
          return funnelRow(band, s, i);
        })
        .join('') +
      '</div></section>'
    );
  }
  function funnels(bands, head) {
    return (
      '<div class="dash-funnels' +
      (bands.length > 1 ? ' is-pair' : '') +
      '">' +
      bands
        .map(function (b) {
          return funnelBlock(b, head);
        })
        .join('') +
      '</div>'
    );
  }

  // ── Alur transaksi: panels ─────────────────────────────────────────────────
  function pickupPanel(per) {
    var f = pickupFlow(per);
    var p = f.pipeline;
    var html = p.taken.count
      ? funnels(f.bands, true)
      : _dashEmpty('Belum ada pengambilan pada periode ini.');
    // Trips from before the period that are still not billed.
    var carry = function (st, text, open) {
      return st.count
        ? '<button type="button" class="link-btn" data-dash-open="' +
            esc(open) +
            '">' +
            esc('+ ' + trucks(st.count) + ' sebelum ' + _dashDate(per.from) + ' ' + text + ' · ' + short(st.value)) +
            '</button>'
        : '';
    };
    var notes = [
      can('sales') ? carry(p.carryOver.unbilled, 'belum ditagih', 'Tagih Pelanggan') : '',
      carry(p.carryOver.supplierUnbilled, 'belum ditagih supplier', 'Tagihan Supplier'),
    ].filter(Boolean);
    if (notes.length) {
      html += '<div class="dash-flow-notes">' + notes.join('') + '</div>';
    }
    var po = p.openPOs;
    var facts = [po.count ? po.count + ' PO berjalan' : 'Tidak ada PO berjalan'];
    if (po.count && qtyShort(po.remaining)) {
      facts.push('sisa kuota ' + qtyShort(po.remaining));
    }
    if (p.slots.count) {
      facts.push(p.slots.count + ' surat jalan siap');
    }
    html +=
      '<div class="dash-flow-foot"><span class="dash-flow-facts">' +
      esc(facts.join(' · ')) +
      (f.alerts
        ? ' <button type="button" class="dash-funnel-alert" data-dash-open="Perubahan Timbangan">' +
          f.alerts +
          ' perubahan timbangan</button>'
        : '') +
      '</span><button type="button" class="link-btn" data-dash-open="PO Pengambilan">PO Pengambilan</button></div>';
    return html;
  }

  function orderPanel(side, per) {
    var f = orderFunnel(side, per);
    var none =
      side === 'sales'
        ? 'Tidak ada pesanan penjualan gudang pada periode ini.'
        : 'Tidak ada pesanan pembelian gudang pada periode ini.';
    // Only drafts so far: no funnel yet, just the draft note below.
    var html = f.stages[0].count
      ? funnels([f], false)
      : _dashEmpty(f.total ? 'Belum ada pesanan yang dikonfirmasi.' : none);
    if (f.draft.count) {
      html +=
        '<div class="dash-flow-notes"><button type="button" class="dash-funnel-note"' +
        targetAttrs(f.draft) +
        '>' +
        esc(f.draft.count + ' draf · ' + short(f.draft.value) + ' belum dikonfirmasi') +
        '</button></div>';
    }
    return html;
  }

  function flowCard(per) {
    if (!can('sales') && !can('purchases')) {
      return '';
    }
    var tabs = flowTabs();
    var active = tabs.some(function (t) {
      return t.key === chosenTab;
    })
      ? chosenTab
      : tabs.length
        ? tabs[0].key
        : null;
    var tablist =
      tabs.length > 1
        ? '<div class="seg-tabs seg-tabs-sm dash-flow-tabs" role="tablist" aria-label="Alur transaksi">' +
          tabs
            .map(function (t) {
              var on = t.key === active;
              return (
                '<button type="button" class="seg-tab' +
                (on ? ' active' : '') +
                '" role="tab" id="dash-flow-tab-' +
                t.key +
                '" aria-controls="dash-flow-' +
                t.key +
                '" aria-selected="' +
                on +
                '" data-action="dashFlowTab" data-val="' +
                t.key +
                '">' +
                esc(t.label) +
                '</button>'
              );
            })
            .join('') +
          '</div>'
        : '';
    var sub = tabs.length === 1 ? tabs[0].label + ' · nilai termasuk PPN' : 'Nilai termasuk PPN';
    var head =
      '<div class="card-head"><div><div class="card-title">Alur transaksi</div><div class="card-sub">' +
      esc(sub) +
      '</div></div>' +
      tablist +
      '</div>';
    if (!tabs.length) {
      return (
        '<div class="card dash-flow"><div class="dash-flow-body">' +
        head +
        _dashEmpty('Belum ada pesanan atau pengambilan.') +
        '</div></div>'
      );
    }
    var panels = tabs
      .map(function (t) {
        var body = t.key === 'pickup' ? pickupPanel(per) : orderPanel(t.key, per);
        return (
          '<div class="dash-flow-panel" id="dash-flow-' +
          t.key +
          '" data-flow-panel="' +
          t.key +
          '"' +
          (tabs.length > 1 ? ' role="tabpanel" aria-labelledby="dash-flow-tab-' + t.key + '"' : '') +
          (t.key === active ? '' : ' hidden') +
          '>' +
          body +
          '</div>'
        );
      })
      .join('');
    return '<div class="card dash-flow"><div class="dash-flow-body">' + head + panels + '</div></div>';
  }

  // Switch tabs in place (no re-render); remembered for this session.
  function showTab(key, root) {
    chosenTab = key;
    var card = (root && root.closest && root.closest('.dash-flow')) || document.querySelector('.dash-flow');
    if (!card) {
      return;
    }
    card.querySelectorAll('[data-action="dashFlowTab"]').forEach(function (b) {
      var on = b.getAttribute('data-val') === key;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    card.querySelectorAll('[data-flow-panel]').forEach(function (p) {
      p.hidden = p.getAttribute('data-flow-panel') !== key;
    });
  }

  // ── Tren 6 bulan ───────────────────────────────────────────────────────────
  function tonnage() {
    return S().monthlyTonnage(6, { asOf: today() });
  }
  function tonAvailable() {
    return can('purchases') && hasData() && tonnage().hasData;
  }
  function trendMode() {
    var v = null;
    try {
      v = localStorage.getItem(TREND_KEY);
    } catch (_) {
      /* storage unavailable */
    }
    return v === 'ton' && tonAvailable() ? 'ton' : 'rp';
  }
  function setTrendMode(mode) {
    try {
      localStorage.setItem(TREND_KEY, mode === 'ton' ? 'ton' : 'rp');
    } catch (_) {
      /* storage unavailable */
    }
  }
  function trendCard() {
    var ton = tonAvailable();
    var mode = trendMode();
    var switcher = ton
      ? '<div class="seg-tabs seg-tabs-sm" role="group" aria-label="Satuan grafik">' +
        [
          ['rp', 'Rp'],
          ['ton', 'Ton'],
        ]
          .map(function (o) {
            var on = o[0] === mode;
            return (
              '<button type="button" class="seg-tab' +
              (on ? ' active' : '') +
              '" aria-pressed="' +
              on +
              '" data-action="dashTrendMode" data-val="' +
              o[0] +
              '">' +
              o[1] +
              '</button>'
            );
          })
          .join('') +
        '</div>'
      : '';
    var sub;
    var legend;
    var body;
    if (mode === 'ton') {
      var unit = tonnage().unit || '';
      sub = 'Netto timbangan pengambilan' + (unit ? ' (' + unit + ')' : '');
      legend =
        '<div class="chart-legend"><span><i class="is-ton"></i>Netto' +
        (unit ? ' ' + esc(unit) : '') +
        '</span><button type="button" class="link-btn" data-action="dashTonnagePO">Detail</button></div>';
      body =
        '<div class="chart-wrap"><canvas id="dashTrendChart" data-mode="ton" role="img" aria-label="Grafik tonase pengambilan enam bulan terakhir"></canvas></div>';
    } else {
      var six = _dashMonthly(6);
      var any = six.keys.some(function (k) {
        return six.data[k].revenue || six.data[k].purchases;
      });
      sub = 'Penjualan dan pembelian dari jurnal';
      legend = any
        ? '<div class="chart-legend"><span><i class="is-sales"></i>Penjualan</span><span><i class="is-purchases"></i>Pembelian</span></div>'
        : '';
      body = any
        ? '<div class="chart-wrap"><canvas id="dashTrendChart" data-mode="rp" role="img" aria-label="Grafik penjualan dan pembelian enam bulan terakhir"></canvas></div>'
        : _dashEmpty('Belum ada penjualan atau pembelian yang diposting dalam 6 bulan terakhir.');
    }
    return (
      '<div class="card dash-trend"><div class="card-head"><div><div class="card-title">Tren 6 bulan</div>' +
      '<div class="card-sub">' +
      esc(sub) +
      '</div></div>' +
      switcher +
      '</div>' +
      legend +
      body +
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

  // Netto per customer, per customer PO and per supplier PO, last 3 months.
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
    // rows: { title, sub, doc, unit, values, trend }
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
              '<tr><td>' +
              (r.doc
                ? '<span class="doc-no">' + esc(r.title || '—') + '</span>'
                : esc(r.title || '—')) +
              (r.sub ? '<div class="dash-list-sub">' + esc(r.sub) + '</div>' : '') +
              '</td>' +
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
      'Tonase per bulan',
      '<p class="form-hint dash-modal-hint">' +
        esc('Netto timbangan per bulan. Tren: bulan ini dibanding ' + basePeriod(m) + '.') +
        '</p>' +
        (m.hasData
          ? table(
              'Per pelanggan',
              m.customers.map(function (r) {
                return Object.assign({}, r, { title: r.name });
              }),
              'Pelanggan'
            ) +
            table(
              'Per PO pelanggan',
              m.salesOrders.map(function (r) {
                return Object.assign({}, r, { title: r.number, sub: r.customer, doc: true });
              }),
              'PO pelanggan'
            ) +
            table(
              'Per PO supplier',
              m.purchaseOrders.map(function (r) {
                return Object.assign({}, r, {
                  title: r.number,
                  sub: r.supplier + (r.customer ? ' → ' + r.customer : ''),
                  doc: true,
                });
              }),
              'PO supplier'
            )
          : _dashEmpty('Belum ada pengambilan dalam 3 bulan terakhir.')),
      '<button class="btn-ghost" data-action="closeModal">Tutup</button>',
      true
    );
  }

  // ── Optional pickup blocks ─────────────────────────────────────────────────
  // show(id) tells whether a block is switched on in "Atur Tampilan".
  function extras(show) {
    if (!S()) {
      return '';
    }
    var asOf = today();
    var data = hasData();
    var buy = can('purchases');
    var html = '';
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
    period: period,
    periodKey: periodKey,
    setPeriod: setPeriod,
    rangeLabel: rangeLabel,
    periodSwitch: periodSwitch,
    pickupFlow: pickupFlow,
    orderFlow: orderFlow,
    orderFunnel: orderFunnel,
    flowTabs: flowTabs,
    flowCard: flowCard,
    showTab: showTab,
    tonnage: tonnage,
    trendMode: trendMode,
    setTrendMode: setTrendMode,
    trendCard: trendCard,
    extras: extras,
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
  var per = _dashTrading.period();

  // KPI tiles: one figure and at most one short line each.
  var cash = _dashCash();
  var ar = _dashBalances('sales');
  var ap = _dashBalances('purchases');
  var months = _dashMonthly(per.months);
  var revenue = 0;
  var cogs = 0;
  months.keys.forEach(function (k) {
    revenue += months.data[k].revenue;
    cogs += months.data[k].cogs;
  });

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
  var openSub = function (b, none) {
    return b.overdue > 0.5
      ? { sub: short(b.overdue) + ' lewat jatuh tempo', tone: 'danger' }
      : { sub: b.count ? 'Belum ada yang lewat jatuh tempo' : none, tone: '' };
  };
  var arSub = openSub(ar, 'Tidak ada piutang terbuka');
  var apSub = openSub(ap, 'Tidak ada hutang terbuka');

  var tiles = [
    tile({
      label: 'Kas & bank',
      value: money(cash.total),
      sub: cash.accounts.length ? cash.accounts.length + ' rekening' : 'Belum ada saldo kas atau bank',
      open: 'Riwayat Kas & Bank',
    }),
    tile({
      label: 'Piutang',
      value: money(ar.total),
      sub: arSub.sub,
      tone: arSub.tone,
      open: 'Faktur Penjualan',
    }),
    tile({
      label: 'Hutang',
      value: money(ap.total),
      sub: apSub.sub,
      tone: apSub.tone,
      open: 'Faktur Pembelian',
    }),
    tile({
      label: 'Laba kotor ' + per.tile,
      value: money(revenue - cogs),
      sub: 'Penjualan ' + short(revenue),
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

  // Alur transaksi
  var flow = show('pipeline') ? _dashTrading.flowCard(per) : '';

  // Needs action: grouped by flow in the sidebar's order, every row the same
  // shape — what to do, the detail, how many — most important first in a flow.
  var actions = '';
  if (show('actions')) {
    var rows = _dashActions();
    var row = function (r) {
      return (
        '<button type="button" class="dash-act-row" data-dash-open="' +
        escapeHtml(r.open) +
        '"><span class="dash-act-main"><span class="dash-act-title">' +
        escapeHtml(r.title || r.label) +
        '</span><span class="dash-act-sub">' +
        escapeHtml(r.hint) +
        '</span></span><span class="dash-act-count' +
        (r.urgent ? ' is-urgent' : '') +
        '">' +
        r.count +
        (r.unit ? ' ' + escapeHtml(r.unit) : '') +
        '</span><svg class="dash-act-go" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg></button>'
      );
    };
    var groups = _DASH_FLOWS.map(function (f) {
      var list = rows.filter(function (r) {
        return (r.flow || 'other') === f.key;
      });
      return list.length
        ? '<div class="dash-act-group"><div class="dash-act-head"><span class="dash-act-ico">' +
            _dashFlowIcon(f.icon) +
            '</span>' +
            escapeHtml(f.title) +
            '</div>' +
            list.map(row).join('') +
            '</div>'
        : '';
    });
    actions = _dashCard(
      'Perlu tindakan',
      'Dokumen yang menunggu langkah berikutnya',
      rows.length
        ? '<div class="dash-act-body">' + groups.join('') + '</div>'
        : _dashEmpty('Tidak ada dokumen yang menunggu tindakan.')
    );
  }

  // Trend
  var trend = show('trend') ? _dashTrading.trendCard() : '';

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

  var split = [actions, trend].filter(Boolean);
  var rowB = [due, stock, activity].filter(Boolean);
  var dateLabel = now.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    '<div class="sec-hdr dash-hdr"><div><h1>Ringkasan</h1><p>' +
    escapeHtml(dateLabel + ' · periode ' + _dashTrading.rangeLabel(per)) +
    '</p></div>' +
    '<div class="dash-hdr-tools">' +
    _dashTrading.periodSwitch(per) +
    '<button type="button" class="btn-ghost btn-sm" data-action="dashLayout">Atur Tampilan</button></div></div>' +
    prep +
    '<div class="dash-kpis">' +
    tiles +
    '</div>' +
    flow +
    (split.length ? '<div class="dash-row dash-row-split">' + split.join('') + '</div>' : '') +
    _dashTrading.extras(show) +
    (rowB.length ? '<div class="dash-row dash-row-b">' + rowB.join('') + '</div>' : '')
  );
}

// ── Interactions ─────────────────────────────────────────────────────────────
// Tiles, list rows, stages and links carry the sidebar entry they open.
document.addEventListener('click', function (e) {
  var el = e.target && e.target.closest ? e.target.closest('[data-dash-open]') : null;
  if (!el) {
    return;
  }
  e.preventDefault();
  var label = el.getAttribute('data-dash-open');
  if (window.NSANav) {
    window.NSANav.open(label);
  } else if (window.NSAMenu && typeof window.NSAMenu.handle === 'function') {
    window.NSAMenu.handle(null, label);
  }
});

(function _registerDashActions() {
  function _reg() {
    ERP.registerAction('dashLayout', function () {
      var hidden = _dashHidden();
      var opt = function (b) {
        return (
          '<label class="dash-opt"><input type="checkbox" class="dash-opt-input" value="' +
          b.id +
          '"' +
          (hidden.indexOf(b.id) === -1 ? ' checked' : '') +
          '><span>' +
          escapeHtml(b.label) +
          '</span></label>'
        );
      };
      var body =
        '<p class="form-hint dash-modal-hint">Pilih bagian yang ditampilkan. Pilihan tersimpan di browser ini.</p>' +
        DASH_BLOCKS.filter(function (b) {
          return b.on;
        })
          .map(opt)
          .join('') +
        '<h4 class="dash-modal-sub">Bagian tambahan</h4>' +
        DASH_BLOCKS.filter(function (b) {
          return !b.on;
        })
          .map(opt)
          .join('');
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

    ERP.registerAction('dashPeriod', function (_id, _type, val) {
      if (_dashTrading.setPeriod(val)) {
        _refreshDashboard();
      }
      return true;
    });

    ERP.registerAction('dashFlowTab', function (_id, _type, val, e) {
      _dashTrading.showTab(val, e && e.target);
      return true;
    });

    // A stage of the warehouse flow: the order list filtered to that stage
    // when the list offers it, otherwise the order list itself.
    ERP.registerAction('dashOrderStage', function (_id, side, key) {
      if (typeof window.openOrderStage === 'function') {
        window.openOrderStage(side, key);
      } else if (window.NSANav) {
        window.NSANav.open(side === 'sales' ? 'Pesanan Penjualan' : 'Pesanan Pembelian');
      } else if (typeof window.navigate === 'function') {
        window.navigate(side === 'sales' ? 'sales' : 'purchase');
      }
      return true;
    });

    ERP.registerAction('dashTrendMode', function (_id, _type, val) {
      _dashTrading.setTrendMode(val);
      _refreshDashboard();
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
