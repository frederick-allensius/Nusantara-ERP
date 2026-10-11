// ═══════════════════════════════════════════════════════════════════════════════
// Demo dataset — first run (local mode or an empty cloud database) and "Reset Data".
//
// Generated relative to today, so the dashboard, aging and reports always show
// recent activity; deterministic, so every load has the same shape. The data
// follows the rules the application enforces:
//   • statuses come from the document registry; invoices are drawn from delivered
//     sales orders and received purchase orders; receipts and payments settle them
//   • stock moves only through goods receipts, deliveries, returns, adjustments and
//     transfers; orders take only stock that is still free, so none goes negative
//   • an item is reordered from its supplier when its stock reaches the reorder level
//   • purchase prices equal item cost, so the ledger's inventory matches stock value
//   • one opening journal carries opening cash, bank and inventory against equity
// The main business is trading (public/classic/core/trading.js): a customer PO is
// matched by a supplier PO for the same goods, the customer's trucks pick them up at
// the supplier, each truck is a weighed trip on one of the PO's surat jalan, customers
// are invoiced weekly from their trips and suppliers bill per month. Stone and slag
// are traded this way; sand and batu belah are stocked in the warehouses.
// The product family follows the demo items the application already used (bulk
// materials in Ton/M3). The real product range REQUIRES USER CONFIRMATION
// (docs/08-TEMUAN-TEKNIS.md §E). All names are fictional.
// ═══════════════════════════════════════════════════════════════════════════════

const PPN = 0.11;
const WH_MAIN = 'WH-DEFAULT';
const WH_BKS = 'WH-002';
const CREATED_BY = 'Admin';

const WAREHOUSES = [
  { id: WH_MAIN, name: 'Gudang Utama', location: 'Cakung, Jakarta Timur', active: true },
  { id: WH_BKS, name: 'Gudang Bekasi', location: 'Tambun, Bekasi', active: true },
];

const BANK_ACCOUNTS = [
  {
    id: 'BA000',
    name: 'Kas Kantor',
    bank: 'Tunai',
    accountNumber: '-',
    currency: 'IDR',
    glAccountNo: '110101',
  },
  {
    id: 'BA001',
    name: 'BCA - Rekening Utama',
    bank: 'BCA',
    accountNumber: '***-***-4521',
    currency: 'IDR',
    glAccountNo: '110102',
  },
  {
    id: 'BA002',
    name: 'Mandiri - Operasional',
    bank: 'Mandiri',
    accountNumber: '***-***-7788',
    currency: 'IDR',
    glAccountNo: '110103',
  },
];

// Stocked items (`wh`): when an item's free stock plus open supplier orders falls to
// `reorder`, its supplier is sent an order that tops it up to `target` (also the
// opening stock). `min` is the alert level the application shows.
// Traded items (`source` = their supplier): the customer's trucks pick them up at the
// supplier, so they never enter a warehouse — no stock and no alert level.
const ITEMS = [
  {
    id: '1',
    code: 'BS-12',
    name: 'Batu Split 1-2 cm',
    category: 'Batu',
    unit: 'Ton',
    cost: 118000,
    sell: 155000,
    min: 0,
    source: '1',
  },
  {
    id: '2',
    code: 'BS-23',
    name: 'Batu Split 2-3 cm',
    category: 'Batu',
    unit: 'Ton',
    cost: 112000,
    sell: 148000,
    min: 0,
    source: '1',
  },
  {
    id: '3',
    code: 'AB-05',
    name: 'Abu Batu 0-5 mm',
    category: 'Batu',
    unit: 'Ton',
    cost: 72000,
    sell: 98000,
    min: 0,
    source: '1',
  },
  {
    id: '4',
    code: 'AS-1020',
    name: 'Agregat Slag 10-20 mm',
    category: 'Agregat',
    unit: 'Ton',
    cost: 50000,
    sell: 67000,
    min: 0,
    source: '2',
  },
  {
    id: '5',
    code: 'AS-2030',
    name: 'Agregat Slag 20-30 mm',
    category: 'Agregat',
    unit: 'Ton',
    cost: 53000,
    sell: 69000,
    min: 0,
    source: '2',
  },
  {
    id: '6',
    code: 'PS-BT',
    name: 'Pasir Beton',
    category: 'Pasir',
    unit: 'M3',
    cost: 185000,
    sell: 245000,
    min: 30,
    reorder: 65,
    target: 170,
    wh: WH_BKS,
    supplier: '3',
  },
  {
    id: '7',
    code: 'PS-UR',
    name: 'Pasir Urug',
    category: 'Pasir',
    unit: 'M3',
    cost: 95000,
    sell: 130000,
    min: 30,
    reorder: 60,
    target: 150,
    wh: WH_BKS,
    supplier: '3',
  },
  {
    id: '8',
    code: 'SR-01',
    name: 'Sirtu',
    category: 'Pasir',
    unit: 'M3',
    cost: 88000,
    sell: 120000,
    min: 30,
    reorder: 60,
    target: 150,
    wh: WH_BKS,
    supplier: '4',
  },
  {
    id: '9',
    code: 'BB-01',
    name: 'Batu Belah',
    category: 'Batu',
    unit: 'M3',
    cost: 165000,
    sell: 215000,
    min: 50,
    reorder: 100,
    target: 250,
    wh: WH_MAIN,
    supplier: '5',
  },
];

// The warehouse an order ships from and the items it draws on.
const SALES_GROUPS = [
  { wh: WH_MAIN, items: ['9'] },
  { wh: WH_BKS, items: ['6', '7', '8', '9'] },
];
const STOCKED = ITEMS.filter(i => i.wh);

const CUSTOMERS = [
  {
    id: '1',
    name: 'PT Arta Konstruksi Pratama',
    contact: 'Hendra Wibowo',
    phone: '021-4401-2231',
    email: 'purchasing@artakonstruksi.example',
    address: 'Jakarta Utara',
    npwp: '',
    termDays: 30,
  },
  {
    id: '2',
    name: 'CV Mitra Bangun Sejahtera',
    contact: 'Rudi Hartono',
    phone: '021-8837-1022',
    email: 'order@mitrabangun.example',
    address: 'Bekasi',
    npwp: '',
    termDays: 30,
  },
  {
    id: '3',
    name: 'PT Graha Beton Nusantara',
    contact: 'Lina Marlina',
    phone: '0251-835-4410',
    email: 'logistik@grahabeton.example',
    address: 'Bogor',
    npwp: '',
    termDays: 45,
  },
  {
    id: '4',
    name: 'Toko Bangunan Sumber Rezeki',
    contact: 'Haji Sulaiman',
    phone: '0812-9021-3344',
    email: 'sumberrezeki@example.com',
    address: 'Depok',
    npwp: '',
    termDays: 14,
  },
  {
    id: '5',
    name: 'PT Cipta Infrastruktur Utama',
    contact: 'Dewi Anggraini',
    phone: '021-5579-8800',
    email: 'procurement@ciptainfra.example',
    address: 'Tangerang',
    npwp: '',
    termDays: 60,
  },
  {
    id: '6',
    name: 'CV Karya Persada',
    contact: 'Yusuf Maulana',
    phone: '0267-841-2290',
    email: 'admin@karyapersada.example',
    address: 'Karawang',
    npwp: '',
    termDays: 30,
  },
  {
    id: '7',
    name: 'UD Sinar Makmur Abadi',
    contact: 'Teguh Prasetyo',
    phone: '0813-1188-7702',
    email: 'sinarmakmur@example.com',
    address: 'Cikarang',
    npwp: '',
    termDays: 14,
  },
  {
    id: '8',
    name: 'PT Hunian Asri Properti',
    contact: 'Maya Kartika',
    phone: '021-7280-6655',
    email: 'project@hunianasri.example',
    address: 'Jakarta Selatan',
    npwp: '',
    termDays: 45,
  },
];
// How each customer settles invoices and where the money arrives.
const PAYS = { 4: 'late', 5: 'installments' };
const CUSTOMER_METHOD = {
  1: 'Transfer BCA',
  2: 'Transfer Mandiri',
  3: 'Transfer BCA',
  4: 'Tunai',
  5: 'Transfer BCA',
  6: 'Transfer Mandiri',
  7: 'Transfer BCA',
  8: 'Transfer BCA',
};
const CUSTOMER_WEIGHT = { 1: 3, 2: 2, 3: 2, 4: 2, 5: 1, 6: 2, 7: 2, 8: 1 };

const SUPPLIERS = [
  {
    id: '1',
    name: 'PT Batu Alam Lestari',
    contact: 'Agus Salim',
    phone: '0251-864-3301',
    address: 'Rumpin, Bogor',
    npwp: '',
    termDays: 30,
  },
  {
    id: '2',
    name: 'PT Slagindo Daur Ulang',
    contact: 'Ferry Gunawan',
    phone: '0254-392-1180',
    address: 'Cilegon',
    npwp: '',
    termDays: 30,
  },
  {
    id: '3',
    name: 'CV Pasir Mas Sejahtera',
    contact: 'Ujang Sopandi',
    phone: '0263-261-4471',
    address: 'Cianjur',
    npwp: '',
    termDays: 14,
  },
  {
    id: '4',
    name: 'UD Sumber Galian',
    contact: 'Asep Ruhiat',
    phone: '0266-221-9087',
    address: 'Sukabumi',
    npwp: '',
    termDays: 14,
  },
  {
    id: '5',
    name: 'CV Batu Belah Purwakarta',
    contact: 'Iwan Setiadi',
    phone: '0264-820-5532',
    address: 'Purwakarta',
    npwp: '',
    termDays: 30,
  },
];
const SUPPLIER_METHOD = {
  1: 'Transfer BCA',
  2: 'Transfer BCA',
  3: 'Transfer Mandiri',
  4: 'Transfer BCA',
  5: 'Transfer BCA',
};

// Drivers and plates of the company's trucks (delivery orders use them).
const FLEET = [
  ['Budi Santoso', 'B 9127 KDA'],
  ['Slamet Riyadi', 'B 9346 TRX'],
  ['Agus Setiawan', 'F 8812 QA'],
];

// ── Trading (pickups) ───────────────────────────────────────────────────────────
// Truck capacity per surat jalan (trading.js default): a supplier PO gets
// ceil(qty / 35) surat jalan when it is opened.
const TRUCK = 35;
// Weighbridge ticket and invoice prefixes of the trading suppliers.
const SUPPLIER_CODE = { 1: 'BAL', 2: 'SDU' };

// The customers' own trucks that pick up at the supplier: [driver, plate].
const PICKUP_TRUCKS = {
  1: [
    ['Darmawan', 'B 9512 UQA'],
    ['Sutrisno', 'B 9873 UQA'],
    ['Joko Susilo', 'B 9140 UQB'],
    ['Rahmat Hidayat', 'B 9661 UQB'],
  ],
  2: [
    ['Wawan Gunawan', 'B 9327 FBE'],
    ['Ade Kurnia', 'B 9058 FBE'],
    ['Ujang Rahmat', 'B 9714 FBF'],
  ],
  3: [
    ['Dadang Supriatna', 'F 8235 FD'],
    ['Yayan Sopyan', 'F 8462 FD'],
    ['Cecep Hermawan', 'F 8807 FE'],
    ['Iwan Kurniadi', 'F 8139 FE'],
  ],
  5: [
    ['Heru Santoso', 'B 9908 CYX'],
    ['Rudi Setiadi', 'B 9346 CYX'],
    ['Mulyadi', 'B 9583 CYZ'],
  ],
  6: [
    ['Nana Suryana', 'T 8721 DA'],
    ['Engkos Kosasih', 'T 8164 DA'],
    ['Asep Saepudin', 'T 8390 DB'],
  ],
  8: [
    ['Bambang Irawan', 'B 9215 TJK'],
    ['Supriyadi', 'B 9467 TJK'],
    ['Hendro Wahyudi', 'B 9032 TJL'],
  ],
};

// Customer POs per month (key: months ago; 0 = the current month). Each one is matched
// by a supplier PO for the same tonnage on the same day. `day` < 0 counts back from
// the month end. Trucks come on weekdays (and today, when that is one): 2–3 a day on
// most days, or exactly `every` a day; `load` is the netto range per truck (default
// 33.6–38.4 t).
//   cut         opened late in the month: closed at the cut-off with tonnage left, a
//               follow-up PO on the 1st of next month covers the rest
//   forceFirst  trucks on the first weekday (another customer takes the same item)
//   destChange  that trip (1-based) goes to another destination
//   alert       a trip invoiced at 30 t that a later weighbridge recap changed to 35 t
const TRADE_PLAN = {
  3: [
    { c: '1', i: '1', qty: 500, day: 2 },
    { c: '3', i: '2', qty: 350, day: 6 },
    { c: '5', i: '4', qty: 420, day: 9 },
    { c: '8', i: '1', qty: 300, day: 14 },
  ],
  2: [
    { c: '2', i: '3', qty: 280, day: 3 },
    { c: '6', i: '1', qty: 250, day: 6, load: [37.6, 39.4] },
    { c: '1', i: '2', qty: 450, day: 8 },
    { c: '5', i: '5', qty: 350, day: 13 },
    { c: '3', i: '1', qty: 700, day: -8, every: 2, cut: true },
  ],
  1: [
    { c: '8', i: '4', qty: 350, day: 4 },
    { c: '1', i: '1', qty: 700, day: 9, every: 2 },
    { c: '6', i: '1', qty: 420, day: 10, forceFirst: true, destChange: 2 },
    { c: '2', i: '2', qty: 300, day: 16 },
    { c: '5', i: '1', qty: 700, day: -8, every: 2, cut: true },
  ],
  0: [
    { c: '3', i: '1', qty: 700, day: 1, alert: true },
    { c: '8', i: '2', qty: 420, day: 8 },
    { c: '6', i: '4', qty: 350, day: 15 },
    { c: '1', i: '3', qty: 280, day: 22 },
    { c: '2', i: '5', qty: 560, day: -8, every: 2, cut: true },
  ],
};
// The supplier announces a new price mid-month (Harga Supplier); trips from that
// date carry it, including those of a PO opened before at the old price.
const PRICE_CHANGE = { ago: 1, day: 15, supplier: '1', item: '1', price: 124000 };
const DEST_CHANGE = 'Proyek Gudang Telukjambe, Karawang';

// Office expenses paid from petty cash (Kas Kantor): [day, category, payee, lo, hi]
// in Rp 50.000 steps. Kas is topped up from BCA on the 1st by last month's spending.
const PETTY = [
  [4, 'ATK', 'Kertas, tinta printer & map arsip', 8, 24],
  [8, 'Transport', 'Tol & parkir kunjungan ke quarry', 6, 14],
  [17, 'Entertain', 'Jamuan makan pelanggan proyek', 16, 50],
  [22, 'Transport', 'Bensin kendaraan operasional kantor', 8, 16],
];

const EXPEDITION = [
  { id: 'EXP-001', name: 'CV Angkutan Sinar Jaya', area: 'Jabodetabek', rate: 'Rp 650.000/rit' },
  { id: 'EXP-002', name: 'PT Lintas Muatan Utama', area: 'Jawa Barat', rate: 'Rp 1.250.000/rit' },
  { id: 'EXP-003', name: 'UD Armada Tiga Saudara', area: 'Banten', rate: 'Rp 950.000/rit' },
];

// Salaries are paid through payroll every month (budget-gl-extras.js).
const EMPLOYEES = [
  {
    id: 'EMP-001',
    name: 'Andi Wijaya',
    position: 'Sales Manager',
    department: 'Penjualan',
    phone: '0812-1000-001',
    email: 'andi@nusantara.local',
    joinDate: '2023-01-15',
    salary: 9000000,
    status: 'Active',
  },
  {
    id: 'EMP-002',
    name: 'Budi Santoso',
    position: 'Driver',
    department: 'Pengiriman',
    phone: '0812-1000-002',
    email: 'budi@nusantara.local',
    joinDate: '2023-03-01',
    salary: 5000000,
    status: 'Active',
  },
  {
    id: 'EMP-003',
    name: 'Citra Lestari',
    position: 'Admin Gudang',
    department: 'Gudang',
    phone: '0812-1000-003',
    email: 'citra@nusantara.local',
    joinDate: '2023-06-10',
    salary: 5500000,
    status: 'Active',
  },
  {
    id: 'EMP-004',
    name: 'Dedi Kurniawan',
    position: 'Staff Pembelian',
    department: 'Operasional',
    phone: '0812-1000-004',
    email: 'dedi@nusantara.local',
    joinDate: '2024-02-20',
    salary: 6000000,
    status: 'Active',
  },
  {
    id: 'EMP-005',
    name: 'Eka Putri',
    position: 'Akuntan',
    department: 'Keuangan',
    phone: '0812-1000-005',
    email: 'eka@nusantara.local',
    joinDate: '2024-08-05',
    salary: 7500000,
    status: 'Active',
  },
  {
    id: 'EMP-006',
    name: 'Fajar Nugroho',
    position: 'Staff Sales',
    department: 'Penjualan',
    phone: '0812-1000-006',
    email: 'fajar@nusantara.local',
    joinDate: '2025-01-12',
    salary: 4500000,
    status: 'Active',
  },
  {
    id: 'EMP-007',
    name: 'Slamet Riyadi',
    position: 'Driver',
    department: 'Pengiriman',
    phone: '0812-1000-007',
    email: 'slamet@nusantara.local',
    joinDate: '2025-04-07',
    salary: 5000000,
    status: 'Active',
  },
  {
    id: 'EMP-008',
    name: 'Agus Setiawan',
    position: 'Driver',
    department: 'Pengiriman',
    phone: '0812-1000-008',
    email: 'agus@nusantara.local',
    joinDate: '2025-09-01',
    salary: 5000000,
    status: 'Active',
  },
];

// The latest sales orders of the current month are still open, in date order.
const OPEN_ROLES = ['delivered', 'transit', 'dp', 'draft', 'draft', 'cancelled'];

// Order of events on the same day.
const STEP = {
  receive: 0,
  order: 1,
  transfer: 2,
  deliver: 3,
  return: 4,
  adjust: 5,
  treasury: 6,
  close: 7,
};

const pad = (n, w) => String(n).padStart(w, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
const minDate = (a, b) => (a < b ? a : b);
const maxDate = (a, b) => (a > b ? a : b);
const round3 = v => Math.round(v * 1000) / 1000;
const roundTo = (v, step) => Math.max(step, Math.round(v / step) * step);

function addDays(date, n) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
}
const weekday = date => new Date(`${date}T00:00:00`).getDay();
const isWorkday = date => weekday(date) >= 1 && weekday(date) <= 5;
const mondayOf = date => addDays(date, -((weekday(date) + 6) % 7));
function monthEndOf(date) {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00`);
  return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
// Customers are invoiced per week (Monday–Sunday), cut at the month end. The invoice
// is dated the Monday after, or the month end for the last part of a month.
function billingWeek(date) {
  const mon = mondayOf(date);
  const end = monthEndOf(date);
  const from = maxDate(mon, `${date.slice(0, 7)}-01`);
  const to = minDate(addDays(mon, 6), end);
  return { from, to, invoiceDate: to === end ? end : addDays(to, 1) };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDemoData(now = new Date()) {
  const rand = mulberry32(20260914);
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  // Separate streams for office expenses and the trading flow, so each part keeps its
  // shape when the other changes.
  const xrand = mulberry32(20260916);
  const xbetween = (lo, hi) => lo + Math.floor(xrand() * (hi - lo + 1));
  const trand = mulberry32(20260915);
  const tbetween = (lo, hi) => lo + Math.floor(trand() * (hi - lo + 1));
  const today = iso(now);
  const base = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthsAgo = date =>
    (base.getFullYear() - Number(date.slice(0, 4))) * 12 +
    base.getMonth() +
    1 -
    Number(date.slice(5, 7));
  const item = id => ITEMS.find(i => i.id === id);

  const out = {
    salesQuotations: [],
    salesOrders: [],
    purchaseOrders: [],
    deliveryOrders: [],
    goodsReceipts: [],
    salesInvoices: [],
    purchaseInvoices: [],
    salesReceipts: [],
    purchasePayments: [],
    salesReturns: [],
    salesDownPayments: [],
    itemAdjustments: [],
    itemTransfers: [],
    otherPayments: [],
    otherDeposits: [],
    bankTransfers: [],
    payrollRuns: [],
  };
  const reservations = {};
  const counters = {};
  const nextId = prefix => {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `${prefix}-${pad(counters[prefix], 4)}`;
  };

  // Stock per item per warehouse, and what open sales orders have committed from it.
  const stock = {};
  const committed = {};
  ITEMS.forEach(i => {
    stock[i.id] = { [WH_MAIN]: 0, [WH_BKS]: 0 };
    if (i.wh) {
      stock[i.id][i.wh] = i.target;
    }
    committed[i.id] = { [WH_MAIN]: 0, [WH_BKS]: 0 };
  });
  const move = (itemId, wh, qty) => {
    stock[itemId][wh] = round3(stock[itemId][wh] + qty);
  };
  const commit = (itemId, wh, qty) => {
    committed[itemId][wh] = round3(committed[itemId][wh] + qty);
  };
  const free = (itemId, wh) => round3(stock[itemId][wh] - committed[itemId][wh]);
  const freeInFives = (itemId, wh) => Math.floor(free(itemId, wh) / 5) * 5;

  // Supplier orders sent and not received yet, by supplier.
  const openOrders = {};
  const onOrder = itemId =>
    Object.values(openOrders).reduce(
      (s, po) => s + po.lines.reduce((t, l) => t + (l.itemId === itemId ? l.qty : 0), 0),
      0
    );
  const position = i => free(i.id, i.wh) + onOrder(i.id);

  const events = [];
  let seq = 0;
  const at = (date, step, run) => events.push({ date, step, seq: seq++, run });

  const line = (it, qty, price) => ({
    itemId: it.id,
    itemName: it.name,
    unit: it.unit,
    qty,
    price,
    lineDiscount: 0,
    subtotal: Math.round(qty * price),
  });
  const totals = lines => {
    const dpp = lines.reduce((s, l) => s + l.subtotal, 0);
    const tax = Math.round(dpp * PPN);
    return { tax, amount: dpp + tax };
  };
  const shuffle = list => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pickCustomer = () => {
    const pool = [];
    CUSTOMERS.forEach(c => {
      for (let k = 0; k < CUSTOMER_WEIGHT[c.id]; k++) {
        pool.push(c);
      }
    });
    return pool[Math.floor(rand() * pool.length)];
  };

  function deliveryOrder(so, date, status) {
    const [driver, vehicle] = FLEET[Math.floor(rand() * FLEET.length)];
    const cust = CUSTOMERS.find(c => c.id === so.customerId);
    return {
      id: nextId('DO'),
      number: '',
      soId: so.id,
      poId: null,
      customer: so.customer,
      customerId: so.customerId,
      supplierId: null,
      destination: cust ? cust.address : '',
      date,
      status,
      driver,
      vehicle,
      customerPO: '',
      notes: '',
      lines: so.lines.map(l => ({ ...l })),
    };
  }

  // ── Purchasing ─────────────────────────────────────────────────────────────
  let overduePayable = false;
  function receive(po, supplier, date) {
    delete openOrders[supplier.id];
    po.lines.forEach(l => move(l.itemId, po.warehouseId, l.qty));
    out.goodsReceipts.push({
      id: nextId('GR'),
      poId: po.id,
      supplierName: supplier.name,
      date,
      notes: '',
      warehouseId: po.warehouseId,
      items: po.lines.map(l => ({ itemId: l.itemId, itemName: l.itemName, qty: l.qty })),
      posted: true,
      createdAt: date,
    });
    po.status = 'Received';
    po.stockMutated = true;
    po.receivedAt = date;

    const invDate = addDays(date, 1);
    if (invDate > today) {
      return; // received, supplier invoice not in yet
    }
    const pi = {
      id: nextId('PI'),
      number: '',
      date: invDate,
      dueDate: addDays(invDate, supplier.termDays),
      status: 'Outstanding',
      supplier: supplier.name,
      supplierId: supplier.id,
      sourceId: po.id,
      sourceType: 'PO',
      sourceNumber: '',
      lines: po.lines.map(l => ({ ...l })),
      taxRate: PPN,
      taxInclusive: false,
      tax: po.tax,
      amount: po.amount,
      note: '',
      createdBy: CREATED_BY,
    };
    out.purchaseInvoices.push(pi);
    // One invoice from a smaller supplier that fell due last month is still unpaid.
    const due = pi.dueDate;
    if (
      !overduePayable &&
      supplier.id !== '1' &&
      monthsAgo(due) === 1 &&
      due <= addDays(today, -7)
    ) {
      overduePayable = true;
      return;
    }
    const payDate = maxDate(addDays(due, -between(0, 4)), invDate);
    if (payDate <= today) {
      out.purchasePayments.push({
        id: nextId('PP'),
        number: '',
        date: payDate,
        status: 'Posted',
        supplier: supplier.name,
        supplierId: supplier.id,
        invoiceId: pi.id,
        invoiceNumber: '',
        amount: pi.amount,
        paymentMethod: SUPPLIER_METHOD[supplier.id],
        note: 'Pembayaran faktur pembelian',
        createdBy: CREATED_BY,
      });
      pi.status = 'Paid';
    }
  }

  // An order tops each of the supplier's items that is short up to its target.
  function order(supplier, date, { draft = false, force = false } = {}) {
    const goods = ITEMS.filter(i => i.supplier === supplier.id);
    let lines = goods
      .filter(i => position(i) <= i.target * 0.85)
      .map(i => line(i, roundTo(i.target - position(i), 5), i.cost));
    if (!lines.length && force) {
      const low = goods.reduce((a, b) => (position(b) / b.target < position(a) / a.target ? b : a));
      lines = [line(low, roundTo(low.target * 0.3, 5), low.cost)];
    }
    if (!lines.length) {
      return;
    }
    const t = totals(lines);
    const po = {
      id: nextId('PO'),
      number: '',
      supplier: supplier.name,
      supplierId: supplier.id,
      date,
      dueDate: addDays(date, supplier.termDays),
      status: draft ? 'Draft' : 'Confirmed',
      taxRate: PPN,
      tax: t.tax,
      amount: t.amount,
      stockMutated: false,
      warehouseId: goods[0].wh,
      lines,
      createdBy: CREATED_BY,
    };
    out.purchaseOrders.push(po);
    if (draft) {
      return;
    }
    openOrders[supplier.id] = po;
    const receiveDate = addDays(date, between(2, 4));
    if (receiveDate <= today) {
      at(receiveDate, STEP.receive, () => receive(po, supplier, receiveDate));
    }
  }

  // After stock is committed or taken out, reorder what reached the reorder level.
  function review(date) {
    SUPPLIERS.forEach(s => {
      if (!openOrders[s.id] && ITEMS.some(i => i.supplier === s.id && position(i) <= i.reorder)) {
        order(s, date);
      }
    });
  }

  // ── Sales ──────────────────────────────────────────────────────────────────
  function settle(inv, cust, owed, pick = between) {
    const plan = [];
    if (PAYS[cust.id] === 'late') {
      plan.push([addDays(inv.dueDate, pick(12, 35)), owed]);
    } else if (PAYS[cust.id] === 'installments') {
      const first = Math.round(owed / 2);
      plan.push([addDays(inv.dueDate, -5), first], [addDays(inv.dueDate, 12), owed - first]);
    } else {
      plan.push([addDays(inv.dueDate, -pick(0, 9)), owed]);
    }
    let paid = 0;
    plan.forEach(([date, amount]) => {
      const payDate = maxDate(date, inv.date);
      if (payDate > today || amount <= 0) {
        return;
      }
      out.salesReceipts.push({
        id: nextId('SR'),
        number: '',
        date: payDate,
        status: 'Posted',
        customer: inv.customer,
        customerId: inv.customerId,
        invoiceId: inv.id,
        invoiceNumber: '',
        amount,
        paymentMethod: CUSTOMER_METHOD[cust.id],
        note: plan.length > 1 ? 'Pembayaran bertahap' : 'Pelunasan faktur',
        createdBy: CREATED_BY,
      });
      paid += amount;
    });
    if (paid >= owed) {
      inv.status = 'Paid';
    }
  }

  function deliver(so, sale, date) {
    so.lines.forEach(l => {
      move(l.itemId, so.warehouseId, -l.qty);
      commit(l.itemId, so.warehouseId, -l.qty);
    });
    so.status = 'Delivered';
    so.stockMutated = true;
    out.deliveryOrders.push(deliveryOrder(so, date, 'Delivered'));
    if (sale.role === 'delivered') {
      return; // delivered, invoice not made yet
    }
    const inv = {
      id: nextId('SI'),
      number: '',
      date,
      dueDate: addDays(date, sale.cust.termDays),
      status: 'Outstanding',
      customer: so.customer,
      customerId: so.customerId,
      sourceId: so.id,
      sourceType: 'SO',
      sourceNumber: '',
      lines: so.lines.map(l => ({ ...l })),
      taxRate: PPN,
      taxInclusive: false,
      tax: so.tax,
      amount: so.amount,
      note: '',
      createdBy: CREATED_BY,
    };
    out.salesInvoices.push(inv);
    if (sale.overdueCase) {
      return; // left unpaid past its due date
    }

    let returned = 0;
    if (sale.returnCase) {
      const src = so.lines[0];
      const lines = [line(item(src.itemId), Math.min(5, src.qty), src.price)];
      const rt = totals(lines);
      returned = rt.amount;
      const rDate = minDate(addDays(date, 5), today);
      at(rDate, STEP.return, () => {
        move(src.itemId, so.warehouseId, lines[0].qty);
        out.salesReturns.push({
          id: nextId('SRN'),
          number: '',
          date: rDate,
          status: 'Posted',
          sourceId: inv.id,
          sourceType: 'SI',
          sourceNumber: '',
          warehouseId: so.warehouseId,
          customer: so.customer,
          customerId: so.customerId,
          lines,
          taxRate: PPN,
          taxInclusive: false,
          tax: rt.tax,
          amount: rt.amount,
          reason: 'Sebagian barang tidak sesuai spesifikasi',
          createdBy: CREATED_BY,
        });
      });
    }
    settle(inv, sale.cust, inv.amount - returned);
  }

  function createSale(sale) {
    const t = totals(sale.lines);
    const so = {
      id: nextId('SO'),
      number: '',
      customer: sale.cust.name,
      customerId: sale.cust.id,
      date: sale.date,
      dueDate: null,
      status: 'Confirmed',
      taxRate: PPN,
      tax: t.tax,
      amount: t.amount,
      stockMutated: false,
      warehouseId: sale.wh,
      lines: sale.lines,
      createdBy: CREATED_BY,
    };
    if (sale.sourceQuotation) {
      so.sourceQuotation = sale.sourceQuotation;
    }
    out.salesOrders.push(so);

    if (sale.role === 'draft') {
      so.status = 'Draft';
      return so;
    }
    if (sale.role === 'cancelled') {
      so.status = 'Cancelled';
      so.cancelledAt = sale.date;
      so.cancelledBy = CREATED_BY;
      return so;
    }
    sale.lines.forEach(l => commit(l.itemId, sale.wh, l.qty));
    review(sale.date);
    if (sale.role === 'transit' || sale.role === 'dp') {
      reservations[so.id] = sale.lines.map(l => ({ itemId: l.itemId, qty: l.qty }));
      if (sale.role === 'transit') {
        out.deliveryOrders.push(deliveryOrder(so, today, 'In Transit'));
      } else {
        out.salesDownPayments.push({
          id: nextId('SDP'),
          orderId: so.id,
          customerName: so.customer,
          date: minDate(addDays(sale.date, 1), today),
          amount: Math.round((t.amount * 0.3) / 1000) * 1000,
          method: 'Transfer BCA',
          notes: 'Uang muka 30%',
          status: 'Received',
          createdAt: sale.date,
        });
      }
      return so;
    }
    const deliverDate = minDate(addDays(sale.date, between(0, 2)), today);
    at(deliverDate, STEP.deliver, () => deliver(so, sale, deliverDate));
    return so;
  }

  // Order lines from what the warehouse can still commit, in steps of 5.
  function pickLines(group) {
    const r = rand();
    const count = r < 0.15 ? 3 : r < 0.55 ? 2 : 1;
    const lines = [];
    shuffle(group.items).forEach(id => {
      const it = item(id);
      const ton = it.unit === 'Ton';
      const qty = Math.min(
        ton ? 5 * between(10, 40) : 5 * between(3, 14),
        freeInFives(id, group.wh)
      );
      if (lines.length < count && qty >= (ton ? 20 : 10)) {
        lines.push(line(it, qty, it.sell));
      }
    });
    return lines;
  }

  function planSales(ago, day, lastDay) {
    const current = ago === 0;
    const count = current
      ? OPEN_ROLES.length + Math.max(2, Math.round(lastDay * 0.3))
      : between(9, 12);
    const firstOpen = current ? count - OPEN_ROLES.length : count;
    const days = [];
    for (let k = 0; k < count; k++) {
      days.push(between(1, current ? lastDay : lastDay - 3));
    }
    days.sort((a, b) => a - b);
    days.forEach((d, k) => {
      const date = day(d);
      // Last month: one invoice stays unpaid past its due date, one order is partly returned.
      const overdueCase = ago === 1 && k === 1;
      const returnCase = ago === 1 && k === 3;
      const cust = overdueCase ? CUSTOMERS[3] : returnCase ? CUSTOMERS[1] : pickCustomer();
      const group = overdueCase || returnCase || rand() < 0.4 ? SALES_GROUPS[0] : SALES_GROUPS[1];
      const role = k < firstOpen ? 'complete' : OPEN_ROLES[k - firstOpen];
      at(date, STEP.order, () => {
        const lines = pickLines(group);
        if (lines.length) {
          createSale({ date, cust, wh: group.wh, lines, role, overdueCase, returnCase });
        }
      });
    });
  }

  function quotation(cust, date, status, lines) {
    const q = {
      id: nextId('SQ'),
      number: '',
      status,
      date,
      validUntil: addDays(date, 14),
      amount: lines.reduce((s, l) => s + l.subtotal, 0),
      lines,
      note: 'Harga franco lokasi proyek, belum termasuk PPN',
      customer: cust.name,
      customerId: cust.id,
    };
    out.salesQuotations.push(q);
    return q;
  }

  // ── Kas & Bank ─────────────────────────────────────────────────────────────
  let lastDeposit = '';
  let pettySpent = 0;
  const vouchers = []; // manual journal vouchers: salary payments
  function planCash(day, lastDay, monthDays) {
    const payments = [
      [5, 'Sewa', '610101', 'Sewa gudang Tambun', 9000000],
      [15, 'Transportasi', '610101', 'BBM & perawatan armada', between(55, 75) * 100000],
      [20, 'Utilities', '610101', 'Listrik & air kantor dan gudang', between(24, 31) * 100000],
    ];
    payments.forEach(([d, category, accountNo, payee, amount]) => {
      if (d > lastDay) {
        return;
      }
      const date = day(d);
      out.otherPayments.push({
        id: nextId('OP'),
        number: '',
        accountNo,
        date,
        bankAccountId: 'BA001',
        payee,
        category,
        amount,
        method: 'Transfer Bank',
        reference: '',
        notes: '',
        createdAt: date,
      });
    });
    // Petty cash: topped up from BCA on the 1st by what was spent last month, then
    // office transport, stationery and entertainment are paid from it.
    if (pettySpent > 0) {
      const date = day(1);
      out.bankTransfers.push({
        id: nextId('BT'),
        number: '',
        date,
        fromAccountId: 'BA001',
        toAccountId: 'BA000',
        amount: pettySpent,
        fee: 0,
        reference: '',
        notes: 'Pengisian kas kecil',
        createdAt: date,
      });
    }
    pettySpent = 0;
    PETTY.forEach(([d, category, payee, lo, hi]) => {
      const amount = xbetween(lo, hi) * 50000;
      if (d > lastDay) {
        return;
      }
      const date = day(d);
      pettySpent += amount;
      out.otherPayments.push({
        id: nextId('OP'),
        number: '',
        accountNo: '610101',
        date,
        bankAccountId: 'BA000',
        payee,
        category,
        amount,
        method: 'Tunai',
        reference: '',
        notes: '',
        createdAt: date,
      });
    });
    // Salaries: a posted payroll run on the 25th, paid from BCA the same day.
    if (lastDay >= 25) {
      const date = day(25);
      const period = date.slice(0, 7);
      const details = EMPLOYEES.filter(e => e.joinDate <= date).map(e => ({
        employeeId: e.id,
        name: e.name,
        salary: e.salary,
        transport: 0,
        meal: 0,
      }));
      const total = details.reduce((s, d) => s + d.salary, 0);
      const run = {
        id: `PAY-${period.replace('-', '')}`,
        period,
        employeeCount: details.length,
        totalAmount: total,
        date,
        posted: true,
        details,
        paid: true,
        paidDate: date,
        payMethod: 'Transfer BCA',
      };
      out.payrollRuns.push(run);
      const number = `JV.${date.slice(0, 4)}.${date.slice(5, 7)}.00001`;
      vouchers.push({
        id: `J:JV:${number}`,
        number,
        date,
        source: 'manual',
        memo: `Pembayaran gaji ${period} (${run.id})`,
        lines: [
          {
            accountNo: '210401',
            accountName: 'Hutang Gaji',
            debit: total,
            credit: 0,
            memo: `Pembayaran gaji ${period}`,
          },
          {
            accountNo: '110102',
            accountName: 'Bank BCA',
            debit: 0,
            credit: total,
            memo: `Bayar via Transfer BCA ${run.id}`,
          },
        ],
        totals: { debit: total, credit: total },
      });
    }
    // Cash received from customers is deposited to the main account twice a month.
    [13, 27]
      .filter(d => d <= lastDay)
      .forEach(d => {
        const date = day(d);
        at(date, STEP.treasury, () => {
          const cash = out.salesReceipts
            .filter(r => r.paymentMethod === 'Tunai' && r.date > lastDeposit && r.date <= date)
            .reduce((s, r) => s + r.amount, 0);
          lastDeposit = date;
          const amount = Math.floor(cash / 100000) * 100000;
          if (amount <= 0) {
            return;
          }
          out.bankTransfers.push({
            id: nextId('BT'),
            number: '',
            date,
            fromAccountId: 'BA000',
            toAccountId: 'BA001',
            amount,
            fee: 0,
            reference: '',
            notes: 'Setor tunai penerimaan pelanggan',
            createdAt: date,
          });
        });
      });
    if (lastDay === monthDays) {
      const date = day(monthDays);
      out.otherDeposits.push({
        id: nextId('OD'),
        number: '',
        accountNo: '710101',
        date,
        bankAccountId: 'BA001',
        payer: 'Bank BCA',
        category: 'Bunga Bank',
        amount: between(30, 48) * 10000,
        method: 'Transfer Bank',
        notes: 'Jasa giro',
        createdAt: date,
      });
    }
  }

  // ── Timeline: five full months plus the current month to date ──────────────
  for (let ago = 5; ago >= 0; ago--) {
    const ms = new Date(base.getFullYear(), base.getMonth() - ago, 1);
    const monthDays = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
    const lastDay = ago === 0 ? now.getDate() : monthDays;
    const day = d =>
      iso(new Date(ms.getFullYear(), ms.getMonth(), Math.max(1, Math.min(d, lastDay))));

    planSales(ago, day, lastDay);
    planCash(day, lastDay, monthDays);

    if (ago === 2) {
      const date = day(18);
      at(date, STEP.adjust, () => {
        const it = ['6', '7', '8'].map(item).find(i => free(i.id, WH_BKS) >= 2.5);
        if (!it) {
          return;
        }
        const qty = 2.5;
        move(it.id, WH_BKS, -qty);
        out.itemAdjustments.push({
          id: nextId('ADJ'),
          number: '',
          date,
          warehouseId: WH_BKS,
          lines: [{ itemId: it.id, itemName: it.name, unit: it.unit, type: 'out', qty }],
          note: 'Selisih stok opname (susut penyimpanan)',
        });
        review(date);
      });
    }

    if (ago === 1) {
      const transferDate = day(8);
      at(transferDate, STEP.transfer, () => {
        const qty = Math.min(20, freeInFives('9', WH_MAIN));
        if (!qty) {
          return;
        }
        move('9', WH_MAIN, -qty);
        move('9', WH_BKS, qty);
        out.itemTransfers.push({
          id: nextId('IT'),
          number: '',
          date: transferDate,
          status: 'Posted',
          fromWarehouse: WH_MAIN,
          toWarehouse: WH_BKS,
          lines: [{ itemId: '9', itemName: item('9').name, qty }],
          note: 'Stok untuk pelanggan area Bekasi',
        });
        review(transferDate);
      });
      const accepted = quotation(CUSTOMERS[7], day(3), 'Accepted', [
        line(item('6'), 20, item('6').sell),
        line(item('8'), 15, item('8').sell),
      ]);
      const orderDate = day(6);
      at(orderDate, STEP.order, () => {
        const so = createSale({
          date: orderDate,
          cust: CUSTOMERS[7],
          wh: WH_BKS,
          lines: accepted.lines.map(l => ({ ...l })),
          role: 'complete',
          sourceQuotation: accepted.id,
        });
        accepted.convertedTo = so.id;
      });
      quotation(CUSTOMERS[2], day(12), 'Rejected', [line(item('1'), 40, item('1').sell)]);
    }

    if (ago === 0) {
      quotation(CUSTOMERS[5], day(2), 'Sent', [
        line(item('4'), 60, item('4').sell),
        line(item('5'), 45, item('5').sell),
      ]);
      quotation(CUSTOMERS[0], day(9), 'Sent', [line(item('2'), 90, item('2').sell)]);
      quotation(CUSTOMERS[6], day(lastDay), 'Draft', [line(item('8'), 25, item('8').sell)]);
      const date = day(lastDay);
      // Unless an item is already at its minimum, a large order today (after the day's
      // deliveries) leaves a stocked item below it (the low-stock case); its reorder goes
      // out today and arrives after today.
      at(date, STEP.adjust, () => {
        const total = i => stock[i.id][WH_MAIN] + stock[i.id][WH_BKS];
        if (STOCKED.some(i => total(i) <= i.min)) {
          return;
        }
        const needed = i => Math.max(10, Math.ceil((total(i) - i.min + 10) / 5) * 5);
        const it = ['7', '6', '8', '9'].map(item).find(i => needed(i) <= freeInFives(i.id, i.wh));
        if (it) {
          createSale({
            date,
            cust: it.wh === WH_BKS ? CUSTOMERS[1] : CUSTOMERS[6],
            wh: it.wh,
            lines: [line(it, needed(it), it.sell)],
            role: 'complete',
          });
        }
      });
      // The next supplier order, for what is running lowest, is still a draft.
      at(date, STEP.close, () => {
        const goods = s => STOCKED.filter(i => i.supplier === s.id);
        const ratio = s => Math.min(...goods(s).map(i => position(i) / i.target));
        const next = SUPPLIERS.filter(s => goods(s).length && !openOrders[s.id]).sort(
          (a, b) => ratio(a) - ratio(b)
        )[0];
        if (next) {
          order(next, date, { draft: true, force: true });
        }
      });
    }
  }

  // Run the events in date order (events may schedule later ones).
  while (events.length) {
    events.sort((a, b) => a.date.localeCompare(b.date) || a.step - b.step || a.seq - b.seq);
    events.shift().run();
  }

  // ── Trading: customer POs picked up at the supplier (trading.js) ───────────
  // The records have the shapes trading.js creates. A supplier PO opened for pickup
  // carries `pickupFlow` and gets ceil(qty / 35) surat jalan up front (delivery
  // orders with pickup:true, numbered in the PO's month); a weighed truck turns one
  // into a trip; the PO closes at its quota or at the month-end cut-off and its
  // unused surat jalan are voided. Customers are invoiced per week and suppliers per
  // month from the trips. Trips move no stock (gl.js buildPickupJournals).
  const r2 = v => Math.round(v * 100) / 100;
  // A timestamp on a date (minutes after midnight), never later than now.
  const stamp = (date, minutes) => {
    const [y, m, d] = date.split('-').map(Number);
    const t = new Date(y, m - 1, d, 0, minutes);
    return (t > now ? now : t).toISOString();
  };
  const firstWorkday = (from, to) => {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (isWorkday(d)) {
        return d;
      }
    }
    return '';
  };
  const supplierPrices = [];
  // The supplier's price in effect on a date (trading.js purchasePrice).
  const listedPrice = (supplierId, itemId, date) =>
    supplierPrices
      .filter(p => p.supplierId === supplierId && p.itemId === itemId && p.effectiveDate <= date)
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] || null;
  const isTrip = d => d.pickup && d.status !== 'Pending' && d.status !== 'Cancelled';
  const soTaken = so =>
    round3(
      out.deliveryOrders
        .filter(d => isTrip(d) && d.soId === so.id)
        .reduce((s, d) => s + d.weighing.net, 0)
    );

  // The weight alert sits on a trip of the earliest customer billing week of this
  // month that is already invoiced; early in a month (no such week yet) on a trip of
  // last month's last week, of the PO cut off at that month end.
  const monthStart = iso(base);
  const thisWeek = maxDate(mondayOf(today), monthStart);
  let alertWeek = null;
  for (let d = monthStart; d < thisWeek && !alertWeek; ) {
    const w = billingWeek(d);
    if (firstWorkday(w.from, w.to)) {
      alertWeek = w;
    }
    d = addDays(w.to, 1);
  }
  const alertSpec = alertWeek ? TRADE_PLAN[0].find(s => s.alert) : TRADE_PLAN[1].find(s => s.cut);
  alertWeek = alertWeek || billingWeek(addDays(monthStart, -1));
  const recapDate = minDate(today, addDays(alertWeek.invoiceDate, 2));
  let alertTrip = null;

  function closePickup(po, so, slots, reason, when) {
    const label = reason === 'quota' ? 'kuota terpenuhi' : 'lewat cut-off';
    slots
      .filter(s => s.status === 'Pending')
      .forEach(s => {
        s.status = 'Cancelled';
        s.voidReason = `PO ${label}`;
        s.cancelledAt = when;
        s.cancelledBy = CREATED_BY;
      });
    po.status = 'Closed';
    po.closedAt = when;
    po.closedReason = reason;
    po.closedBy = CREATED_BY;
    const anyOpen = so.pickupFlow.poIds.some(id => {
      const p = out.purchaseOrders.find(x => x.id === id);
      return p && p.status !== 'Closed' && p.status !== 'Cancelled';
    });
    if (!anyOpen && soTaken(so) >= so.lines[0].qty - 0.0005) {
      so.status = 'Closed';
      so.closedAt = when;
      so.closedReason = 'quota';
    }
  }

  const followUps = { 3: [], 2: [], 1: [], 0: [] };
  const truckTurn = {};
  const tickets = {};
  function pickupDeal(spec, date, ago) {
    const cust = CUSTOMERS.find(c => c.id === spec.c);
    const it = item(spec.i);
    const sup = SUPPLIERS.find(s => s.id === it.source);
    let so = spec.so;
    if (!so) {
      const soLines = [line(it, spec.qty, it.sell + tbetween(-4, 6) * 500)];
      const t = totals(soLines);
      so = {
        id: nextId('SO'),
        number: '',
        customer: cust.name,
        customerId: cust.id,
        date,
        dueDate: null,
        status: 'Confirmed',
        taxRate: PPN,
        tax: t.tax,
        amount: t.amount,
        stockMutated: false,
        lines: soLines,
        createdBy: CREATED_BY,
        pickupFlow: { poIds: [] },
      };
      out.salesOrders.push(so);
    }
    // The supplier PO, at the supplier's price on that day.
    const listed = listedPrice(sup.id, it.id, date);
    const poLines = [line(it, spec.qty, listed ? listed.price : it.cost)];
    const t = totals(poLines);
    const maxTrips = Math.max(1, Math.ceil(spec.qty / TRUCK - 1e-9));
    const cutoff = monthEndOf(date);
    const po = {
      id: nextId('PO'),
      number: '',
      supplier: sup.name,
      supplierId: sup.id,
      date,
      dueDate: addDays(date, sup.termDays),
      status: 'Confirmed',
      taxRate: PPN,
      tax: t.tax,
      amount: t.amount,
      stockMutated: false,
      lines: poLines,
      createdBy: CREATED_BY,
      pickupFlow: {
        soId: so.id,
        capacity: TRUCK,
        maxTrips,
        cutoff,
        openedAt: stamp(date, 8 * 60 + 30),
        openedBy: CREATED_BY,
      },
    };
    out.purchaseOrders.push(po);
    so.pickupFlow.poIds.push(po.id);

    // Its surat jalan (trading.js newSlot).
    const sale = so.lines[0].price;
    const slots = [];
    for (let n = 1; n <= maxTrips; n++) {
      slots.push({
        id: nextId('DO'),
        number: '',
        pickup: true,
        slotNo: n,
        sjNo: '',
        poId: po.id,
        poNumber: '',
        soId: so.id,
        soNumber: '',
        supplierId: sup.id,
        supplier: sup.name,
        customerId: cust.id,
        customer: cust.name,
        destination: cust.address,
        date: '',
        status: 'Pending',
        driver: '',
        vehicle: '',
        capacity: TRUCK,
        salePrice: sale,
        purchasePrice: null,
        weighing: null,
        weighHistory: [],
        lines: [
          {
            itemId: it.id,
            itemName: it.name,
            itemCode: '',
            unit: it.unit,
            qty: 0,
            price: sale,
            lineDiscount: 0,
            subtotal: 0,
          },
        ],
        notes: '',
        issuedOn: date,
      });
    }
    out.deliveryOrders.push(...slots);

    // Trucks on weekdays until the quota is reached, the cut-off passes or today.
    const [chance, fewest, most] = spec.every ? [1, spec.every, spec.every] : [0.8, 2, 3];
    const [light, heavy] = spec.load || [33.6, 38.4];
    const alertDay =
      spec === alertSpec ? firstWorkday(maxDate(alertWeek.from, date), alertWeek.to) : '';
    const firstDay = spec.forceFirst ? firstWorkday(date, cutoff) : '';
    const fleet = PICKUP_TRUCKS[cust.id];
    let taken = 0;
    let used = 0;
    for (let d = date; d <= minDate(cutoff, today) && po.status !== 'Closed'; d = addDays(d, 1)) {
      if (!isWorkday(d)) {
        continue;
      }
      const forced = d === alertDay || d === firstDay || d === today;
      if (trand() >= chance && !forced) {
        continue;
      }
      const count = tbetween(fewest, most);
      for (let k = 0; k < count && used < maxTrips && po.status !== 'Closed'; k++) {
        const slot = slots[used];
        const rest = round3(spec.qty - taken);
        // Enough tonnage per truck that the surat jalan cover the quota; the last
        // truck takes what is left.
        let net = r2(light + trand() * (heavy - light));
        net = Math.max(net, Math.min(r2(rest - (maxTrips - used - 1) * 36.5), 40));
        const isAlert = d === alertDay && !alertTrip;
        if (isAlert) {
          net = 35;
        } else if (rest - net < 10 && rest <= 42) {
          net = rest;
        }
        net = Math.min(net, rest);
        const tare = r2(11.2 + trand() * 3.4);
        const minutes = 7 * 60 + 20 + k * 105 + tbetween(0, 40);
        const when = stamp(d, minutes);
        truckTurn[cust.id] = (truckTurn[cust.id] || 0) + 1;
        const [driver, vehicle] = fleet[truckTurn[cust.id] % fleet.length];
        const code = SUPPLIER_CODE[sup.id];
        tickets[code + d] = (tickets[code + d] || 0) + 1;
        const price = listedPrice(sup.id, it.id, d);
        slot.date = d;
        slot.vehicle = vehicle;
        slot.driver = driver;
        slot.ticketNo = `${code}-${d.slice(2, 4)}${d.slice(5, 7)}${d.slice(8, 10)}-${pad(tickets[code + d], 2)}`;
        slot.weighing = { gross: r2(net + tare), tare, net };
        slot.purchasePrice = price ? price.price : po.lines[0].price;
        slot.purchasePriceSource = price ? 'supplierPrice' : 'po';
        slot.lines[0].qty = net;
        slot.lines[0].subtotal = Math.round(net * sale);
        slot.status = 'Delivered';
        slot.weighHistory = [
          { at: when, by: CREATED_BY, source: 'manual', net, gross: slot.weighing.gross, tare },
        ];
        if (spec.destChange === used + 1) {
          slot.destChanged = true;
          slot.destOriginal = slot.destination;
          slot.destination = DEST_CHANGE;
          slot.notes = 'Tujuan dialihkan oleh pelanggan';
        }
        if (isAlert) {
          // Recorded and invoiced at 30 t; the supplier's recap later says 35 t
          // (trading.js updateWeight on an invoiced trip).
          const recapAt = stamp(recapDate, 10 * 60 + 15);
          slot.weighHistory = [
            { at: when, by: CREATED_BY, source: 'manual', net: 30, gross: r2(30 + tare), tare },
            {
              at: recapAt,
              by: CREATED_BY,
              source: 'rekap',
              net,
              gross: slot.weighing.gross,
              tare,
              prevNet: 30,
              note: 'Rekap timbangan supplier',
            },
          ];
          slot.weightAlert = {
            from: 30,
            to: net,
            at: recapAt,
            source: 'rekap',
            salesInvoice: '',
            purchaseInvoice: '',
            resolved: false,
          };
          slot.billedNet = 30;
          alertTrip = slot;
        }
        used += 1;
        taken = round3(taken + net);
        if (taken >= spec.qty - 0.0005) {
          closePickup(po, so, slots, 'quota', stamp(d, minutes + 2));
        }
      }
    }
    if (po.status !== 'Closed' && cutoff < today) {
      closePickup(po, so, slots, 'cutoff', stamp(addDays(cutoff, 1), 7 * 60 + 5));
      const rest = round3(so.lines[0].qty - soTaken(so));
      if (rest > 0.0005) {
        followUps[ago - 1].push({ c: spec.c, i: spec.i, qty: rest, day: 1, so });
      }
    }
  }

  for (let ago = 3; ago >= 0; ago--) {
    const ms = new Date(base.getFullYear(), base.getMonth() - ago, 1);
    const monthDays = new Date(ms.getFullYear(), ms.getMonth() + 1, 0).getDate();
    const lastDay = ago === 0 ? now.getDate() : monthDays;
    const dayOf = d => iso(new Date(ms.getFullYear(), ms.getMonth(), d));
    if (ago === PRICE_CHANGE.ago) {
      const it = item(PRICE_CHANGE.item);
      const sup = SUPPLIERS.find(s => s.id === PRICE_CHANGE.supplier);
      supplierPrices.push({
        id: 'SPR-0001',
        supplierId: sup.id,
        supplierName: sup.name,
        itemId: it.id,
        itemName: it.name,
        itemCode: it.code,
        unit: it.unit,
        price: PRICE_CHANGE.price,
        effectiveDate: dayOf(PRICE_CHANGE.day),
      });
    }
    [...followUps[ago], ...TRADE_PLAN[ago]].forEach(spec => {
      const d = spec.day < 0 ? monthDays + spec.day : spec.day;
      if (d <= lastDay) {
        pickupDeal(spec, dayOf(d), ago);
      }
    });
  }

  // Invoices from trips (trading.js buildInvoice): one line per truck.
  function tripInvoice(sales, list, date) {
    const first = list[0];
    const party = sales
      ? CUSTOMERS.find(c => c.id === first.customerId)
      : SUPPLIERS.find(s => s.id === first.supplierId);
    const lines = list.map(d => {
      const qty = sales && d.billedNet != null ? d.billedNet : d.weighing.net;
      const price = sales ? d.salePrice : d.purchasePrice;
      const l = d.lines[0];
      return {
        itemId: l.itemId,
        itemName: l.itemName,
        unit: l.unit,
        qty,
        price,
        lineDiscount: 0,
        subtotal: Math.round(qty * price),
        doId: d.id,
        note: '',
      };
    });
    const subtotal = lines.reduce((s, l) => s + l.subtotal, 0);
    const tax = Math.round(subtotal * PPN);
    const orders = [...new Set(list.map(d => (sales ? d.soId : d.poId)))];
    const dates = list.map(d => d.date).sort();
    const from = dates[0];
    const to = dates[dates.length - 1];
    const inv = {
      id: nextId(sales ? 'SI' : 'PI'),
      number: '',
      date,
      dueDate: addDays(date, party.termDays),
      status: 'Outstanding',
      sourceType: 'DO',
      sourceId: orders.length === 1 ? orders[0] : '',
      sourceNumber: '',
      doIds: list.map(d => d.id),
      periodFrom: from,
      periodTo: to,
      lines,
      taxRate: PPN,
      taxInclusive: false,
      tax,
      amount: subtotal + tax,
      note: `Pengambilan ${from}${to !== from ? ` s/d ${to}` : ''} (${list.length} truk)`,
      createdBy: CREATED_BY,
    };
    if (sales) {
      inv.customer = party.name;
      inv.customerId = party.id;
    } else {
      inv.supplier = party.name;
      inv.supplierId = party.id;
    }
    return { inv, party };
  }

  const trips = out.deliveryOrders
    .filter(isTrip)
    .sort((a, b) => a.date.localeCompare(b.date) || a.slotNo - b.slotNo);
  // Customers: per billing week, once the week is over; paid like other invoices.
  const weeks = new Map();
  trips.forEach(d => {
    const w = billingWeek(d.date);
    if (w.to >= today) {
      return; // this week: not invoiced yet
    }
    const key = `${w.invoiceDate}|${d.customerId}`;
    if (!weeks.has(key)) {
      weeks.set(key, { date: w.invoiceDate, list: [] });
    }
    weeks.get(key).list.push(d);
  });
  weeks.forEach(({ date, list }) => {
    const { inv, party } = tripInvoice(true, list, date);
    out.salesInvoices.push(inv);
    list.forEach(d => {
      d.status = 'Invoiced';
      if (d.weightAlert) {
        d.weightAlert.salesInvoice = inv.id;
      }
    });
    settle(inv, party, inv.amount, tbetween);
  });
  // Suppliers: one bill per month, early the next month, paid before it falls due.
  const months = new Map();
  trips.forEach(d => {
    const key = `${d.date.slice(0, 7)}|${d.supplierId}`;
    if (!months.has(key)) {
      months.set(key, []);
    }
    months.get(key).push(d);
  });
  months.forEach(list => {
    const date = addDays(monthEndOf(list[0].date), tbetween(3, 5));
    if (date > today) {
      return;
    }
    const { inv, party } = tripInvoice(false, list, date);
    inv.supplierRef = `INV/${SUPPLIER_CODE[party.id]}/${date.slice(2, 4)}${date.slice(5, 7)}/${pad(tbetween(120, 480), 4)}`;
    out.purchaseInvoices.push(inv);
    const payDate = maxDate(addDays(inv.dueDate, -tbetween(0, 4)), date);
    if (payDate <= today) {
      out.purchasePayments.push({
        id: nextId('PP'),
        number: '',
        date: payDate,
        status: 'Posted',
        supplier: party.name,
        supplierId: party.id,
        invoiceId: inv.id,
        invoiceNumber: '',
        amount: inv.amount,
        paymentMethod: SUPPLIER_METHOD[party.id],
        note: 'Pembayaran tagihan pengambilan',
        createdBy: CREATED_BY,
      });
      inv.status = 'Paid';
    }
  });

  // ── Numbers (per type, per month, in date order) and cross-references ──────
  [
    ['salesQuotations', 'SQ'],
    ['salesOrders', 'SO'],
    ['purchaseOrders', 'PO'],
    ['deliveryOrders', 'DO'],
    ['salesInvoices', 'SI'],
    ['purchaseInvoices', 'PI'],
    ['salesReceipts', 'SR'],
    ['purchasePayments', 'PP'],
    ['salesReturns', 'SRN'],
    ['itemTransfers', 'IT'],
    ['itemAdjustments', 'ADJ'],
    ['otherPayments', 'OP'],
    ['otherDeposits', 'OD'],
    ['bankTransfers', 'BT'],
  ].forEach(([coll, prefix]) => {
    const seqs = {};
    // Surat jalan of a pickup PO are issued when the PO is opened.
    const issued = doc => doc.issuedOn || doc.date;
    out[coll].sort((a, b) => issued(a).localeCompare(issued(b)));
    out[coll].forEach(doc => {
      const date = issued(doc);
      const key = `${prefix}.${date.slice(0, 4)}.${date.slice(5, 7)}`;
      seqs[key] = (seqs[key] || 0) + 1;
      doc.number = `${key}.${pad(seqs[key], 5)}`;
    });
  });
  const doNumber = {};
  out.deliveryOrders.forEach(d => {
    doNumber[d.id] = d.number;
    d.id = d.number; // delivery orders use their number as id
  });
  const numberOf = (coll, id) => (out[coll].find(d => d.id === id) || {}).number || '';
  const tripById = {};
  out.deliveryOrders
    .filter(d => d.pickup)
    .forEach(d => {
      d.poNumber = numberOf('purchaseOrders', d.poId);
      d.soNumber = numberOf('salesOrders', d.soId);
      d.sjNo = `${d.poNumber}/${pad(d.slotNo, 2)}`;
      if (d.weightAlert) {
        d.weightAlert.salesInvoice = numberOf('salesInvoices', d.weightAlert.salesInvoice);
      }
      delete d.issuedOn;
      delete d.billedNet;
      tripById[d.id] = d;
    });
  [...out.salesInvoices, ...out.purchaseInvoices]
    .filter(inv => Array.isArray(inv.doIds))
    .forEach(inv => {
      inv.doIds = inv.doIds.map(id => doNumber[id]);
      inv.lines.forEach(l => {
        l.doId = doNumber[l.doId];
        const d = tripById[l.doId];
        l.note = [d.sjNo, d.date, d.vehicle].filter(Boolean).join(' · ');
      });
    });
  out.salesInvoices.forEach(d => {
    d.sourceNumber = numberOf('salesOrders', d.sourceId);
  });
  out.purchaseInvoices.forEach(d => {
    d.sourceNumber = numberOf('purchaseOrders', d.sourceId);
  });
  out.salesReturns.forEach(d => {
    d.sourceNumber = numberOf('salesInvoices', d.sourceId);
  });
  out.salesReceipts.forEach(d => {
    d.invoiceNumber = numberOf('salesInvoices', d.invoiceId);
  });
  out.purchasePayments.forEach(d => {
    d.invoiceNumber = numberOf('purchaseInvoices', d.invoiceId);
  });
  // The order screens add new documents at the top.
  out.salesOrders.reverse();
  out.purchaseOrders.reverse();

  // ── Items with the resulting stock ─────────────────────────────────────────
  const inventoryItems = ITEMS.map(i => {
    // Traded goods pass through (picked up at the supplier): no warehouse record.
    const warehouseStock = i.wh
      ? { [WH_MAIN]: stock[i.id][WH_MAIN], [WH_BKS]: stock[i.id][WH_BKS] }
      : {};
    return {
      id: i.id,
      code: i.code,
      name: i.name,
      category: i.category,
      unit: i.unit,
      stock: round3((warehouseStock[WH_MAIN] || 0) + (warehouseStock[WH_BKS] || 0)),
      min: i.min,
      cost: i.cost,
      sell: i.sell,
      warehouseStock,
    };
  });

  // ── Opening balances (day before the first month) ──────────────────────────
  const openingDate = iso(new Date(base.getFullYear(), base.getMonth() - 5, 0));
  const opening = [
    ['110101', 'Kas', 15000000],
    ['110102', 'Bank BCA', 400000000],
    ['110103', 'Bank Mandiri', 150000000],
    ['110401', 'Persediaan Barang', STOCKED.reduce((s, i) => s + i.target * i.cost, 0)],
  ];
  const equity = opening.reduce((s, l) => s + l[2], 0);
  const jvNumber = `JV.${openingDate.slice(0, 4)}.${openingDate.slice(5, 7)}.00001`;
  const openingJournal = {
    id: `J:JV:${jvNumber}`,
    number: jvNumber,
    date: openingDate,
    source: 'manual',
    memo: 'Saldo awal',
    lines: opening
      .map(([accountNo, accountName, debit]) => ({
        accountNo,
        accountName,
        debit,
        credit: 0,
        memo: 'Saldo awal',
      }))
      .concat([
        {
          accountNo: '310101',
          accountName: 'Modal Disetor',
          debit: 0,
          credit: equity,
          memo: 'Saldo awal',
        },
      ]),
    totals: { debit: equity, credit: equity },
  };

  return {
    customers: CUSTOMERS.map(c => ({ ...c })),
    suppliers: SUPPLIERS.map(s => ({ ...s })),
    inventoryItems,
    warehouses: WAREHOUSES.map(w => ({ ...w })),
    ...out,
    supplierPrices,
    purchaseDownPayments: [],
    paymentLogs: [],
    reservations,
    journals: [openingJournal, ...vouchers],
    journalVouchers: JSON.parse(JSON.stringify([openingJournal, ...vouchers])),
    fleet: FLEET.map(([driver, plate], k) => ({
      id: `FLT-${pad(k + 1, 3)}`,
      plate,
      type: 'Dump Truck',
      driver,
      status: out.deliveryOrders.some(d => d.status === 'In Transit' && d.vehicle === plate)
        ? 'In Transit'
        : 'OK',
    })),
    expedition: EXPEDITION.map(e => ({ ...e })),
    employees: EMPLOYEES.map(e => ({ ...e })),
    bankAccounts: BANK_ACCOUNTS.map(b => ({ ...b })),
    itemCategories: [...new Set(ITEMS.map(i => i.category))],
    units: ['Ton', 'M3'],
  };
}
