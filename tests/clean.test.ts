import { describe, it } from 'node:test';
import { expect } from './expect';
import {
  cleanBranchOperations,
  decimalPlaces,
  isMissing,
  matchVocabulary,
  normalizeQuarter,
  parseCsv,
  parseNumber,
} from '../src/data/clean';
import { REGIONS } from '../src/data/types';
import { rawCsv } from './helpers';

const HEADER =
  'record_id,quarter,region,branch_name,service_tier,active_clients,new_clients,churned_clients,revenue_usd,support_tickets,avg_resolution_hrs';

describe('parseCsv', () => {
  it('handles CRLF and a missing final newline without leaking \\r into values', () => {
    const p = parseCsv('a,b\r\n1,2\r\n3,4.2');
    expect(p.lineEnding).toBe('CRLF');
    expect(p.trailingNewline).toBe(false);
    expect(p.rows.map((r) => r.cells)).toEqual([
      ['1', '2'],
      ['3', '4.2'],
    ]);
  });

  it('handles quoted fields, escaped quotes, a BOM and blank lines', () => {
    const p = parseCsv('﻿name,note\n"Hub, East","say ""hi"""\n\nx,y\n');
    expect(p.hadBom).toBe(true);
    expect(p.header).toEqual(['name', 'note']);
    expect(p.rows.map((r) => r.cells)).toEqual([
      ['Hub, East', 'say "hi"'],
      ['x', 'y'],
    ]);
    expect(p.blankLines).toEqual([3]);
  });
});

describe('field normalisers', () => {
  it('matches vocabulary case- and whitespace-insensitively', () => {
    expect(matchVocabulary('north', REGIONS)).toBe('North');
    expect(matchVocabulary(' WEST ', REGIONS)).toBe('West');
    expect(matchVocabulary('East', REGIONS)).toBeNull();
  });
  it('normalises quarter spellings', () => {
    expect(normalizeQuarter('2025-Q1')).toBe('2025-Q1');
    expect(normalizeQuarter('2025 q2')).toBe('2025-Q2');
    expect(normalizeQuarter('2025Q3')).toBe('2025-Q3');
    expect(normalizeQuarter('2025-Q4')).toBeNull(); // not in this dataset's range
    expect(normalizeQuarter('Q1')).toBeNull();
  });
  it('recognises missing-value tokens and parses numbers strictly', () => {
    for (const t of ['N/A', 'n/a', '', ' ', 'NULL', '-', 'NaN']) expect(isMissing(t)).toBe(true);
    expect(isMissing('0')).toBe(false);
    expect(parseNumber('6')).toBe(6);
    expect(parseNumber('6.0')).toBe(6);
    expect(parseNumber('N/A')).toBeNull();
    expect(parseNumber('1,200')).toBeNull();
    expect(decimalPlaces('6')).toBe(0);
    expect(decimalPlaces('6.0')).toBe(1);
  });
});

describe('cleanBranchOperations on the real file', () => {
  const result = cleanBranchOperations(rawCsv());
  const byId = (id: number) => result.records.find((r) => r.recordId === id)!;

  it('keeps all 16 rows and rejects none', () => {
    expect(result.source.dataRows).toBe(16);
    expect(result.records).toHaveLength(16);
    expect(result.rejected).toEqual([]);
  });

  it('canonicalises region casing', () => {
    expect(byId(102).region).toBe('North');
    expect(byId(106).region).toBe('West');
    expect(new Set(result.records.map((r) => r.region))).toEqual(new Set(['North', 'South', 'West']));
    const issue = result.issues.find((i) => i.id === 'region-casing')!;
    expect(issue.recordIds).toEqual([102, 106]);
  });

  it('stores N/A resolution time as null, not zero, and keeps the row', () => {
    expect(byId(106).avgResolutionHrs).toBeNull();
    expect(byId(106).revenueUsd).toBe(141000);
    expect(result.issues.find((i) => i.id === 'missing-resolution-time')!.recordIds).toEqual([106]);
  });

  it('parses "6" and "6.0" alike and reports the precision drift', () => {
    expect(byId(114).avgResolutionHrs).toBe(6);
    expect(result.issues.find((i) => i.id === 'precision-avg_resolution_hrs')!.recordIds).toEqual([114]);
  });

  it('does not leak the CRLF into the last column', () => {
    expect(byId(101).avgResolutionHrs).toBe(4.2);
    expect(result.issues.find((i) => i.id === 'file-format')!.detail).toMatch(/CRLF/);
  });

  it('reports the incomplete Q3 without imputing it', () => {
    const missing = result.coverage.filter((c) => c.recordId === null);
    expect(missing.map((c) => `${c.quarter} ${c.region} ${c.tier}`)).toEqual([
      '2025-Q3 South Standard',
      '2025-Q3 West Standard',
    ]);
    // derivable from the Q2 flow, offered as reference only
    expect(missing.map((c) => c.derivableActiveClients)).toEqual([292, 309]);
    expect(result.records.filter((r) => r.quarter === '2025-Q3')).toHaveLength(4);
    const issue = result.issues[0]!;
    expect(issue.id).toBe('missing-segments-2025-Q3');
    expect(issue.severity).toBe('high');
  });

  it('passes the logic checks and fails only the coverage check', () => {
    const failed = result.checks.filter((c) => !c.passed).map((c) => c.id);
    expect(failed).toEqual(['full-coverage']);
    expect(result.checks.find((c) => c.id === 'flow-identity')!.detail).toMatch(/10 of 10/);
  });
});

describe('cleanBranchOperations on bad input', () => {
  it('rejects rows it cannot place, and says why', () => {
    const csv = [
      HEADER,
      '1,2025-Q1,East,X,Standard,10,1,1,100,1,1.0',
      '2,2025-Q1,North,Oakridge Hub,Gold,10,1,1,100,1,1.0',
      '3,2025-Q1,North,Oakridge Hub,Standard,ten,1,1,100,1,1.0',
      '4,2025-Q1,North,Oakridge Hub,Standard,10,1,1,100',
      '5,2025-Q1,North,Oakridge Hub,Standard,10,1,1,100,1,1.0',
    ].join('\n');
    const r = cleanBranchOperations(csv);
    expect(r.records.map((x) => x.recordId)).toEqual([5]);
    expect(r.rejected.map((x) => x.reason)).toEqual([
      'unrecognised region "East"',
      'unrecognised service_tier "Gold"',
      'active_clients "ten" is not a number (required)',
      'expected 11 fields, found 9',
    ]);
    expect(r.issues.some((i) => i.id === 'rejected-rows')).toBe(true);
  });

  it('drops duplicate rows, keeping the first, and flags them', () => {
    const row = (id: number) => `${id},2025-Q1,North,Oakridge Hub,Standard,10,1,1,100,1,1.0`;
    const r = cleanBranchOperations([HEADER, row(1), row(1), row(2)].join('\n'));
    expect(r.records.map((x) => x.recordId)).toEqual([1]);
    expect(r.issues.find((i) => i.id === 'duplicates')!.recordIds).toEqual([1, 2]);
  });

  it('trims whitespace and reports it', () => {
    const r = cleanBranchOperations(`${HEADER}\n1, 2025-Q1 ,North,  Oakridge Hub ,Standard,10,1,1,100,1,1.0`);
    expect(r.records[0]!.branchName).toBe('Oakridge Hub');
    expect(r.issues.some((i) => i.id === 'whitespace')).toBe(true);
  });

  it('fails loudly when a required column is missing', () => {
    expect(() => cleanBranchOperations('record_id,quarter\n1,2025-Q1')).toThrow(/missing required column/);
  });
});
