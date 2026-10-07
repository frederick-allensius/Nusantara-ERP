// ═══════════════════════════════════════════════════════════════════════════════
// Backup UI in Pengaturan Umum
//   • the "Kelola Backup" tile states what getBackupStatus() actually knows
//     (date of the last backup, or that none has been made) — never "undefined"
//   • "Kelola Backup" opens at once and fills the list when the asynchronous
//     getBackupList() resolves; "Pulihkan" works on the late-rendered rows
// Boots the real classic bundle against the app shell, like the smoke test.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { classicOrder } from '../vite.config.js';

const ROOT = resolve(__dirname, '..');
const w = () => window as any;

const appHtml = readFileSync(resolve(ROOT, 'app.html'), 'utf-8');
const bodyHtml = (appHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '').replace(
  /<script[\s\S]*?<\/script>/gi,
  ''
);

const NO_BACKUP = { lastBackup: false, lastBackupDate: null, hoursUntilNext: 24 };
const BACKUP = {
  key: 'backup_1759800000000',
  date: '7/10/2026, 09.00.00',
  size: 2048,
  sizeFormatted: '2 KB',
};

// A list request that resolves only when the test says so.
function deferredList() {
  let resolveList!: (list: unknown[]) => void;
  const promise = new Promise<unknown[]>(r => {
    resolveList = r;
  });
  return { promise, resolveList };
}

const tick = () => new Promise(r => setTimeout(r, 0));
const text = (el: Element | null) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
const modal = () => document.getElementById('modal-host')!;

beforeAll(async () => {
  document.body.innerHTML = bodyHtml;
  w().__ERP_USER = { role: 'admin', active: true };
  await import('../src/core/helpers.js');
  await import('../src/classic/core/doc-registry.js');
  w().DB = { settings: {} };
  w().defaultData = {};
  w().saveDB = vi.fn();
  w().loadDB = vi.fn();
  w().showToast = vi.fn();
  w().showUndoToast = vi.fn();
  w().closeModal = vi.fn();
  w().confirmDialog = vi.fn();
  w().Chart = class {
    static register() {}
    destroy() {}
    update() {}
  };
  w().erpAuth = { getCurrentUser: () => ({ email: 'test@nsa.local' }), logout: vi.fn() };
  w().erpBackup = { getBackupStatus: () => NO_BACKUP, getBackupList: async () => [] };
  w().NSANotif = {
    getAlerts: () => [],
    checkAlerts: () => [],
    getUnreadCount: () => 0,
    markAllRead: () => {},
    requestPermission: async () => 'denied',
  };
  const bundle = classicOrder.map(f => readFileSync(resolve(ROOT, f), 'utf-8')).join('\n;\n');
  // eslint-disable-next-line no-eval -- execute the real classic bundle in global scope
  (0, eval)(bundle);
});

beforeEach(() => {
  document.body.innerHTML = bodyHtml + '<div id="modal-host"></div>';
  // Same markup contract as src/core/modal.js, rendered synchronously.
  w().openModal = (title: string, body: string, footer?: string) => {
    modal().innerHTML = `<h2>${title}</h2><div class="modal-body">${body}</div>${footer || ''}`;
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Kelola Backup tile', () => {
  const tileSub = () => {
    const host = document.createElement('div');
    host.innerHTML = w().renderSettings();
    const tile = host.querySelector('[data-action="manageBackup"]');
    expect(tile, 'Kelola Backup tile').toBeTruthy();
    return text(tile!.querySelector('[style*="margin-top:2px"]'));
  };

  it('says no backup has been made yet when there is none', () => {
    w().erpBackup.getBackupStatus = () => NO_BACKUP;
    const sub = tileSub();
    expect(sub).toBe('Belum ada backup otomatis');
    expect(sub).not.toContain('undefined');
  });

  it('shows the date of the last backup', () => {
    w().erpBackup.getBackupStatus = () => ({
      lastBackup: true,
      lastBackupDate: '6/10/2026, 08.15.00',
      hoursUntilNext: 1,
    });
    const sub = tileSub();
    expect(sub).toBe('Backup terakhir: 6/10/2026, 08.15.00');
    expect(sub).not.toContain('undefined');
  });
});

describe('Kelola Backup modal', () => {
  beforeEach(() => {
    w().erpBackup.getBackupStatus = () => NO_BACKUP;
  });

  it('opens at once and fills the list when getBackupList() resolves', async () => {
    const { promise, resolveList } = deferredList();
    w().erpBackup.getBackupList = () => promise;

    w().showBackupManager();
    expect(text(modal())).toContain('Memuat daftar backup');
    expect(text(modal())).not.toContain('undefined');
    expect(modal().querySelector('[data-action="restoreBackup"]')).toBeNull();

    resolveList([BACKUP]);
    await tick();

    expect(text(modal())).not.toContain('Memuat daftar backup');
    expect(text(modal())).toContain('Backup Otomatis (1)');
    expect(text(modal())).toContain(BACKUP.date);
    expect(text(modal())).toContain(BACKUP.sizeFormatted);
    const restore = modal().querySelector<HTMLElement>('[data-action="restoreBackup"]');
    expect(restore?.dataset.id).toBe(BACKUP.key);
  });

  it('says so when there is no backup in the list', async () => {
    w().erpBackup.getBackupList = async () => [];

    w().showBackupManager();
    await tick();

    expect(text(modal())).toContain('Backup Otomatis (0)');
    expect(text(modal())).toContain('Belum ada backup tersimpan');
    expect(text(modal())).not.toContain('undefined');
  });

  it('accepts a list returned synchronously', async () => {
    w().erpBackup.getBackupList = () => [BACKUP];

    w().showBackupManager();
    await tick();

    expect(text(modal())).toContain('Backup Otomatis (1)');
    expect(text(modal())).toContain(BACKUP.date);
  });

  it('leaves a replaced modal alone when the list arrives late', async () => {
    const { promise, resolveList } = deferredList();
    w().erpBackup.getBackupList = () => promise;

    w().showBackupManager();
    modal().innerHTML = '<div id="other">Modal lain</div>';
    resolveList([BACKUP]);
    await tick();

    expect(text(modal())).toBe('Modal lain');
  });

  it('"Pulihkan" on a late-rendered row restores that backup', async () => {
    w().erpBackup.getBackupList = async () => [BACKUP];
    w().erpBackup.restoreFromBackup = vi.fn();
    w().confirm = vi.fn(() => true);

    w().showBackupManager();
    await tick();
    vi.useFakeTimers(); // keeps the post-restore page reload from firing
    modal().querySelector<HTMLElement>('[data-action="restoreBackup"]')!.click();

    expect(w().confirm).toHaveBeenCalledTimes(1);
    expect(w().erpBackup.restoreFromBackup).toHaveBeenCalledWith(BACKUP.key);
  });
});
