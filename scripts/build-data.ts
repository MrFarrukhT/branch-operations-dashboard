/**
 * data/raw/branch_operations_2025.csv
 *   -> data/clean/branch_operations_2025.json   (clean, typed records)
 *   -> data/clean/data_quality_report.json      (issues, checks, coverage)
 *   -> docs/DATA_QUALITY.md                      (the same report, readable)
 *
 * Run with `pnpm data`. `pnpm build` and `pnpm dev` run it first, and a test
 * fails if the committed outputs drift from what the cleaner produces.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanBranchOperations } from '../src/data/clean';
import { renderDataQualityMarkdown } from '../src/data/report';
import { toCleanJson, toReportJson } from '../src/data/outputs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'branch_operations_2025.csv';

const csv = readFileSync(resolve(root, 'data/raw', SOURCE), 'utf8');
const result = cleanBranchOperations(csv, SOURCE);

mkdirSync(resolve(root, 'data/clean'), { recursive: true });
mkdirSync(resolve(root, 'docs'), { recursive: true });
writeFileSync(resolve(root, 'data/clean/branch_operations_2025.json'), toCleanJson(result));
writeFileSync(resolve(root, 'data/clean/data_quality_report.json'), toReportJson(result));
writeFileSync(resolve(root, 'docs/DATA_QUALITY.md'), renderDataQualityMarkdown(result));

console.log(
  `cleaned ${result.records.length}/${result.source.dataRows} rows · ` +
    `${result.issues.length} issues · ${result.checks.filter((c) => !c.passed).length} failed checks`,
);
