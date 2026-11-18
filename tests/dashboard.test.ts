import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect } from './expect';
import { load, rawCsv, read } from './helpers';
import { cleanBranchOperations } from '../src/data/clean';
import { computeKpis, summarize, NO_FILTERS, applyFilters } from '../src/lib/metrics';
import { formatUsdCompact } from '../src/lib/format';
import { DICT, makeI18n } from '../src/lib/i18n';
import { readFiltersFromUrl } from '../src/lib/url-state';

const i = makeI18n('en');
const d = DICT.en as unknown as Record<string, unknown>;
const words = (k: string) => d[k];
const result = cleanBranchOperations(rawCsv(), 'branch_operations_2025.csv');
const records = result.records;
const kpis = computeKpis(records);

describe('summary table on a tablet', () => {
  it('(a) the four KPI columns follow the descriptive ones, in the KPI cards\' order', async () => {
    const { columnsFor } = (await load('../src/components/SummaryTable')) as {
      columnsFor?: (x: typeof i) => { key: string }[];
    };
    expect(typeof columnsFor).toBe('function');
    const keys = columnsFor!(i).map((c) => c.key);
    expect(keys.slice(0, 9)).toEqual(['label', 'quarter', 'region', 'branch', 'tier', 'revenue', 'retention', 'activeClients', 'resolution']);
    expect(keys.slice(9, 12)).toEqual(['newClients', 'churnedClients', 'tickets']);
  });

  it('(b) a right-edge fade and a scroll line while the table can still scroll right, gone at the end', async () => {
    const mod = (await load('../src/components/SummaryTable')) as {
      canScrollRight?: (el: { scrollLeft: number; clientWidth: number; scrollWidth: number }) => boolean;
    };
    expect(typeof mod.canScrollRight).toBe('function');
    expect(mod.canScrollRight!({ scrollLeft: 0, clientWidth: 780, scrollWidth: 1100 })).toBe(true);
    expect(mod.canScrollRight!({ scrollLeft: 320, clientWidth: 780, scrollWidth: 1100 })).toBe(false);
    expect(mod.canScrollRight!({ scrollLeft: 319.5, clientWidth: 780, scrollWidth: 1100 })).toBe(false);
    expect(mod.canScrollRight!({ scrollLeft: 0, clientWidth: 1300, scrollWidth: 1300 })).toBe(false);
    expect(words('scrollHint')).toBe('Scroll sideways for more columns →');
    const src = read('src/components/SummaryTable.tsx');
    for (const s of ['data-scroll-fade', 'data-scroll-hint', 'onScroll=', 'ResizeObserver', 'pointer-events-none', 'to-surface']) {
      expect(src.includes(s) ? s : `SummaryTable.tsx lacks ${s}`).toBe(s);
    }
  });
});

describe('phone sort', () => {
  it('a native «Sort by» select over the same sort state, its six options, the phone subtitle points at it', async () => {
    const mod = (await load('../src/components/SummaryTable')) as { PHONE_SORTS?: { label: string; sort: unknown }[] };
    expect(Array.isArray(mod.PHONE_SORTS)).toBe(true);
    expect(mod.PHONE_SORTS!.map((o) => o.label)).toEqual([
      'Original order',
      'Revenue (high → low)',
      'Retention (high → low)',
      'Active clients (high → low)',
      'Resolution time (low → high)',
      'Quarter (A → Z)',
    ]);
    expect(mod.PHONE_SORTS!.map((o) => o.sort)).toEqual([
      null,
      { key: 'revenue', dir: 'desc' },
      { key: 'retention', dir: 'desc' },
      { key: 'activeClients', dir: 'desc' },
      { key: 'resolution', dir: 'asc' },
      { key: 'quarter', dir: 'asc' },
    ]);
    expect(words('sortBy')).toBe('Sort by');
    expect(String(words('tableSubPhone')).endsWith('Use “Sort by” to reorder.')).toBe(true);
    const src = read('src/components/SummaryTable.tsx');
    expect(/<NativeSelect[\s\S]{0,400}min-h-11/.test(src)).toBe(true);
    expect(src.includes('data-phone-sort')).toBe(true);
  });
});

describe('partial-quarter axis label', () => {
  it('the partial tick is two lines and the axis is tall enough for both', async () => {
    const mod = (await load('../src/components/TrendCard')) as {
      QuarterTick?: (p: object) => unknown;
      QUARTER_AXIS_HEIGHT?: number;
    };
    expect(typeof mod.QuarterTick).toBe('function');
    const svg = renderToStaticMarkup(
      createElement('svg', null,
        createElement(mod.QuarterTick as never, {
          x: 50,
          y: 0,
          payload: { value: '2025-Q3' },
          data: [{ quarter: '2025-Q3', partial: true, reported: 4, expected: 6 }],
          theme: { ink2: '#000', muted: '#666', warn: '#e3261b' },
          label: i.quarterShort,
        }),
      ),
    );
    const lines = [...svg.matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map((m) => m[1]);
    expect(lines.join('|').includes('4 of 6')).toBe(true);
    expect(lines.includes('segments')).toBe(true);
    expect(svg.includes('4 of 6 segments')).toBe(false);
    // three lines of 12 px type from y = 12, 15 px apart, need about 48 px under the axis line
    expect((mod.QUARTER_AXIS_HEIGHT ?? 0) >= 48).toBe(true);
  });
});

describe('sticky filter bar', () => {
  it('is solid and one row when stuck, the switch and reset folded into the chips row', () => {
    const src = read('src/components/FilterBar.tsx');
    expect(src.includes('backdrop-blur')).toBe(false);
    expect(/bg-page\/\d+/.test(src)).toBe(false);
    expect(src.includes(' bg-page ')).toBe(true);
    expect(src.includes('lg:flex-nowrap')).toBe(true);
    expect(src.includes('data-filter-row')).toBe(true);
  });
});

describe('KPI names and dollar precision', () => {
  it('the cards are named as the brief names them, one label for active clients', () => {
    expect(words('kpiRevenue')).toBe('Total Revenue (USD)');
    expect(words('kpiRetention')).toBe('Average Client Retention Rate');
    expect(words('kpiActive')).toBe('Total Active Clients');
    expect(words('kpiResolution')).toBe('Average Resolution Time');
    expect('kpiActiveNow' in d).toBe(false);
    expect(read('src/components/KpiGrid.tsx').includes('kpiActiveNow')).toBe(false);
  });

  it('compact dollars keep fixed precision: $1.30M, $1.06M, never $1.3M', () => {
    expect(formatUsdCompact(1_300_000)).toBe('$1.30M');
    expect(formatUsdCompact(1_060_000)).toBe('$1.06M');
    expect(formatUsdCompact(12_000)).toBe('$12.0K');
    expect(formatUsdCompact(245_000)).toBe('$245K');
    expect(formatUsdCompact(3_460_000)).toBe('$3.46M');
  });

  it('the exact revenue line is under the card on every filter', async () => {
    const { KpiGrid } = await load('../src/components/KpiGrid');
    const html = (revenueChange: { quarter: '2025-Q2'; previous: '2025-Q1'; change: number } | null) =>
      renderToStaticMarkup(
        createElement(KpiGrid, {
          kpis,
          quartersInView: ['2025-Q1', '2025-Q2', '2025-Q3'],
          latestComplete: { quarter: '2025-Q2', activeClients: 1282 },
          revenueChange,
        }),
      ).replace(/<[^>]+>/g, ' '); // the text a reader sees, not a title attribute
    expect(html(null).includes('$3,460,000')).toBe(true);
    expect(html({ quarter: '2025-Q2', previous: '2025-Q1', change: 0.077 }).includes('$3,460,000')).toBe(true);
  });
});

describe('plain-language labels', () => {
  it('«Resolution (hrs)», «Color theme», no column names in the definitions, the formula on one line', () => {
    expect(DICT.en.col.resolution).toBe('Resolution (hrs)');
    expect(DICT.en.theme).toBe('Color theme');
    const defs = JSON.stringify(DICT.en.defs);
    expect(defs.includes('revenue_usd')).toBe(false);
    expect(defs.includes('avg_resolution_hrs')).toBe(false);
    expect(defs.includes('average resolution hours')).toBe(true);
    expect(DICT.en.defs.some(([, b]) => b.includes('(active − churned) ÷ active'))).toBe(true);
  });
});

describe('retention', () => {
  it('the card leads with the client-weighted rate, the simple mean beneath it', async () => {
    const { KpiGrid } = await load('../src/components/KpiGrid');
    const html = renderToStaticMarkup(
      createElement(KpiGrid, { kpis, quartersInView: ['2025-Q1', '2025-Q2', '2025-Q3'], latestComplete: null, revenueChange: null }),
    );
    const card = html.slice(html.indexOf('Average Client Retention Rate'));
    const value = /<dd[^>]*>([^<]+)<\/dd>/.exec(card)?.[1];
    expect(value).toBe(i.n.pct(kpis.weightedRetention));
    expect(card.includes('Client-weighted')).toBe(true);
    expect(/Simple mean of 16 records[^%]*94\.0%/.test(card.replace(/<[^>]+>/g, ''))).toBe(true);
  });

  it('the segment chart\'s retention axis does not start at 0, and says so', async () => {
    const mod = (await load('../src/components/SegmentCard')) as {
      retentionAxis?: (values: number[]) => { domain: [number, number]; ticks: number[] };
    };
    expect(typeof mod.retentionAxis).toBe('function');
    const a = mod.retentionAxis!([0.912, 0.95, 0.97]);
    expect(a.domain).toEqual([0.89, 1]);
    expect(a.ticks[0]! >= 0.89 && a.ticks[a.ticks.length - 1] === 1).toBe(true);
    expect(typeof words('axisNotZero')).toBe('function');
    expect((words('axisNotZero') as (s: string) => string)('89%')).toBe('Axis starts at 89%, not 0.');
  });
});

describe('phone layout', () => {
  it('the failed check wraps, the record count shows once, the segment chart keeps value labels', async () => {
    const dq = read('src/components/DataQuality.tsx');
    expect(dq.includes('truncate')).toBe(false);
    const fb = read('src/components/FilterBar.tsx');
    // the panel's count is for the wide bar only; the phone reads it in the folded row
    expect(/aria-live="polite" className="[^"]*(hidden|sr-only)/.test(fb)).toBe(true);
    const mod = (await load('../src/components/SegmentCard')) as { segmentLabelMode?: (w: number, bars: number) => string };
    expect(typeof mod.segmentLabelMode).toBe('function');
    expect(mod.segmentLabelMode!(340, 6)).toBe('compact');
    expect(mod.segmentLabelMode!(520, 6)).toBe('full');
  });
});

describe('CSV export', () => {
  it('retention to 4 decimals and a total row like the table\'s', async () => {
    const mod = (await load('../src/components/SummaryTable')) as {
      columnsFor: (x: typeof i) => { key: string }[];
      toCsv: (cols: unknown[], rows: unknown[], k?: unknown, x?: unknown) => string;
    };
    expect(typeof mod.columnsFor === 'function' && mod.toCsv.length >= 3).toBe(true);
    const csv = mod.toCsv(mod.columnsFor(i), summarize(records, 'record'), kpis, i).trim().split('\n');
    const header = csv[0]!.split(',');
    const at = header.indexOf('Retention');
    const values = csv.slice(1).map((l) => l.split(',')[at]!);
    expect(values.every((v) => /^(0|1)(\.\d{1,4})?$/.test(v))).toBe(true);
    expect(values.includes('0.9097') || values.some((v) => v.length === 6)).toBe(true);
    const last = csv[csv.length - 1]!.split(',');
    expect(last[0]).toBe('Total');
    expect(last[header.indexOf('Revenue')]).toBe('3460000');
  });
});

describe('URL state', () => {
  it('region, quarter, tier and complete-only are read back from the address', () => {
    const f = readFiltersFromUrl('?region=North&quarter=2025-Q1,2025-Q2&tier=Standard&lfl=1');
    expect(f).toEqual({ regions: ['North'], quarters: ['2025-Q1', '2025-Q2'], tiers: ['Standard'], likeForLike: true });
    expect(read('src/lib/url-state.ts').includes("set('quarter', f.quarters)")).toBe(true);
    expect(read('src/lib/url-state.ts').includes("set('tier', f.tiers)")).toBe(true);
    expect(applyFilters(records, { ...NO_FILTERS, ...f }).rows.length > 0).toBe(true);
  });
});

describe('data-quality summaries', () => {
  it('every finding has a one-line summary: what, how many rows, what was done; no column names or record ids', () => {
    for (const issue of result.issues as unknown as { id: string; summary?: string }[]) {
      const s = issue.summary ?? '';
      expect(s.length > 20 && s.length <= 150 ? issue.id : `${issue.id}: «${s}» (${s.length})`).toBe(issue.id);
      expect(/_|#\d|record \d|\n/.test(s) ? `${issue.id}: «${s}»` : issue.id).toBe(issue.id);
    }
  });

  it('the section shows the summaries, not the long found / handled / why text, and the README links the full report', () => {
    const dq = read('src/components/DataQuality.tsx');
    expect(dq.includes('.summary')).toBe(true);
    for (const s of ['.rationale', '.handling', 't.why', 't.handled']) expect(dq.includes(s) ? `DataQuality.tsx still shows ${s}` : s).toBe(s);
    const readme = read('README.md');
    expect(readme.includes('## Data cleaning')).toBe(true);
    expect(readme.includes('docs/DATA_QUALITY.md')).toBe(true);
  });
});
