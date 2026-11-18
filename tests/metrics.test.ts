import { describe, it } from 'node:test';
import { expect } from './expect';
import { cleanBranchOperations } from '../src/data/clean';
import {
  NO_FILTERS,
  applyFilters,
  computeKpis,
  coverageInView,
  latestCompleteQuarter,
  quarterlyTrend,
  segmentBreakdown,
  sortRows,
  summarize,
  type Filters,
} from '../src/lib/metrics';
import { rawCsv } from './helpers';

// Expected values below were computed independently (Python over the raw CSV),
// not by this code.
const { records } = cleanBranchOperations(rawCsv());
const view = (f: Partial<Filters>) => applyFilters(records, { ...NO_FILTERS, ...f });

describe('KPIs, no filters', () => {
  const k = computeKpis(view({}).rows);
  it('total revenue', () => expect(k.totalRevenue).toBe(3_460_000));
  it('total active clients', () => expect(k.totalActiveClients).toBe(3_273));
  it('average retention = simple mean of row rates', () => expect(k.avgRetention).toBeCloseTo(0.94032191, 8));
  it('client-weighted retention', () => expect(k.weightedRetention).toBeCloseTo(0.93217232, 8));
  it('average resolution excludes N/A instead of counting it as zero', () => {
    expect(k.avgResolutionHrs).toBeCloseTo(4.98, 10); // 74.7 / 15, not 74.7 / 16
    expect(k.resolutionMissing).toBe(1);
  });
  it('ticket-weighted resolution', () => expect(k.weightedResolutionHrs).toBeCloseTo(5.66035565, 8));
});

describe('filters', () => {
  it('quarter filter', () => {
    const k = computeKpis(view({ quarters: ['2025-Q2'] }).rows);
    expect(k.recordCount).toBe(6);
    expect(k.totalRevenue).toBe(1_246_000);
    expect(k.totalActiveClients).toBe(1_282);
    expect(k.avgRetention).toBeCloseTo(0.93771737, 8);
    expect(k.avgResolutionHrs).toBeCloseTo(5.23333333, 8);
  });
  it('region filter picks up the re-cased rows', () => {
    const k = computeKpis(view({ regions: ['West'] }).rows);
    expect(k.recordCount).toBe(5); // includes record 106 ("WEST")
    expect(k.totalRevenue).toBe(1_249_000);
    expect(k.avgResolutionHrs).toBeCloseTo(4.85, 10);
  });
  it('combined filters, multi-select', () => {
    const rows = view({ regions: ['North', 'South'], tiers: ['Enterprise'], quarters: ['2025-Q1', '2025-Q3'] }).rows;
    expect(rows.map((r) => r.recordId)).toEqual([101, 103, 113, 115]);
  });
  it('a filter that matches nothing gives empty KPIs, not NaN', () => {
    const k = computeKpis(view({ regions: ['South'], tiers: ['Standard'], quarters: ['2025-Q3'] }).rows);
    expect(k.recordCount).toBe(0);
    expect(k.totalRevenue).toBe(0);
    expect(k.avgRetention).toBeNull();
    expect(k.weightedRetention).toBeNull();
    expect(k.avgResolutionHrs).toBeNull();
  });
});

describe('like-for-like', () => {
  it('keeps only segments reported in every quarter in view', () => {
    const v = view({ likeForLike: true });
    expect(v.rows).toHaveLength(12);
    expect(v.excluded.map((r) => r.recordId)).toEqual([104, 106, 110, 112]);
    const k = computeKpis(v.rows);
    expect(k.totalRevenue).toBe(2_907_000);
    expect(k.avgRetention).toBeCloseTo(0.95003294, 8);
  });
  it('is a no-op when only complete quarters are in view', () => {
    expect(view({ likeForLike: true, quarters: ['2025-Q1', '2025-Q2'] }).excluded).toEqual([]);
  });
  it('turns the reported Q3 revenue dip into the real like-for-like growth', () => {
    const asReported = quarterlyTrend(view({}).rows, coverageInView(records, NO_FILTERS));
    expect(asReported.map((p) => p.totalRevenue)).toEqual([1_157_000, 1_246_000, 1_057_000]);
    expect(asReported.map((p) => p.partial)).toEqual([false, false, true]);
    const lfl = quarterlyTrend(view({ likeForLike: true }).rows, coverageInView(records, NO_FILTERS), true);
    expect(lfl.map((p) => p.totalRevenue)).toEqual([888_000, 962_000, 1_057_000]);
    expect(lfl.map((p) => p.partial)).toEqual([false, false, false]);
  });
});

describe('coverage and trend', () => {
  it('flags Q3 as partial (4 of 6) only while the missing segments are in view', () => {
    const all = coverageInView(records, NO_FILTERS);
    expect(all.map((c) => [c.quarter, c.reported, c.expected])).toEqual([
      ['2025-Q1', 6, 6],
      ['2025-Q2', 6, 6],
      ['2025-Q3', 4, 6],
    ]);
    expect(all[2]!.missing).toEqual(['South · Standard', 'West · Standard']);
    const enterprise = coverageInView(records, { ...NO_FILTERS, tiers: ['Enterprise'] });
    expect(enterprise.every((c) => c.reported === c.expected)).toBe(true);
  });
  it('splits the trend by tier', () => {
    const t = quarterlyTrend(view({}).rows, coverageInView(records, NO_FILTERS));
    expect(t[2]!.partial).toBe(true);
    expect(t[0]!.revenue).toEqual({ Enterprise: 733_000, Standard: 424_000 });
    expect(t[2]!.activeClients).toEqual({ Enterprise: 431, Standard: 350 });
  });
  it('latest complete quarter is Q2 as reported, Q3 like-for-like', () => {
    expect(latestCompleteQuarter(view({}).rows)).toEqual({ quarter: '2025-Q2', activeClients: 1_282 });
    expect(latestCompleteQuarter(view({ likeForLike: true }).rows)).toEqual({ quarter: '2025-Q3', activeClients: 781 });
  });
});

describe('segment breakdown', () => {
  it('sums revenue per region × tier and counts quarters present', () => {
    const s = segmentBreakdown(view({}).rows, ['West'], 'revenue');
    expect(s[0]!.values).toEqual({ Enterprise: 960_000, Standard: 289_000 });
    expect(s[0]!.quarterCount).toEqual({ Enterprise: 3, Standard: 2 });
  });
  it('resolution for a segment whose only value is N/A is null', () => {
    const s = segmentBreakdown(view({ quarters: ['2025-Q1'] }).rows, ['West'], 'resolution');
    expect(s[0]!.values.Standard).toBeNull();
    expect(s[0]!.values.Enterprise).toBe(4.5);
  });
});

describe('summary table', () => {
  it('groups by region with KPI-consistent maths', () => {
    const rows = summarize(view({}).rows, 'region');
    expect(rows.map((r) => [r.label, r.records, r.revenue])).toEqual([
      ['North', 6, 1_303_000],
      ['South', 5, 908_000],
      ['West', 5, 1_249_000],
    ]);
    expect(rows[2]!.resolution).toBeCloseTo(4.85, 10);
  });
  it('sorts numerically, puts nulls last both ways, and sorts quarters in calendar order', () => {
    const rows = summarize(view({ quarters: ['2025-Q1'] }).rows, 'record');
    const asc = sortRows(rows, { key: 'resolution', dir: 'asc' });
    const desc = sortRows(rows, { key: 'resolution', dir: 'desc' });
    expect(asc.map((r) => r.key)).toEqual(['103', '101', '105', '102', '104', '106']);
    expect(desc.map((r) => r.key)).toEqual(['104', '102', '105', '101', '103', '106']);
    const byQuarter = sortRows(summarize(view({}).rows, 'quarter'), { key: 'quarter', dir: 'desc' });
    expect(byQuarter.map((r) => r.label)).toEqual(['2025-Q3', '2025-Q2', '2025-Q1']);
  });
});
