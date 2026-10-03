// ═══════════════════════════════════════════════════════════════════════════════
// Notifications (src/core/notifications.js) — alerts for the trading pickup flow:
//   • weight changes after billing that nobody has followed up
//   • pickup POs whose cut-off is within 3 days or already passed while open
//   • customers with trips left unbilled for more than 7 days
// The figures come from window.TradingSummary (tested in trading-summary.test.ts);
// here it is a stub so the alert shape, links and access checks are pinned down.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkAlerts } from '../src/core/notifications.js';

const w = () => window as any;

function summary(over: any = {}) {
  return {
    NEAR_CUTOFF_DAYS: 3,
    hasData: () => true,
    supplierDiffs: () => ({ lines: [], bills: [], alerts: [{ doId: 'DO-1' }, { doId: 'DO-2' }] }),
    poProgress: () => [
      { id: 'PO-1', pastCutoff: true, nearCutoff: false },
      { id: 'PO-2', pastCutoff: false, nearCutoff: true },
      { id: 'PO-3', pastCutoff: false, nearCutoff: false, nearQuota: true },
    ],
    unbilledAging: (_asOf: string, minDays: number) =>
      minDays === 7 ? [{ customer: 'PT Bumi', count: 3, value: 15000000 }] : [],
    ...over,
  };
}

beforeEach(() => {
  w().DB = { inventoryItems: [], budgets: [], journals: [] };
  w().Balances = undefined;
  w().RBAC = undefined;
  w().TradingSummary = summary();
});

afterEach(() => {
  w().TradingSummary = undefined;
  w().RBAC = undefined;
});

const byId = (list: any[]) => Object.fromEntries(list.map(a => [a.id, a]));

describe('trading pickup alerts', () => {
  it('raises weight-change, cut-off and unbilled alerts that open their pages', () => {
    const a = byId(checkAlerts());
    expect(a['pickup-weight-changes']).toMatchObject({
      type: 'warning',
      count: 2,
      link: 'menu:Perubahan Timbangan',
    });
    expect(a['pickup-cutoff']).toMatchObject({
      type: 'danger',
      count: 2,
      link: 'menu:PO Pengambilan',
    });
    expect(a['pickup-cutoff'].body).toBe(
      '1 PO lewat cut-off masih terbuka · 1 PO cut-off dalam 3 hari'
    );
    expect(a['pickup-unbilled']).toMatchObject({ count: 1, link: 'menu:Tagih Pelanggan' });
    expect(a['pickup-unbilled'].body).toBe('1 pelanggan · 3 truk · Rp 15.000.000');
  });

  it('raises nothing when there is no trading data or nothing to follow up', () => {
    w().TradingSummary = summary({ hasData: () => false });
    expect(checkAlerts()).toEqual([]);
    w().TradingSummary = summary({
      supplierDiffs: () => ({ lines: [], bills: [], alerts: [] }),
      poProgress: () => [{ id: 'PO-3', pastCutoff: false, nearCutoff: false, nearQuota: true }],
      unbilledAging: () => [],
    });
    expect(checkAlerts()).toEqual([]);
  });

  it('only shows alerts for modules the user may view', () => {
    w().RBAC = { canView: (m: string) => m === 'sales' };
    const ids = checkAlerts().map((x: any) => x.id);
    expect(ids).toEqual(['pickup-unbilled']);
  });
});
