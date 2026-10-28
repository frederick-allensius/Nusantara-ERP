// ═══════════════════════════════════════════════════════════════════════════════
// NUSANTARA ERP — Stock Management
// Stock mutation, reservation, and availability tracking
// ═══════════════════════════════════════════════════════════════════════════════

import { showToast } from './modal.js';

/**
 * Apply stock mutation when order status changes
 * @param {object} order - Order object (SO or PO)
 * @param {string} direction - "out" for SO, "in" for PO
 */
export function applyStockMutation(order, direction) {
  if (!order.lines || order.stockMutated) {
    return false;
  }

  // E01 — "stok boleh negatif saat penjualan": a sale is no longer blocked when
  // stock is short. We still compute the shortage and WARN (non-blocking) so the
  // user knows the item has gone minus, then let the mutation run with
  // allowNegative so the on-hand figure can drop below zero.
  let allowNegative = false;
  if (direction === 'out') {
    const problems = stockShortages(order.lines, order.warehouseId);
    if (problems.length > 0) {
      const msg = problems
        .map(p => `${p.itemName}: butuh ${p.needed}, tersedia ${p.available}`)
        .join('; ');
      showToast(`Stok menjadi minus (penjualan tetap diproses): ${msg}`, 'warning');
      allowNegative = true;
    }
  }

  moveStockLines(order.lines, direction, order.warehouseId, allowNegative);
  order.stockMutated = true;
  return true;
}

/**
 * Undo a previously applied stock mutation (edited, cancelled or deleted SO/PO).
 * `direction` is the direction originally applied ('out' for SO, 'in' for PO).
 */
export function reverseStockMutation(order, direction) {
  if (!order || !order.lines || !order.stockMutated) {
    return false;
  }
  moveStockLines(order.lines, direction === 'out' ? 'in' : 'out', order.warehouseId);
  order.stockMutated = false;
  return true;
}

/**
 * Lines whose quantity exceeds the stock available in the warehouse
 * (item total when the warehouse module is absent). Returns [{itemName, needed, available}].
 */
export function stockShortages(lines, warehouseId) {
  const wh = window.Warehouse;
  const whId = warehouseId || (wh ? wh.DEFAULT_WH_ID : null);
  const needed = new Map();
  (lines || []).forEach(line => {
    if (!line || line.itemId === 'custom') {
      return;
    }
    const key = String(line.itemId);
    needed.set(key, (needed.get(key) || 0) + (Number(line.qty) || 0));
  });
  const problems = [];
  needed.forEach((qty, itemId) => {
    const item = DB.inventoryItems.find(i => String(i.id) === itemId);
    if (!item) {
      return;
    }
    const available = wh && whId ? wh.stockAt(item, whId) : Number(item.stock) || 0;
    if (available + 1e-9 < qty) {
      problems.push({ itemName: item.name, needed: qty, available });
    }
  });
  return problems;
}

/**
 * Move stock for a set of lines without validation. Routes through the Warehouse
 * module so item.warehouseStock and the item.stock total stay in sync.
 *
 * allowNegative (default false): when true, an 'out' move may drive stock below
 * zero instead of clamping at 0. Used only by the sales stock-out path (E01 —
 * "stok boleh negatif saat penjualan"); every other caller leaves it off so
 * purchases, transfers, adjustments and returns keep the clamp.
 */
export function moveStockLines(lines, direction, warehouseId, allowNegative) {
  const wh = window.Warehouse;
  const whId = warehouseId || (wh ? wh.DEFAULT_WH_ID : null);
  (lines || []).forEach(line => {
    if (!line || line.itemId === 'custom') {
      return;
    }
    const item = DB.inventoryItems.find(i => String(i.id) === String(line.itemId));
    const qty = Number(line.qty) || 0;
    if (!item || qty <= 0) {
      return;
    }
    if (wh && whId) {
      if (direction === 'out') {
        wh.removeStock(item, whId, qty, allowNegative);
      } else if (direction === 'in') {
        wh.addStock(item, whId, qty);
      }
    } else if (direction === 'out') {
      const next = (Number(item.stock) || 0) - qty;
      item.stock = allowNegative ? next : Math.max(0, next);
    } else if (direction === 'in') {
      item.stock = (Number(item.stock) || 0) + qty;
    }
  });
}

/**
 * Get reserved quantity for an item
 */
export function getReservedQty(itemId) {
  if (!DB.reservations) {
    return 0;
  }
  let total = 0;
  Object.values(DB.reservations).forEach(lines => {
    (lines || []).forEach(l => {
      if (String(l.itemId) === String(itemId)) {
        total += Number(l.qty) || 0;
      }
    });
  });
  return total;
}

/**
 * Whether the company keeps an item in stock: a warehouse holds it, or held it
 * before (its per-warehouse record exists). Goods that only pass through — picked
 * up at the supplier by the customer's trucks — never are, so an order for them
 * has no warehouse stock to reserve or to run short of.
 */
export function keptInStock(item) {
  if (!item) {
    return false;
  }
  if ((Number(item.stock) || 0) > 0) {
    return true;
  }
  const ws = item.warehouseStock;
  return !!ws && typeof ws === 'object' && Object.keys(ws).length > 0;
}

function itemOf(itemId) {
  return (DB.inventoryItems || []).find(i => String(i.id) === String(itemId)) || null;
}

/**
 * Reserve stock for an order (items kept in stock only)
 */
export function reserveStock(orderId, lines) {
  if (!DB.reservations) {
    DB.reservations = {};
  }
  DB.reservations[orderId] = lines
    .filter(l => l.itemId === 'custom' || !itemOf(l.itemId) || keptInStock(itemOf(l.itemId)))
    .map(l => ({
      itemId: l.itemId,
      qty: l.qty,
    }));
}

/**
 * Release stock reservation
 */
export function releaseReservation(orderId) {
  if (!DB.reservations) {
    return;
  }
  delete DB.reservations[orderId];
}

/**
 * Check for oversell conditions
 */
export function checkOversell(lines, excludeOrderId) {
  const problems = [];
  lines.forEach(line => {
    if (line.itemId === 'custom') {
      return;
    }
    const item = DB.inventoryItems.find(i => String(i.id) === String(line.itemId));
    if (!item || !keptInStock(item)) {
      return;
    }

    // Calculate available stock (physical - reserved)
    let reserved = getReservedQty(line.itemId);

    // Exclude current order's reservation if editing
    if (excludeOrderId && DB.reservations && DB.reservations[excludeOrderId]) {
      const currentReservation = DB.reservations[excludeOrderId].find(
        r => String(r.itemId) === String(line.itemId)
      );
      if (currentReservation) {
        reserved -= currentReservation.qty;
      }
    }

    const available = item.stock - reserved;

    if (line.qty > available) {
      problems.push({
        itemName: item.name,
        requested: line.qty,
        available: available,
        physical: item.stock,
        reserved: reserved,
      });
    }
  });
  return problems;
}

/**
 * Get available stock for an item (physical - reserved)
 * Optionally scoped to a specific warehouse.
 */
export function getAvailableStock(itemId, warehouseId) {
  const item = DB.inventoryItems.find(i => String(i.id) === String(itemId));
  if (!item) {
    return 0;
  }
  const wh = window.Warehouse;
  const physical = wh && warehouseId ? wh.stockAt(item, warehouseId) : item.stock;
  const reserved = getReservedQty(itemId);
  return Math.max(0, physical - reserved);
}

// Make functions globally available
window.applyStockMutation = applyStockMutation;
window.reverseStockMutation = reverseStockMutation;
window.stockShortages = stockShortages;
window.moveStockLines = moveStockLines;
window.getReservedQty = getReservedQty;
window.reserveStock = reserveStock;
window.releaseReservation = releaseReservation;
window.checkOversell = checkOversell;
window.keptInStock = keptInStock;
window.getAvailableStock = getAvailableStock;
