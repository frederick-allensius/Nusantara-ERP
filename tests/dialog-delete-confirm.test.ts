// ═══════════════════════════════════════════════════════════════════════════════
// Hapus in an edit dialog asks first (erp-view.js armDelete): every dialog's
// Hapus button (red text, first in the footer) arms the inline "Hapus …? Batal / Ya, hapus" row instead of
// deleting on the first click.
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CRUD = readFileSync(resolve(__dirname, '../public/classic/core/erp-crud.js'), 'utf-8');

describe('edit dialog Hapus buttons', () => {
  it('all go through armDelete with the real action and a label', () => {
    expect(CRUD).not.toMatch(/class="btn-danger[^"]*" data-action="delete[A-Z]/);
    const armed = Array.from(
      CRUD.matchAll(/data-action="armDelete" data-do="(delete[A-Za-z]+)"[^>]*data-label="/g)
    ).map(m => m[1]);
    expect(armed.sort()).toEqual(
      [
        'deleteCustomer',
        'deleteDO',
        'deleteExpedition',
        'deleteFleet',
        'deleteItem',
        'deletePO',
        'deleteSO',
        'deleteSupplier',
      ].sort()
    );
  });
});
