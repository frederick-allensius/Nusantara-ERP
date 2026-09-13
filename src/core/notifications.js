// Notification scheduler: overdue receivables/payables, low stock and budget alerts.
// Uses the Notification API + SW postMessage for OS notifications.
// Exposes window.NSANotif for the nav.js panel.
//
// Receivable/payable figures come from window.Balances (balances.js), so alerts
// show the same open items and amounts as invoices, aging and the dashboard.

const CHECK_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
const ICON = '/icon-192.png';
const LOW_STOCK_DETAIL_LIMIT = 5; // more low-stock items than this collapse into one alert

let _alerts = [];
let _unreadCount = 0;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function idr(v) {
  return 'Rp ' + Math.round(v || 0).toLocaleString('id-ID');
}

function updateBadge() {
  const dot = document.querySelector('.notif-dot');
  if (!dot) {
    return;
  }
  if (_unreadCount > 0) {
    dot.textContent = _unreadCount > 9 ? '9+' : String(_unreadCount);
    dot.style.display = 'flex';
  } else {
    dot.textContent = '';
    dot.style.display = 'none';
  }
}

async function sendOSNotification(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SHOW_NOTIFICATION',
        title,
        body,
        tag,
        icon: ICON,
      });
    } else {
      new Notification(title, { body, tag, icon: ICON });
    }
  } catch (_) {
    /* ignore */
  }
}

export function getAlerts() {
  return _alerts;
}

export function getUnreadCount() {
  return _unreadCount;
}

export function markAllRead() {
  _unreadCount = 0;
  updateBadge();
}

function balanceAlerts(now) {
  const B = window.Balances;
  if (!B) {
    return [];
  }
  const out = [];
  const ar = B.summary('sales', { asOf: now });
  if (ar.overdueCount > 0) {
    out.push({
      id: 'overdue-receivables',
      type: 'warning',
      // icon keys map to the SVG set in nav.js (_renderNotifPanel)
      icon: 'receivable',
      title: 'Piutang lewat jatuh tempo',
      body: `${ar.overdueCount} dokumen · Total ${idr(ar.overdue)}`,
      // "menu:<label>" opens that sidebar entry (ui/nav.js NSANav.open)
      link: 'menu:Faktur Penjualan',
      ts: now,
      count: ar.overdueCount,
    });
  }
  const ap = B.summary('purchases', { asOf: now });
  if (ap.overdueCount > 0) {
    out.push({
      id: 'overdue-payables',
      type: 'danger',
      icon: 'payable',
      title: 'Hutang lewat jatuh tempo',
      body: `${ap.overdueCount} dokumen · Total ${idr(ap.overdue)}`,
      link: 'menu:Faktur Pembelian',
      ts: now,
      count: ap.overdueCount,
    });
  }
  if (ap.dueSoon > 0) {
    const soonCount = ap.items.filter(
      it => !it.overdue && it.dueDate && it.dueDate <= B.addDays(now, 7)
    ).length;
    out.push({
      id: 'payables-due-soon',
      type: 'info',
      icon: 'payable',
      title: 'Hutang jatuh tempo 7 hari ke depan',
      body: `${soonCount} dokumen · Total ${idr(ap.dueSoon)}`,
      link: 'menu:Faktur Pembelian',
      ts: now,
      count: soonCount,
    });
  }
  return out;
}

function lowStockAlerts(DB, now) {
  const low = (DB.inventoryItems || []).filter(item => {
    const min = Number(item.min != null ? item.min : item.minStock) || 0;
    return min > 0 && (Number(item.stock) || 0) <= min;
  });
  if (low.length === 0) {
    return [];
  }
  if (low.length > LOW_STOCK_DETAIL_LIMIT) {
    return [
      {
        id: 'lowstock-summary',
        type: 'info',
        icon: 'stock',
        title: 'Stok menipis',
        body: `${low.length} barang berada di bawah stok minimum`,
        link: 'menu:Barang & Stok',
        ts: now,
        count: low.length,
      },
    ];
  }
  return low.map(item => {
    const min = Number(item.min != null ? item.min : item.minStock) || 0;
    return {
      id: 'lowstock-' + item.id,
      type: 'info',
      icon: 'stock',
      title: 'Stok menipis',
      body: `${item.name || item.id} — stok ${Number(item.stock) || 0} ${item.unit || ''} (minimum ${min})`,
      link: 'menu:Barang & Stok',
      ts: now,
    };
  });
}

function budgetAlerts(DB, now) {
  const budgets = DB.budgets || [];
  const journals = DB.journals || [];
  let exceededCount = 0;
  let exceededTotal = 0;
  budgets.forEach(b => {
    if (!b.amount || b.amount <= 0) {
      return;
    }
    let actual = 0;
    journals.forEach(j => {
      if (!j.date || j.date.substring(0, 7) !== b.period) {
        return;
      }
      (j.lines || []).forEach(l => {
        if ((l.accountNo || '') === b.accountCode) {
          actual += (Number(l.debit) || 0) - (Number(l.credit) || 0);
        }
      });
    });
    if (Math.abs(actual) > b.amount) {
      exceededCount++;
      exceededTotal += Math.abs(actual) - b.amount;
    }
  });
  if (exceededCount === 0) {
    return [];
  }
  return [
    {
      id: 'budget-exceeded-summary',
      type: 'warning',
      icon: 'budget',
      title: 'Anggaran terlampaui',
      body: `${exceededCount} akun melebihi anggaran · Lebih ${idr(exceededTotal)}`,
      link: 'menu:Realisasi Anggaran',
      ts: now,
      count: exceededCount,
    },
  ];
}

export function checkAlerts() {
  const DB = window.DB;
  if (!DB) {
    return [];
  }
  const now = today();
  const next = [...balanceAlerts(now), ...lowStockAlerts(DB, now), ...budgetAlerts(DB, now)];

  const prevIds = new Set(_alerts.map(a => a.id));
  const added = next.filter(a => !prevIds.has(a.id));
  _alerts = next;
  _unreadCount = next.length;
  updateBadge();

  if (added.length > 0) {
    const summary = next.map(a => (a.count ? `${a.count} ${a.title.toLowerCase()}` : a.title));
    sendOSNotification('Nusantara ERP — Perlu perhatian', summary.join(' · '), 'nsa-alert-' + now);
  }
  return _alerts;
}

export async function requestPermission() {
  if (!('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission !== 'default') {
    return Notification.permission;
  }
  return Notification.requestPermission();
}

export function initNotifications() {
  // First check after DB settles
  setTimeout(checkAlerts, 3000);
  setInterval(checkAlerts, CHECK_INTERVAL);

  window.NSANotif = { getAlerts, checkAlerts, getUnreadCount, markAllRead, requestPermission };
}
