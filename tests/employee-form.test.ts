// ═══════════════════════════════════════════════════════════════════════════════
// One employee form (master-extras.js employeeForm) for Data Master › Karyawan
// and Penggajian (budget-gl-extras.js): both open the same fields, and saving
// from one keeps what the other set (allowances, phone, access department).
// ═══════════════════════════════════════════════════════════════════════════════
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';

const w = () => window as any;
const tick = (ms = 80) => new Promise(r => setTimeout(r, ms));
const val = (id: string) => document.getElementById(id) as HTMLInputElement;

beforeAll(async () => {
  w().openModal = (title: string, body: string, footer: string) => {
    document.getElementById('modal')!.innerHTML = `<h2>${title}</h2>${body}<div>${footer}</div>`;
  };
  w().closeModal = () => {
    document.getElementById('modal')!.innerHTML = '';
  };
  w().saveDB = () => {};
  w().showToast = () => {};
  w().navigate = () => {};
  w().activeView = 'finance';
  await import('../public/classic/core/master-extras.js');
  await import('../public/classic/core/budget-gl-extras.js');
});

beforeEach(() => {
  document.body.innerHTML =
    '<div id="modal"></div><div id="view-master"></div><div id="view-finance"></div>';
  w().DB = {
    employees: [
      {
        id: 'EMP001',
        name: 'Andi Wijaya',
        position: 'Sales',
        department: 'Penjualan',
        phone: '0812',
        email: 'andi@nusantara.local',
        status: 'Active',
        salary: 9000000,
      },
    ],
    payrollRuns: [],
    settings: { departments: [{ id: 'D1', name: 'Penjualan', role: 'sales' }] },
  };
});

const FIELDS = [
  'em-name',
  'em-pos',
  'em-dept',
  'em-status',
  'em-phone',
  'em-join',
  'em-email',
  'em-access',
  'em-salary',
  'em-trans',
  'em-meal',
];

describe('employee form', () => {
  it('is the same form from Karyawan and from Penggajian', async () => {
    w()._masterExtras.employeeForm(w().DB.employees[0]);
    FIELDS.forEach(id => expect(document.getElementById(id), id).toBeTruthy());
    const fromMaster = document.getElementById('modal')!.innerHTML;
    await tick(); // the Simpan listener is wired after 60 ms

    document.getElementById('modal')!.innerHTML = '';
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button data-action="editEmployee" data-id="EMP001" id="edit"></button>'
    );
    (document.getElementById('edit') as HTMLButtonElement).click();
    expect(document.getElementById('modal')!.innerHTML).toBe(fromMaster);
    await tick();
  });

  it('saves allowances and access department next to the profile, for either page', async () => {
    w()._masterExtras.employeeForm(w().DB.employees[0]);
    val('em-trans').value = '500000';
    val('em-meal').value = '300000';
    (document.getElementById('em-access') as unknown as HTMLSelectElement).value = 'D1';
    val('em-email').value = 'Andi@Nusantara.local ';
    await tick();
    (document.getElementById('saveEmpM') as HTMLButtonElement).click();
    const e = w().DB.employees[0];
    expect(e).toMatchObject({
      name: 'Andi Wijaya',
      phone: '0812',
      department: 'Penjualan',
      departmentId: 'D1',
      email: 'andi@nusantara.local',
      salary: 9000000,
      transportAllowance: 500000,
      mealAllowance: 300000,
    });
  });

  it('adds a new employee with the next number', async () => {
    w()._masterExtras.employeeForm(null);
    val('em-name').value = 'Sari';
    await tick();
    (document.getElementById('saveEmpM') as HTMLButtonElement).click();
    expect(w().DB.employees.map((x: any) => x.id)).toEqual(['EMP001', 'EMP002']);
  });
});
