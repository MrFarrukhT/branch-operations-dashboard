import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const rawCsv = () => readFileSync(resolve(ROOT, 'data/raw/branch_operations_2025.csv'), 'utf8');
export const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

/** Imports a module, or returns an empty object if it fails to load, so a missing export fails on an assertion instead. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const load = async (path: string): Promise<any> => {
  try {
    return await import(path);
  } catch {
    return {};
  }
};
