// ═══════════════════════════════════════════════════════════════════════════════
// dual-view.test.ts — Section 5 dual-view role-based access
//
// Asserts the persona → surface mapping layered on top of the RBAC matrix:
//   • Owner/Management (admin, manajer) get the 'executive' surface: the
//     Executive Dashboard (dashboard), full reports and the executive analytics
//     (funnels / real-time margin / outstanding piutang / financials).
//   • Admin/Accounting data-entry (akunting, penjualan) get the focused 'entri'
//     surface exposing EXACTLY the operational entry tasks (PO / Surat Jalan /
//     Timbangan / Biaya Operasional) and are gated OUT of the executive-only
//     analytics surface.
//
// Loads the real classic scripts by indirect eval (like the bundle / the
// rbac.test.ts pattern): set window.__ERP_USER = { role, active } then read
// window.RBAC.* and window._entriHarian.
//
// This test FAILS if the mapping breaks (e.g. a data-entry role is granted the
// executive surface, or the entri surface stops exposing exactly the four
// operational tasks).
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const RBAC_SRC = readFileSync(resolve(__dirname, '../public/classic/core/rbac.js'), 'utf-8');
const ENTRI_SRC = readFileSync(
  resolve(__dirname, '../public/classic/core/entri-harian.js'),
  'utf-8'
);

function bootRbac(role: string) {
  (window as any).DB = { salesOrders: [], purchaseOrders: [], journals: [], settings: {} };
  (window as any).saveDB = () => {};
  (window as any).showToast = vi.fn();
  (window as any).__ERP_USER = { role, active: true, uid: 'u1', email: `${role}@nsa.local` };
  // eslint-disable-next-line no-eval -- intentionally executing the real classic script in global scope
  (0, eval)(RBAC_SRC);
  return (window as any).RBAC;
}

const MANAGEMENT = ['admin', 'manajer'];
const DATA_ENTRY = ['akunting', 'penjualan'];

describe('dual-view surfaces', () => {
  it('grants management roles the executive surface (dashboard + reports + analytics)', () => {
    MANAGEMENT.forEach(role => {
      const RBAC = bootRbac(role);
      expect(RBAC.canViewSurface('executive')).toBe(true);
      expect(RBAC.canView('dashboard')).toBe(true);
      expect(RBAC.canView('reports')).toBe(true);
      // Every executive analytic is part of the management surface.
      expect(RBAC.EXECUTIVE_ANALYTICS).toEqual(
        expect.arrayContaining(['funnels', 'margin', 'piutang', 'financials'])
      );
    });
  });

  it('gives data-entry roles the focused entri surface, not the executive one', () => {
    DATA_ENTRY.forEach(role => {
      const RBAC = bootRbac(role);
      expect(RBAC.canViewSurface('entri')).toBe(true);
      // The headline of the feature: data-entry personas are gated OUT of the
      // executive-only analytics surface.
      expect(RBAC.canViewSurface('executive')).toBe(false);
      // The Entri Harian rail (group 'entri') is visible to them.
      expect(RBAC.canViewGroup('entri')).toBe(true);
    });
  });

  it('exposes the entri surface to management too (admin/manajer can also do daily entry)', () => {
    MANAGEMENT.forEach(role => {
      const RBAC = bootRbac(role);
      expect(RBAC.canViewSurface('entri')).toBe(true);
      expect(RBAC.canViewGroup('entri')).toBe(true);
    });
  });

  it('treats an inactive (pending) account as having no surfaces', () => {
    const RBAC = bootRbac('akunting');
    (window as any).__ERP_USER.active = false;
    expect(RBAC.surfaceFor()).toEqual([]);
    expect(RBAC.canViewSurface('entri')).toBe(false);
    expect(RBAC.canViewSurface('executive')).toBe(false);
  });

  it('surfaceFor(role) returns the exact mapping per persona', () => {
    const RBAC = bootRbac('admin');
    expect(RBAC.surfaceFor('admin').sort()).toEqual(['entri', 'executive']);
    expect(RBAC.surfaceFor('manajer').sort()).toEqual(['entri', 'executive']);
    expect(RBAC.surfaceFor('akunting')).toEqual(['entri']);
    expect(RBAC.surfaceFor('penjualan')).toEqual(['entri']);
    expect(RBAC.surfaceFor('viewer')).toEqual(['executive']);
    expect(RBAC.surfaceFor('pending')).toEqual([]);
  });
});

describe('Entri Harian daily-entry surface', () => {
  it('exposes EXACTLY the operational entry tasks (PO / Surat Jalan / Timbangan / Biaya)', () => {
    const RBAC = bootRbac('akunting');
    // eslint-disable-next-line no-eval -- execute the real classic script in global scope
    (0, eval)(ENTRI_SRC);
    const entri = (window as any)._entriHarian;

    const expected = ['po', 'suratJalan', 'timbangan', 'biayaOperasional'];
    // The surface's tasks are exactly the operational entry actions — nothing
    // more (no executive analytics), nothing missing.
    expect(entri.tasks).toEqual(expected);
    // And they match the single source of truth on RBAC.
    expect(RBAC.ENTRI_ACTIONS).toEqual(expected);

    expect(typeof (window as any).renderEntriHarian).toBe('function');
    expect(typeof entri.openPO).toBe('function');
    expect(typeof entri.openSuratJalan).toBe('function');
    expect(typeof entri.openTimbangan).toBe('function');
    expect(typeof entri.openBiayaOperasional).toBe('function');
  });
});
