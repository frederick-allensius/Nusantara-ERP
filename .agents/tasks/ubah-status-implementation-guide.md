# Panduan Implementasi "Ubah Status" untuk Modul Tersisa

## Status Implementasi

**Selesai: 4/21 modules (19%)**
- ✅ SO (Sales Order) - sudah ada
- ✅ PO (Purchase Order) - baru ditambahkan
- ✅ SQ (Sales Quotation) - baru ditambahkan  
- ✅ PQ (Purchase Quotation) - baru ditambahkan

**Foundation sudah ready:**
- ✅ 14 status constants baru di `erp-crud.js`
- ✅ ESLint globals updated
- ✅ Generic helper `setDocumentStatus()` 
- ✅ Pattern established

## Template Code untuk Modul Baru

### 1. Row Menu Function Template

Tambahkan fungsi ini di file view masing-masing modul:

```javascript
function _menuItem(label, attrs, cls, role) {
  return `<button type="button" role="${role || 'menuitem'}" tabindex="-1" class="row-menu-item${cls ? ' ' + cls : ''}" ${attrs}>${esc(label)}</button>`;
}

function [MODULE]RowMenu(doc) {
  const id = esc(doc.id);
  const num = esc(docNo(doc));
  const isDraft = doc.status === 'Draft';

  const main = [
    _menuItem('Lihat detail', `data-action="[PREFIX]View" data-id="${id}"`),
    _menuItem('Ubah status', 'data-action="rowMenuPanel" data-panel="status" aria-haspopup="menu"'),
    isDraft ? _menuItem('Edit', `data-action="[PREFIX]Edit" data-id="${id}"`) : '',
    _menuItem('Duplikat', `data-action="[PREFIX]Duplicate" data-id="${id}"`),
    '<div class="row-menu-sep" role="separator"></div>',
    isDraft ? _menuItem('Hapus', `data-action="[PREFIX]Delete" data-id="${id}"`, 'is-danger') : '',
  ].filter(Boolean).join('');

  const statuses = window.[STATUS_CONST]; // e.g. SI_STATUSES
  const options = statuses ? statuses.filter(([v]) =>
    v === doc.status || (window.DocEngine && window.DocEngine.canTransition && window.DocEngine.canTransition('[TYPE]', doc.status, v))
  ) : [];
  
  const choices = options
    .map(([v, l]) =>
      v === doc.status
        ? _menuItem(l, 'aria-checked="true" disabled', 'is-current', 'menuitemradio')
        : _menuItem(
            l,
            `aria-checked="false" data-action="set[MODULE]Status" data-id="${id}" data-status="${esc(v)}"`,
            '',
            'menuitemradio'
          )
    )
    .join('');
    
  const none = options.filter(([v]) => v !== doc.status).length === 0
    ? '<div class="row-menu-note">Status ini tidak bisa diubah dari daftar.</div>'
    : '';

  const statusPanel = `<div class="row-menu-panel" data-panel="status" hidden>
    ${_menuItem('‹ Kembali', 'data-action="rowMenuPanel" data-panel="main"', 'row-menu-back')}
    <div class="row-menu-head" role="presentation">Ubah status</div>
    ${choices}${none}
  </div>`;

  return `<button type="button" class="row-menu-btn" data-action="rowMenu" aria-haspopup="menu" aria-expanded="false"
      aria-label="Aksi ${num}" title="Aksi">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
    </button><div class="row-menu" role="menu" aria-label="Aksi ${num}" hidden>
      <div class="row-menu-panel" data-panel="main">${main}</div>${statusPanel}
    </div>`;
}
```

### 2. Action Handler Template

Tambahkan di action delegation section:

```javascript
reg('[PREFIX]SetStatus', (id, status) => {
  if (id && status) {
    set[MODULE]Status(id, status);
  }
});
```

### 3. Status Change Function Template

```javascript
function set[MODULE]Status(id, newStatus) {
  const doc = (DB.[COLLECTION] || []).find(d => d.id === id);
  if (!doc) {
    toast('Dokumen tidak ditemukan', 'error');
    return;
  }

  const old = doc.status;
  if (old === newStatus) {
    return;
  }

  // Optional: Add business logic validation here
  // e.g., prevent cancel if has child documents

  doc.status = newStatus;
  save(); // or saveDB()
  refresh(); // or navigate(activeView)
  
  const statuses = window.[STATUS_CONST];
  const statusLabel = statuses && statuses.find(([v]) => v === newStatus)?.[1] || newStatus;
  toast(`${docNo(doc)} → ${statusLabel}`, 'success');
}
```

### 4. Update List Rendering

Replace existing action cell dengan row menu:

**Before:**
```javascript
<td class="t-actions">${action}</td>
// or
<td class="t-actions"><svg class="row-chev">...</svg></td>
```

**After:**
```javascript
<td class="t-actions">${[MODULE]RowMenu(doc)}</td>
```

## Modul-Modul Yang Perlu Diimplementasi

### Invoice & Payments (invoice-view.js)

**4 modules: SI, PI, SR, PP**

- File: `public/classic/core/invoice-view.js`
- Collections: `salesInvoices`, `purchaseInvoices`, `salesReceipts`, `purchasePayments`
- Status Constants: `SI_STATUSES`, `PI_STATUSES`, `SR_STATUSES`, `PP_STATUSES`
- Catatan khusus: Invoice status sering computed dari Balances, perlu hati-hati

**Steps:**
1. Tambahkan `invoiceRowMenu(type, doc)` function
2. Update line ~323 dan ~341 untuk replace chevron dengan row menu
3. Tambahkan action handler `setInvoiceStatus`
4. Implement status change dengan validation

### Delivery Orders (DO)

- File: Tidak ada dedicated view, biasanya via SO/PO detail atau pickup-view.js
- Collection: `deliveryOrders`
- Status Constant: `DO_STATUSES` (sudah ada)
- Catatan: Kompleks karena terkait pickup/trading module

**Skip dulu, prioritas rendah**

### Down Payments (sales-purchase-extras.js)

**2 modules: SDP, PDP**

- File: `public/classic/core/sales-purchase-extras.js`
- Collections: `salesDownPayments`, `purchaseDownPayments`
- Status Constants: `SDP_STATUSES`, `PDP_STATUSES`

### Returns (return-view.js atau sales-purchase-extras.js)

**2 modules: SRN, PRN**

- Collections: `salesReturns`, `purchaseReturns`
- Status Constants: `SRN_STATUSES`, `PRN_STATUSES`
- File: Perlu search dimana returns di-render

### Goods Receipt (sales-purchase-extras.js)

**1 module: GR**

- Collection: `goodsReceipts`
- Status Constant: `GR_STATUSES`
- File: `public/classic/core/sales-purchase-extras.js`

### SJ Validation (sj-validation.js)

**1 module: SJV**

- Status Constant: `SJV_STATUSES`
- File: Perlu cari

### Inventory Modules

**Material Request (inventory-extras.js)**
- Collection: `itemRequisitions`
- Status Constant: `MR_STATUSES`

**Warehouse Transfer (warehouse-view.js)**
- Collection: `itemTransfers`
- Status Constant: `WT_STATUSES`

**Stock Adjustment (adjust-view.js)**
- Collection: `itemAdjustments`
- Status Constant: `ADJ_STATUSES`

## Testing Checklist

Untuk setiap modul yang diimplementasi:

- [ ] Menu "⋯" muncul di list rows
- [ ] Menu "Ubah status" ada dan bisa diklik
- [ ] Status panel shows current status (disabled, checked)
- [ ] Only valid transitions appear (jika pakai DocEngine)
- [ ] Klik status baru → toast muncul
- [ ] List refresh dengan status baru
- [ ] Status badge di list updated
- [ ] Document detail shows new status
- [ ] No console errors

## Prioritas Implementasi

**High Priority (UI-facing, sering dipakai):**
1. Invoice SI/PI (invoice-view.js)
2. Payments SR/PP (invoice-view.js)
3. Returns SRN/PRN

**Medium Priority:**
4. Down Payments SDP/PDP
5. Goods Receipt GR
6. Warehouse Transfer WT
7. Stock Adjustment ADJ

**Low Priority:**
8. Material Request MR
9. SJ Validation SJV
10. Delivery Orders DO (kompleks, skip dulu)

## Catatan Implementasi

### DocEngine Transitions

Modul yang pakai DocEngine:
- SO, PO (sudah done)
- SQ, PQ (sudah done)
- DO (belum)

Sisanya tidak pakai DocEngine, jadi bisa langsung set status tanpa `canTransition` check.

### Generic vs Custom Logic

**Pakai Generic `setDocumentStatus()`:**
- Simple status change tanpa side effects
- Returns, Material Request, Stock Adjustment

**Pakai Custom Logic:**
- Invoice (terkait Balances computed status)
- DO (terkait stock/trading)
- SO/PO (sudah ada custom: inlineSOStatus, inlinePOStatus)

## Next Developer Tasks

1. **Implementasi Invoice module** (highest priority)
2. **Implementasi Returns module**
3. **Implementasi Down Payments**
4. **Implementasi Inventory modules** (MR, WT, ADJ)
5. **Testing semua modules**
6. **Update UPDATE.md progress**

## Code Reference

**Completed modules untuk reference:**
- `public/classic/core/quotation-view.js` - Lines 100-180 (SQ/PQ implementation)
- `public/classic/core/erp-view.js` - Lines 922-1010 (SO/PO implementation)
- `public/classic/core/erp-crud.js` - Lines 828-960 (status constants)
- `public/classic/core/erp-crud.js` - Lines 6851-6910 (inlineSOStatus, inlinePOStatus)

---

**Last updated:** 2026-10-22
**Status:** 4/21 done, foundation complete, 17 modules remaining
