import { describe, it } from 'node:test';
import { expect } from './expect';
import { cleanBranchOperations } from '../src/data/clean';
import { toCleanJson, toReportJson } from '../src/data/outputs';
import { renderDataQualityMarkdown } from '../src/data/report';
import { rawCsv, read } from './helpers';

describe('committed outputs are fresh', () => {
  const result = cleanBranchOperations(rawCsv(), 'branch_operations_2025.csv');
  it('data/clean/branch_operations_2025.json matches the cleaner', () => {
    expect(read('data/clean/branch_operations_2025.json')).toBe(toCleanJson(result));
  });
  it('data/clean/data_quality_report.json matches the cleaner', () => {
    expect(read('data/clean/data_quality_report.json')).toBe(toReportJson(result));
  });
  it('docs/DATA_QUALITY.md matches the cleaner', () => {
    expect(read('docs/DATA_QUALITY.md')).toBe(renderDataQualityMarkdown(result));
  });
});
