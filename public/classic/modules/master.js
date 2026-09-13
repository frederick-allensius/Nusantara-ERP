// Pelanggan / Supplier list. The sidebar opens one list at a time through
// core/master-extras.js, which sets window._masterSection.
function renderMasterData() {
  const isSupp = window._masterSection === 'suppliers';

  if (isSupp) {
    const poCountBySupplier = {};
    for (const o of DB.purchaseOrders) {
      if (o.supplier) {
        poCountBySupplier[o.supplier] = (poCountBySupplier[o.supplier] || 0) + 1;
      }
    }
    const total = DB.suppliers.length;
    const withOrders = DB.suppliers.filter(s => poCountBySupplier[s.name]).length;
    const supps = applyPage([...DB.suppliers], 'master_supp');

    const row = s => `<tr data-action="viewSupplier" data-id="${escapeHtml(s.id)}" class="row-link">
      <td class="td-p t-strong">${escapeHtml(s.name)}</td>
      <td class="td-p t-muted">${escapeHtml(s.contact || '—')}</td>
      <td class="td-p t-muted">${escapeHtml(s.phone || '—')}</td>
      <td class="td-p t-muted">${escapeHtml(s.address || '—')}</td>
      <td class="td-p t-num">${poCountBySupplier[s.name] || 0}</td>
      <td class="td-p">${actionBtns('Supplier', s.id)}</td>
    </tr>`;

    return `
  ${secHdr('Supplier', 'Rekanan pembelian beserta jumlah pesanan pembeliannya', 'Tambah Supplier', 'addSupplier')}
  ${statRow([
    { label: 'Supplier terdaftar', value: String(total), sub: 'Seluruh data supplier' },
    { label: 'Pernah menerima PO', value: String(withOrders), sub: 'Punya minimal satu pesanan pembelian' },
    { label: 'Pesanan pembelian', value: String(DB.purchaseOrders.length), sub: 'Semua status' },
  ])}
  <div class="card card-flush">
    <div class="table-wrap">
      <table class="data-table">
        ${tblHdr(['Nama', 'Kontak', 'Telepon', 'Alamat', 'Jumlah PO', 'Aksi'])}
        <tbody>
          ${
            supps.length === 0
              ? `<tr><td colspan="6" class="td-empty">Belum ada supplier. Tambahkan supplier sebelum membuat pesanan pembelian.</td></tr>`
              : supps.map(row).join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(total, 'master_supp')}
  </div>`;
  }

  const soCountByCustomer = {};
  for (const o of DB.salesOrders) {
    if (o.customer) {
      soCountByCustomer[o.customer] = (soCountByCustomer[o.customer] || 0) + 1;
    }
  }
  const total = DB.customers.length;
  const withOrders = DB.customers.filter(c => soCountByCustomer[c.name]).length;
  const custs = applyPage([...DB.customers], 'master_cust');

  const row = c => `<tr data-action="viewCustomer" data-id="${escapeHtml(c.id)}" class="row-link">
      <td class="td-p t-strong">${escapeHtml(c.name)}</td>
      <td class="td-p t-muted">${escapeHtml(c.phone || '—')}</td>
      <td class="td-p t-muted">${escapeHtml(c.address || '—')}</td>
      <td class="td-p t-num">${soCountByCustomer[c.name] || 0}</td>
      <td class="td-p">${actionBtns('Customer', c.id)}</td>
    </tr>`;

  return `
  ${secHdr('Pelanggan', 'Pelanggan beserta jumlah pesanan penjualannya', 'Tambah Pelanggan', 'addCustomer')}
  ${statRow([
    { label: 'Pelanggan terdaftar', value: String(total), sub: 'Seluruh data pelanggan' },
    { label: 'Pernah memesan', value: String(withOrders), sub: 'Punya minimal satu pesanan penjualan' },
    { label: 'Pesanan penjualan', value: String(DB.salesOrders.length), sub: 'Semua status' },
  ])}
  <div class="card card-flush">
    <div class="table-wrap">
      <table class="data-table">
        ${tblHdr(['Nama', 'Telepon', 'Alamat', 'Jumlah SO', 'Aksi'])}
        <tbody>
          ${
            custs.length === 0
              ? `<tr><td colspan="5" class="td-empty">Belum ada pelanggan. Tambahkan pelanggan sebelum membuat penawaran atau pesanan penjualan.</td></tr>`
              : custs.map(row).join('')
          }
        </tbody>
      </table>
    </div>
    ${pagerHTML(total, 'master_cust')}
  </div>`;
}
