/**
 * KPI and aggregation maths. Pure and UI-free so it can be unit tested.
 *
 * Definitions (see README "KPI definitions"):
 *  - Total revenue           = Σ revenue_usd
 *  - Avg retention (spec)    = mean over rows of (active − churned) / active
 *  - Retention, weighted     = Σ(active − churned) / Σ active
 *  - Total active clients    = Σ active_clients
 *  - Avg resolution (spec)   = mean of avg_resolution_hrs over rows that have a value
 *  - Resolution, weighted    = Σ(hrs × tickets) / Σ tickets over rows that have a value
 */
import {
  QUARTERS,
  REGIONS,
  TIERS,
  type BranchRecord,
  type Quarter,
  type Region,
  type Tier,
} from '../data/types';

export interface Filters {
  /** An empty list means "all". */
  regions: Region[];
  quarters: Quarter[];
  tiers: Tier[];
  /** Keep only segments reported in every quarter in view. */
  likeForLike: boolean;
}

export const NO_FILTERS: Filters = { regions: [], quarters: [], tiers: [], likeForLike: false };

export const selected = <T extends string>(chosen: T[], all: readonly T[]): T[] =>
  chosen.length === 0 ? [...all] : all.filter((v) => chosen.includes(v));

export const segmentOf = (r: Pick<BranchRecord, 'region' | 'serviceTier'>) => `${r.region} · ${r.serviceTier}`;

export function retentionRate(r: BranchRecord): number | null {
  return r.activeClients > 0 ? (r.activeClients - r.churnedClients) / r.activeClients : null;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface FilterResult {
  rows: BranchRecord[];
  /** Rows matching the dimension filters but removed by the like-for-like rule. */
  excluded: BranchRecord[];
  /** Quarters / regions / tiers in view after resolving "all". */
  quarters: Quarter[];
  regions: Region[];
  tiers: Tier[];
}

export function applyFilters(records: BranchRecord[], f: Filters): FilterResult {
  const quarters = selected(f.quarters, QUARTERS);
  const regions = selected(f.regions, REGIONS);
  const tiers = selected(f.tiers, TIERS);
  const matching = records.filter(
    (r) => quarters.includes(r.quarter) && regions.includes(r.region) && tiers.includes(r.serviceTier),
  );
  if (!f.likeForLike) return { rows: matching, excluded: [], quarters, regions, tiers };

  const complete = new Set(
    [...new Set(matching.map(segmentOf))].filter((seg) =>
      quarters.every((q) => matching.some((r) => r.quarter === q && segmentOf(r) === seg)),
    ),
  );
  return {
    rows: matching.filter((r) => complete.has(segmentOf(r))),
    excluded: matching.filter((r) => !complete.has(segmentOf(r))),
    quarters,
    regions,
    tiers,
  };
}

export interface Kpis {
  recordCount: number;
  totalRevenue: number;
  /** Spec definition: simple mean of per-row rates. */
  avgRetention: number | null;
  /** Client-weighted: Σ(active − churned) / Σ active. */
  weightedRetention: number | null;
  totalActiveClients: number;
  /** Spec definition: simple mean over rows that have a value. */
  avgResolutionHrs: number | null;
  /** Ticket-weighted mean over rows that have a value. */
  weightedResolutionHrs: number | null;
  /** Rows left out of the resolution average because the value is missing. */
  resolutionMissing: number;
  totalTickets: number;
  newClients: number;
  churnedClients: number;
}

export function computeKpis(rows: BranchRecord[]): Kpis {
  const rates = rows.map(retentionRate).filter((x): x is number => x !== null);
  const active = sum(rows.map((r) => r.activeClients));
  const churned = sum(rows.map((r) => r.churnedClients));
  const timed = rows.filter((r) => r.avgResolutionHrs !== null);
  const timedTickets = sum(timed.map((r) => r.supportTickets));
  return {
    recordCount: rows.length,
    totalRevenue: sum(rows.map((r) => r.revenueUsd)),
    avgRetention: mean(rates),
    weightedRetention: active > 0 ? (active - churned) / active : null,
    totalActiveClients: active,
    avgResolutionHrs: mean(timed.map((r) => r.avgResolutionHrs!)),
    weightedResolutionHrs:
      timedTickets > 0 ? sum(timed.map((r) => r.avgResolutionHrs! * r.supportTickets)) / timedTickets : null,
    resolutionMissing: rows.length - timed.length,
    totalTickets: sum(rows.map((r) => r.supportTickets)),
    newClients: sum(rows.map((r) => r.newClients)),
    churnedClients: churned,
  };
}

/** Per-quarter coverage of the segments in view (before like-for-like). */
export interface QuarterCoverage {
  quarter: Quarter;
  expected: number;
  reported: number;
  missing: string[];
}

/**
 * Which segments are missing per quarter in the current view. "Expected" is
 * every region × tier the filters allow that the dataset has in any quarter.
 */
export function coverageInView(records: BranchRecord[], f: Filters): QuarterCoverage[] {
  const { rows, excluded, quarters, regions, tiers } = applyFilters(records, { ...f, likeForLike: false });
  const all = [...rows, ...excluded];
  const known = new Set(records.map(segmentOf));
  const expectedSegments = regions.flatMap((r) => tiers.map((t) => `${r} · ${t}`)).filter((s) => known.has(s));
  return quarters.map((quarter) => {
    const present = new Set(all.filter((r) => r.quarter === quarter).map(segmentOf));
    return {
      quarter,
      expected: expectedSegments.length,
      reported: present.size,
      missing: expectedSegments.filter((s) => !present.has(s)),
    };
  });
}

export interface TrendPoint {
  quarter: Quarter;
  revenue: Record<Tier, number>;
  activeClients: Record<Tier, number>;
  totalRevenue: number;
  totalActiveClients: number;
  reported: number;
  expected: number;
  partial: boolean;
}

/**
 * Totals per quarter, split by tier. A quarter is `partial` when it is missing
 * segments the view expects; in a like-for-like view the expectation is the set
 * of segments actually kept, so no quarter is partial by construction.
 */
export function quarterlyTrend(rows: BranchRecord[], coverage: QuarterCoverage[], likeForLike = false): TrendPoint[] {
  const keptSegments = new Set(rows.map(segmentOf)).size;
  return coverage.map((c) => {
    const q = rows.filter((r) => r.quarter === c.quarter);
    const byTier = (pick: (r: BranchRecord) => number) =>
      Object.fromEntries(TIERS.map((t) => [t, sum(q.filter((r) => r.serviceTier === t).map(pick))])) as Record<Tier, number>;
    const reported = new Set(q.map(segmentOf)).size;
    return {
      quarter: c.quarter,
      revenue: byTier((r) => r.revenueUsd),
      activeClients: byTier((r) => r.activeClients),
      totalRevenue: sum(q.map((r) => r.revenueUsd)),
      totalActiveClients: sum(q.map((r) => r.activeClients)),
      reported,
      expected: likeForLike ? keptSegments : c.expected,
      partial: likeForLike ? reported < keptSegments : c.reported < c.expected,
    };
  });
}

export type SegmentMetric = 'revenue' | 'activeClients' | 'retention' | 'resolution';

export interface SegmentPoint {
  region: Region;
  values: Record<Tier, number | null>;
  /** Quarters actually present per tier, to flag segments with gaps. */
  quarterCount: Record<Tier, number>;
}

export function metricOf(k: Kpis, metric: SegmentMetric): number | null {
  switch (metric) {
    case 'revenue':
      return k.recordCount ? k.totalRevenue : null;
    case 'activeClients':
      return k.recordCount ? k.totalActiveClients : null;
    case 'retention':
      return k.avgRetention;
    case 'resolution':
      return k.avgResolutionHrs;
  }
}

export function segmentBreakdown(rows: BranchRecord[], regions: Region[], metric: SegmentMetric): SegmentPoint[] {
  return regions.map((region) => {
    const values = {} as Record<Tier, number | null>;
    const quarterCount = {} as Record<Tier, number>;
    for (const tier of TIERS) {
      const seg = rows.filter((r) => r.region === region && r.serviceTier === tier);
      values[tier] = metricOf(computeKpis(seg), metric);
      quarterCount[tier] = new Set(seg.map((r) => r.quarter)).size;
    }
    return { region, values, quarterCount };
  });
}

export type GroupBy = 'record' | 'quarter' | 'region' | 'tier' | 'segment';

export interface SummaryRow {
  key: string;
  label: string;
  /** Present only for record-level rows. */
  record?: BranchRecord;
  quarter: string;
  region: string;
  branch: string;
  tier: string;
  records: number;
  activeClients: number;
  newClients: number;
  churnedClients: number;
  retention: number | null;
  revenue: number;
  tickets: number;
  resolution: number | null;
}

const ORDER = {
  quarter: (v: string) => QUARTERS.indexOf(v as Quarter),
  region: (v: string) => REGIONS.indexOf(v as Region),
  tier: (v: string) => TIERS.indexOf(v as Tier),
};

export function summarize(rows: BranchRecord[], groupBy: GroupBy): SummaryRow[] {
  if (groupBy === 'record') {
    return rows.map((r) => ({
      key: String(r.recordId),
      label: `#${r.recordId}`,
      record: r,
      quarter: r.quarter,
      region: r.region,
      branch: r.branchName,
      tier: r.serviceTier,
      records: 1,
      activeClients: r.activeClients,
      newClients: r.newClients,
      churnedClients: r.churnedClients,
      retention: retentionRate(r),
      revenue: r.revenueUsd,
      tickets: r.supportTickets,
      resolution: r.avgResolutionHrs,
    }));
  }
  const keyOf = (r: BranchRecord) =>
    groupBy === 'quarter' ? r.quarter : groupBy === 'region' ? r.region : groupBy === 'tier' ? r.serviceTier : segmentOf(r);
  const groups = new Map<string, BranchRecord[]>();
  for (const r of rows) groups.set(keyOf(r), [...(groups.get(keyOf(r)) ?? []), r]);
  const distinct = (rs: BranchRecord[], pick: (r: BranchRecord) => string, noun: string) => {
    const values = [...new Set(rs.map(pick))];
    return values.length === 1 ? values[0]! : `${values.length} ${noun}`;
  };
  const out: SummaryRow[] = [...groups.entries()].map(([key, rs]) => {
    const k = computeKpis(rs);
    return {
      key,
      label: key,
      quarter: distinct(rs, (r) => r.quarter, 'quarters'),
      region: distinct(rs, (r) => r.region, 'regions'),
      branch: distinct(rs, (r) => r.branchName, 'branches'),
      tier: distinct(rs, (r) => r.serviceTier, 'tiers'),
      records: rs.length,
      activeClients: k.totalActiveClients,
      newClients: k.newClients,
      churnedClients: k.churnedClients,
      retention: k.avgRetention,
      revenue: k.totalRevenue,
      tickets: k.totalTickets,
      resolution: k.avgResolutionHrs,
    };
  });
  return out.sort(
    (a, b) =>
      ORDER.quarter(a.quarter) - ORDER.quarter(b.quarter) ||
      ORDER.region(a.region) - ORDER.region(b.region) ||
      ORDER.tier(a.tier) - ORDER.tier(b.tier),
  );
}

export type SortKey = Exclude<keyof SummaryRow, 'record' | 'key'>;
export interface Sort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

/** Stable sort; nulls always last; dimension columns sort in business order, not alphabetically. */
export function sortRows(rows: SummaryRow[], sort: Sort | null): SummaryRow[] {
  if (!sort) return rows;
  const dir = sort.dir === 'asc' ? 1 : -1;
  const rank = (row: SummaryRow): number | string | null => {
    const v = row[sort.key];
    if (v === null || v === undefined) return null;
    if (sort.key === 'quarter' || sort.key === 'region' || sort.key === 'tier') {
      const i = ORDER[sort.key](String(v));
      return i === -1 ? String(v) : i;
    }
    if (sort.key === 'label' && row.record) return row.record.recordId;
    return v as number | string;
  };
  return rows
    .map((row, i) => ({ row, i, v: rank(row) }))
    .sort((a, b) => {
      if (a.v === null && b.v === null) return a.i - b.i;
      if (a.v === null) return 1;
      if (b.v === null) return -1;
      const cmp =
        typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v));
      return cmp * dir || a.i - b.i;
    })
    .map((x) => x.row);
}

/**
 * The latest quarter whose rows cover every segment shown anywhere in the view,
 * with its active-client total: a head count that is safe to quote.
 */
export function latestCompleteQuarter(rows: BranchRecord[]): { quarter: Quarter; activeClients: number } | null {
  const segments = new Set(rows.map(segmentOf));
  for (const quarter of [...QUARTERS].reverse()) {
    const q = rows.filter((r) => r.quarter === quarter);
    if (q.length > 0 && new Set(q.map(segmentOf)).size === segments.size) {
      return { quarter, activeClients: sum(q.map((r) => r.activeClients)) };
    }
  }
  return null;
}

/**
 * The revenue card's ▲/▼: the last complete quarter against the complete quarter before it, on
 * the segments present in both. Null when the view leaves fewer than two complete quarters (e.g. quarter = Q3 alone).
 */
export function lastCompleteRevenueChange(
  rows: BranchRecord[],
): { quarter: Quarter; previous: Quarter; change: number } | null {
  const segments = new Set(rows.map(segmentOf));
  const complete = QUARTERS.filter((quarter) => {
    const q = rows.filter((r) => r.quarter === quarter);
    return q.length > 0 && new Set(q.map(segmentOf)).size === segments.size;
  });
  if (complete.length < 2) return null;
  const quarter = complete[complete.length - 1]!;
  const previous = complete[complete.length - 2]!;
  const inQ = (q: Quarter) => rows.filter((r) => r.quarter === q);
  const both = new Set(inQ(previous).map(segmentOf));
  const shared = new Set(inQ(quarter).map(segmentOf).filter((s) => both.has(s)));
  const revenue = (q: Quarter) => sum(inQ(q).filter((r) => shared.has(segmentOf(r))).map((r) => r.revenueUsd));
  const before = revenue(previous);
  if (!(before > 0)) return null;
  return { quarter, previous, change: revenue(quarter) / before - 1 };
}
