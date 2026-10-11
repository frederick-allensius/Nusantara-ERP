// Optional integration check using Nusantara ERP's actual recap parser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as XLSX from '@e965/xlsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'docs/pitch/contoh-dokumen-supplier');
const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
const sandbox = { window: {}, Date };
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/classic/core/trading.js'), 'utf8'), sandbox);
const parse = sandbox.window.Trading.recapRowsFromWorkbook;
const cases = Object.fromEntries(manifest.test_cases.map(c => [c.case, c.trip_ids[0]]));
const summaries = [];
for (const version of [1, 2]) {
  let total = 0;
  for (const loc of ['CKD', 'SERANG']) {
    const filename = `REKAP NSA-${loc}${version === 2 ? ' (2)' : ''}.xlsx`;
    const workbook = XLSX.read(fs.readFileSync(path.join(out, filename)), { type: 'buffer', cellDates: true });
    const parsed = parse(workbook, XLSX);
    assert.equal(parsed.sheets.length, 4, 'Keempat material harus terbaca');
    const expected = manifest.trips.filter(r => r.location === loc && r.date <= manifest.snapshot_cutoffs[`v${version}`] && r.id !== cases.photo_without_excel);
    assert.equal(parsed.rows.length, expected.length, `${filename}: subtotal tidak boleh dihitung sebagai truk`);
    const byDo = new Map(parsed.rows.map(r => [r.doNo, r]));
    assert.equal(byDo.size, expected.length, 'Tidak boleh ada duplikat DO');
    for (const row of expected) {
      const got = byDo.get(String(row.do));
      assert.ok(got, `DO ${row.do} tidak terbaca`);
      let delta = row.id === cases.excel_vs_do_3_tons ? 3000 : 0;
      if (version === 2 && row.id === cases.billed_weight_changed) delta = 5000;
      assert.equal(got.date, row.date);
      assert.equal(got.poNumber, String(row.po));
      assert.equal(got.ticketNo, String(row.bap));
      assert.equal(got.sjNo, String(row.sj));
      assert.equal(got.vehicle, row.plate);
      assert.equal(got.driver, row.driver);
      assert.equal(got.itemName, row.material);
      assert.equal(got.customer, row.id === cases.wrong_location_remark ? 'BETON SERANG' : row.remark);
      assert.equal(got.gross, (row.gross_kg + delta) / 1000);
      assert.equal(got.tare, row.tare_kg / 1000);
      assert.equal(got.net, (row.net_kg + delta) / 1000);
    }
    total += parsed.rows.length;
    summaries.push({ filename, rows: parsed.rows.length, sheets: parsed.sheets.length });
  }
  assert.equal(total, manifest.counts[`excel_v${version}`]);
}
for (const photo of manifest.photos) {
  assert.equal(photo.fields.nomor_do, String(manifest.trips.find(r => r.id === photo.trip_id).do), 'Nomor DO foto harus cocok secara teks dengan nomor hasil parser');
}
console.log(JSON.stringify({ ok: true, parser: 'Trading.recapRowsFromWorkbook', workbooks: summaries }, null, 2));
