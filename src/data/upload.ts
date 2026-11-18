/**
 * «Upload data»: a visitor's .csv or .xlsx becomes the page's dataset through THE SAME cleaner the
 * build runs on the sample (cleanBranchOperations in ./clean), so the KPIs, charts, filters, table and data-quality section all
 * recompute from it. An .xlsx is turned into CSV text first (its first sheet), with SheetJS loaded only then.
 *
 * A file is refused, with one plain English reason and nothing changed, when it is not .csv / .xlsx, is empty or too large,
 * lacks a required column, has no data rows, or has any row the cleaner cannot use (an unknown quarter, region or tier, a
 * required number that is not a number).
 *
 * The accepted upload is kept in the browser (IndexedDB) as its CSV text and file name, and cleaned again on the next visit;
 * a new upload replaces it, «Use sample data» forgets it. The storage sits behind DatasetStore so a test can use memory.
 */
import { EXPECTED_COLUMNS, cleanBranchOperations } from './clean';
import { QUARTERS, REGIONS, TIERS, type Dataset } from './types';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** An accepted upload: the dataset the page shows, and the CSV text it was cleaned from (what is stored). */
export interface UploadedDataset extends Dataset {
  origin: 'upload';
  csv: string;
}

export type UploadResult = { ok: true; dataset: UploadedDataset } | { ok: false; error: string };

const fail = (error: string): UploadResult => ({ ok: false, error });

/** Read a chosen file (its name and bytes) into a dataset, or say plainly why not. */
export async function parseUpload(fileName: string, bytes: ArrayBuffer): Promise<UploadResult> {
  const kind = /\.csv$/i.test(fileName) ? 'csv' : /\.xlsx$/i.test(fileName) ? 'xlsx' : null;
  if (!kind) return fail('Please choose a .csv or .xlsx file.');
  if (bytes.byteLength === 0) return fail('The file is empty.');
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return fail('The file is larger than 5 MB.');

  let csv: string;
  if (kind === 'csv') {
    csv = new TextDecoder('utf-8').decode(bytes);
  } else {
    try {
      csv = await xlsxToCsv(bytes);
    } catch {
      return fail('The .xlsx file could not be opened. Save it again from Excel, or export it as .csv.');
    }
  }
  return datasetFromCsv(csv, fileName);
}

/** The first sheet of a workbook as CSV text; SheetJS is loaded here, on the first .xlsx, not with the page. */
export async function xlsxToCsv(bytes: ArrayBuffer): Promise<string> {
  const XLSX = await import('xlsx');
  const book = XLSX.read(new Uint8Array(bytes), { type: 'array' });
  const first = book.SheetNames[0];
  if (!first) throw new Error('no sheet');
  return XLSX.utils.sheet_to_csv(book.Sheets[first]!, { blankrows: false, rawNumbers: true });
}

/** CSV text through the build's cleaner; refused when a column is missing, no row is there, or any row cannot be used. */
export function datasetFromCsv(csv: string, fileName: string): UploadResult {
  if (csv.trim() === '') return fail('The file is empty.');
  let result: ReturnType<typeof cleanBranchOperations>;
  try {
    result = cleanBranchOperations(csv, fileName);
  } catch (e) {
    const m = /missing required column\(s\): (.*)$/.exec(e instanceof Error ? e.message : '');
    return fail(
      m
        ? `The file is missing ${m[1]!.includes(',') ? 'these columns' : 'this column'}: ${m[1]}. It needs: ${EXPECTED_COLUMNS.join(', ')}.`
        : 'The file could not be read as a table.',
    );
  }
  if (result.rejected.length > 0) {
    const shown = result.rejected.slice(0, 3).map((r) => `row ${r.line}: ${plainReason(r.reason)}`);
    const more = result.rejected.length > 3 ? `; and ${result.rejected.length - 3} more` : '';
    const vocabulary = result.rejected.some((r) => r.reason.startsWith('unrecognised'))
      ? ` Quarters must be ${QUARTERS.join(', ')}; regions ${REGIONS.join(', ')}; tiers ${TIERS.join(' or ')}.`
      : '';
    const n = result.rejected.length;
    return fail(`${n === 1 ? 'One row' : `${n} rows`} could not be used (${shown.join('; ')}${more}).${vocabulary}`);
  }
  if (result.records.length === 0) return fail('The file has a header but no data rows.');
  return { ok: true, dataset: { ...result, fileName, origin: 'upload', csv } };
}

/** The cleaner's reason in the page's words: «unrecognised service_tier "Gold"» → «unknown service tier "Gold"». */
export function plainReason(reason: string): string {
  return reason
    .replace(/^unrecognised /, 'unknown ')
    .replace(/\b([a-z]+(?:_[a-z]+)+)\b/g, (m) => m.replace(/_/g, ' '))
    .replace(/ \(required\)$/, '');
}

// ---------------------------------------------------------------------------------------------------------------------------
// Keeping the upload in the browser

export interface SavedUpload {
  fileName: string;
  csv: string;
  savedAt: string;
}

/** Where the upload is kept. IndexedDB on the page; memory in the tests. */
export interface DatasetStore {
  get(): Promise<SavedUpload | null>;
  put(value: SavedUpload): Promise<void>;
  clear(): Promise<void>;
}

export function memoryStore(): DatasetStore {
  let value: SavedUpload | null = null;
  return {
    get: async () => value,
    put: async (v) => {
      value = v;
    },
    clear: async () => {
      value = null;
    },
  };
}

const DB = 'bi-demo';
const STORE = 'uploads';
const KEY = 'current';

/** One record in one object store of the page's own database. */
export function indexedDbStore(idb: IDBFactory | undefined = globalThis.indexedDB): DatasetStore {
  const open = () =>
    new Promise<IDBDatabase>((resolve, reject) => {
      if (!idb) return reject(new Error('no storage'));
      const req = idb.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  const run = async <T,>(mode: IDBTransactionMode, act: (s: IDBObjectStore) => IDBRequest<T>) => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = act(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  };
  return {
    get: async () => ((await run('readonly', (s) => s.get(KEY))) as SavedUpload | undefined) ?? null,
    put: async (v) => {
      await run('readwrite', (s) => s.put(v, KEY));
    },
    clear: async () => {
      await run('readwrite', (s) => s.delete(KEY));
    },
  };
}

/** The kept upload, cleaned again by today's cleaner; null when there is none or it no longer passes (then it is forgotten). */
export async function loadSaved(store: DatasetStore): Promise<UploadedDataset | null> {
  const saved = await store.get();
  if (!saved) return null;
  const r = datasetFromCsv(saved.csv, saved.fileName);
  if (r.ok) return r.dataset;
  await store.clear();
  return null;
}

/** Keep an accepted upload, replacing any earlier one. */
export async function saveUpload(store: DatasetStore, dataset: UploadedDataset, now = new Date()): Promise<void> {
  await store.put({ fileName: dataset.fileName, csv: dataset.csv, savedAt: now.toISOString() });
}

/** «Use sample data»: forget the upload. */
export async function forgetUpload(store: DatasetStore): Promise<void> {
  await store.clear();
}
