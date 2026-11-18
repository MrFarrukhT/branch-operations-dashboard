/**
 * The sample dataset, produced at build time by `pnpm data` (scripts/build-data.ts) from data/raw/branch_operations_2025.csv.
 * The page starts from it; a visitor's upload (src/data/upload.ts) replaces it through DatasetProvider, cleaned by the same code.
 */
import clean from '../../data/clean/branch_operations_2025.json';
import report from '../../data/clean/data_quality_report.json';
import type { BranchRecord, CleanResult, Dataset } from './types';

export const sampleDataset: Dataset = {
  records: clean.records as BranchRecord[],
  issues: report.issues as CleanResult['issues'],
  checks: report.checks as CleanResult['checks'],
  coverage: report.coverage as CleanResult['coverage'],
  rejected: report.rejected as CleanResult['rejected'],
  source: report.source as CleanResult['source'],
  fileName: report.source.file,
  origin: 'sample',
};

/** Issues that touched a given record, for the table's row notes. */
export function issuesByRecord(issues: CleanResult['issues']): Map<number, CleanResult['issues']> {
  const map = new Map<number, CleanResult['issues']>();
  for (const issue of issues) {
    for (const id of issue.recordIds) map.set(id, [...(map.get(id) ?? []), issue]);
  }
  return map;
}
