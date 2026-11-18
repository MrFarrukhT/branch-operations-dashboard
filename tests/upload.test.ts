import { describe, it } from 'node:test';
import { expect } from './expect';
import { load, rawCsv, read } from './helpers';
import { cleanBranchOperations } from '../src/data/clean';
import { DICT } from '../src/lib/i18n';

const d = DICT.en as unknown as Record<string, unknown>;
const words = (k: string) => d[k];
const result = cleanBranchOperations(rawCsv(), 'branch_operations_2025.csv');
const records = result.records;

describe('upload data', () => {
  it('a good CSV goes through the build\'s cleaner', async () => {
    const up = await load('../src/data/upload');
    expect(typeof up.parseUpload).toBe('function');
    const r = await up.parseUpload('mine.csv', new TextEncoder().encode(rawCsv()).buffer);
    expect(r.ok).toBe(true);
    expect(r.dataset.records).toEqual(records);
    expect(r.dataset.issues.map((x: { id: string }) => x.id)).toEqual(result.issues.map((x) => x.id));
    expect(r.dataset.fileName).toBe('mine.csv');
  });

  it('a bad file is refused with a clear English reason', async () => {
    const up = await load('../src/data/upload');
    expect(typeof up.parseUpload).toBe('function');
    const enc = (s: string) => new TextEncoder().encode(s).buffer;
    const noCol = await up.parseUpload('x.csv', enc('record_id,quarter,region\n1,2025-Q1,North\n'));
    expect(noCol.ok).toBe(false);
    expect(/missing.*column/i.test(noCol.error)).toBe(true);
    const [head, ...rows] = rawCsv().split(/\r?\n/);
    const badRegion = await up.parseUpload('x.csv', enc([head, rows[0]!.replace('North', 'Atlantis'), ...rows.slice(1)].join('\n')));
    expect(badRegion.ok).toBe(false);
    expect(/region.*Atlantis/i.test(badRegion.error)).toBe(true);
    const badNumber = await up.parseUpload('x.csv', enc([head, rows[0]!.replace(/,(\d+),/, ',lots,'), ...rows.slice(1)].join('\n')));
    expect(badNumber.ok).toBe(false);
    expect(/not a number/i.test(badNumber.error)).toBe(true);
    const wrongType = await up.parseUpload('x.pdf', enc('%PDF'));
    expect(wrongType.ok).toBe(false);
    expect(/\.csv or \.xlsx/.test(wrongType.error)).toBe(true);
    const empty = await up.parseUpload('x.csv', enc(''));
    expect(empty.ok).toBe(false);
  });

  it('an .xlsx goes through the same cleaner', async () => {
    const XLSX = await import('xlsx');
    const parsed = rawCsv().trim().split(/\r?\n/).map((l) => l.split(','));
    const aoa = parsed.map((row, r) => (r === 0 ? row : row.map((v) => (/^\d+(\.\d+)?$/.test(v) ? Number(v) : v))));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1');
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const up = await load('../src/data/upload');
    expect(typeof up.parseUpload).toBe('function');
    const r = await up.parseUpload('mine.xlsx', bytes);
    expect(r.ok).toBe(true);
    expect(r.dataset.records.length).toBe(16);
    expect(r.dataset.records.find((x: { recordId: number }) => x.recordId === 106).avgResolutionHrs).toBe(null);
    expect(r.dataset.fileName).toBe('mine.xlsx');
  });

  it('the upload is kept, a new one replaces it, «Use sample data» forgets it', async () => {
    const up = await load('../src/data/upload');
    expect(typeof up.parseUpload).toBe('function');
    const store = up.memoryStore();
    expect(await up.loadSaved(store)).toBe(null);
    const enc = (s: string) => new TextEncoder().encode(s).buffer;
    const first = await up.parseUpload('a.csv', enc(rawCsv()));
    await up.saveUpload(store, first.dataset);
    const back = await up.loadSaved(store);
    expect(back.fileName).toBe('a.csv');
    expect(back.records).toEqual(records);
    const [head, ...rows] = rawCsv().trim().split(/\r?\n/);
    const second = await up.parseUpload('b.csv', enc([head, ...rows.slice(0, 6)].join('\n')));
    await up.saveUpload(store, second.dataset);
    expect((await up.loadSaved(store)).records.length).toBe(6);
    await up.forgetUpload(store);
    expect(await up.loadSaved(store)).toBe(null);
  });

  it('the page has the buttons and names the data in use; xlsx is loaded only when needed', () => {
    expect(words('uploadData')).toBe('Upload data');
    expect(words('useSample')).toBe('Use sample data');
    const all = ['src/App.tsx', 'src/components/UploadData.tsx'].map((f) => { try { return read(f); } catch { return ''; } }).join('\n');
    expect(all.includes('accept=".csv,.xlsx')).toBe(true);
    const upload = read('src/data/upload.ts');
    expect(upload.includes("import('xlsx')")).toBe(true);
    expect(/^import .*from 'xlsx'/m.test(upload)).toBe(false);
    expect(upload.includes('cleanBranchOperations')).toBe(true);
    expect(upload.includes('indexedDB')).toBe(true);
  });
});
