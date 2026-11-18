/**
 * The page's words, in English. The data-quality findings and checks show the cleaner's own English text.
 * Numbers go through lib/format.ts in English.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { IssueSeverity, Region, Tier } from '../data/types';
import * as F from './format';

export const LANGS = ['en'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';

const enS = (n: number, word: string, plural = `${word}s`) => (n === 1 ? word : plural);

const REGION: Record<Lang, Record<Region, string>> = {
  en: { North: 'North', South: 'South', West: 'West' },
};
const TIER: Record<Lang, Record<Tier, string>> = {
  en: { Enterprise: 'Enterprise', Standard: 'Standard' },
};

/** A label and the number after it stay on one line: a no-break space after the colon and inside the number. */
const keep = (sum: string) => `\u00a0${sum.replace(/ /g, '\u00a0')}`;
const qn = (q: string) => q.replace(/^\d{4}-Q/, '');
/** A formula that must not break across lines: its spaces made no-break. */
const nb = (s: string) => s.replace(/ /g, '\u00a0');

const en = {
  skip: 'Skip to dashboard',
  eyebrow: 'Operations dashboard',
  sample: 'Sample · demo data',
  title: 'Branch Operations 2025',
  subtitle: (from: string, to: string) =>
    `Revenue, client retention and support performance · ${from} to ${to} · 3 regions · 2 service tiers`,
  dqLink: (n: number) => `Data quality · ${n} ${enS(n, 'issue')}`,
  theme: 'Color theme',
  themeSystem: 'System',
  themeSystemTitle: 'Follow system',
  themeLight: 'Light',
  themeDark: 'Dark',
  builtBy: 'Made by',
  footerSource: (file: string, n: number) => `Source: ${file} · ${n} clean records · figures in USD`,
  // filters
  region: 'Region',
  quarter: 'Quarter',
  tier: 'Service tier',
  all: 'All',
  likeForLike: 'Complete data only',
  likeForLikeHelp: 'Keep only region and tier segments that were reported in every quarter in view, so quarters compare fairly.',
  resetFilters: 'Reset filters',
  shownOf: (shown: number, total: number) => ({ before: '', strong: String(shown), after: ` of ${total} records` }),
  setAside: (n: number) => `${n} set aside`,
  filters: 'Filters',
  filtersAll: 'all',
  filtersChosen: (n: number) => `${n} chosen`,
  filtersHide: 'Hide',
  // KPIs
  kpiAria: 'Key figures for the current filters',
  // the brief's names; one active-clients label whatever the quarters in view
  kpiRevenue: 'Total Revenue (USD)',
  kpiRetention: 'Average Client Retention Rate',
  kpiActive: 'Total Active Clients',
  kpiResolution: 'Average Resolution Time',
  records: (n: number) => `${n} ${enS(n, 'record')}`,
  sumOf: (records: string) => `Sum of ${records}`,
  /** The revenue card's ▲/▼ line: the last complete quarter against the one before. */
  vsPrev: (q: string, prev: string) => `Q${qn(q)} vs Q${qn(prev)}`,
  clientWeighted: 'Client-weighted',
  /** The retention card's second figure: the brief's simple mean, under the weighted rate. */
  simpleMean: (records: string) => `Simple mean of ${records}:`,
  clientQuarters: (n: number) => `Client-quarters across ${n} quarters`,
  clientQuartersSum: (sum: string, n: number) => `${n}-quarter sum:${keep(sum)}`,
  latestComplete: (q: string) => `Latest complete quarter (${q})`,
  inQuarter: (q: string, n: string, c: string) => `In ${q} · new ${n}, churned ${c}`,
  ticketWeighted: 'Ticket-weighted',
  resolutionMissing: (n: number) => `${n} ${enS(n, 'record')} without a value excluded, not counted as 0`,
  meanTickets: (records: string, tickets: string) => `Mean of ${records} · ${tickets} tickets`,
  // the notice
  lflView: 'Complete data only.',
  lflSetAside: (n: number, segs: string) =>
    `Only segments reported in every quarter in view are counted; ${n} ${enS(n, 'record')} (${segs}) set aside.`,
  lflNothing: 'Every segment in view is reported in every quarter in view, so nothing is set aside.',
  showAll: 'Show all reported data',
  incomplete: (q: string, r: number, e: number) => `${q} is incomplete: ${r} of ${e} segments reported.`,
  noDataFor: (segs: string) =>
    `No data for ${segs}, so its totals are not comparable with earlier quarters. Nothing has been estimated.`,
  change: (x: number, lang: Lang) => `${x >= 0 ? 'up' : 'down'} ${F.formatPct(Math.abs(x), 1, lang)}`,
  comparison: (q: string, prev: string, reported: string, segs: number, lfl: string) =>
    ({ before: `As reported, ${q} revenue is ${reported} on ${prev}; on the ${segs === 1 ? 'one segment' : `${segs} segments`} reported in both, it is `, strong: lfl, after: '.' }),
  compare: 'Show complete data only',
  and: ' and ',
  // trend
  trendTitle: 'Quarterly trend',
  trendSubLfl: 'Complete data only, split by service tier',
  trendSubAll: 'All reported data, split by service tier',
  revenue: 'Revenue',
  activeClients: 'Active clients',
  partialNote:
    'Hatched columns are partial quarters: some segments in view have no row there, so the column is lower partly because data is missing. To compare fairly, press “Show complete data only”.',
  /** The partial quarter's tick in two lines, so a narrow column does not cut it. */
  segmentsOfLines: (r: number, e: number) => [`${r} of ${e}`, 'segments'] as const,
  partialSr: (r: number, e: number) => `partial, ${r} of ${e} segments`,
  byQuarter: (title: string) => `${title} by quarter.`,
  partialTip: (r: number, e: number, missing: string) => `Partial: ${r} of ${e} segments. Missing ${missing}.`,
  total: 'Total',
  legend: 'Legend',
  // segments
  segTitle: 'Segment breakdown',
  segSub: (note: string) => `${note} by region and service tier`,
  measure: 'Measure',
  metric: {
    revenue: { label: 'Revenue', short: 'Revenue', note: 'Total revenue (USD)' },
    activeClients: { label: 'Active clients', short: 'Clients', note: 'Active clients, summed over quarters in view' },
    retention: { label: 'Retention', short: 'Retention', note: 'Average client retention rate' },
    resolution: { label: 'Resolution time', short: 'Resolution', note: 'Average resolution time (hours, lower is better)' },
  },
  segByRegion: (note: string) => `${note} by region.`,
  segGaps: (gaps: string, n: number, isSum: boolean) =>
    `${gaps} ${n === 1 ? 'does' : 'do'} not have a row in every quarter in view${isSum ? ', so their totals cover fewer quarters than the others.' : '; their average uses the quarters reported.'}`,
  quartersOf: (q: number, n: number) => `${q} of ${n} quarters`,
  axisNotZero: (from: string) => `Axis starts at ${from}, not 0.`,
  // table
  tableTitle: 'Summary',
  tableSub: 'Reflects the filters above. Select a column heading to sort.',
  tableSubPhone: 'Reflects the filters above. Use “Sort by” to reorder.',
  /** The phone's sort and the wide table's scroll hint. */
  sortBy: 'Sort by',
  sortOriginal: 'Original order',
  sortRevenue: 'Revenue (high → low)',
  sortRetention: 'Retention (high → low)',
  sortActive: 'Active clients (high → low)',
  sortResolution: 'Resolution time (low → high)',
  sortQuarter: 'Quarter (A → Z)',
  scrollHint: 'Scroll sideways for more columns →',
  groupBy: 'Group rows by',
  col: {
    label: 'Record', quarter: 'Quarter', region: 'Region', branch: 'Branch', tier: 'Tier', records: 'Records',
    activeClients: 'Active', newClients: 'New', churnedClients: 'Churned', retention: 'Retention', revenue: 'Revenue',
    tickets: 'Tickets', resolution: 'Resolution (hrs)',
  },
  group: { record: 'Records', quarter: 'Quarter', region: 'Region', tier: 'Tier', segment: 'Segment' },
  caption: (grouped: string | null, sorted: string | null) =>
    `Branch operations summary, ${grouped ? `grouped by ${grouped}` : 'one row per record'}${sorted ? `, sorted by ${sorted}` : ''}`,
  asc: 'ascending',
  desc: 'descending',
  cleaned: 'cleaned',
  showAllRows: 'Show all',
  /** The total's active-clients label over several quarters. */
  activeSum: (n: number) => `${n}-quarter sum`,
  /** The grey line under an average in the total row; the phone's «show all» count and its way back. */
  totalAvg: 'average',
  totalWeighted: 'client-weighted',
  moreRows: (n: number) => `${n} more`,
  showFewerRows: 'Show fewer',
  moreFigures: '4 more figures',
  count: (n: number, what: 'quarters' | 'regions' | 'branches' | 'tiers') => `${n} ${what}`,
  // empty
  emptyTitle: 'No records match these filters',
  emptyGaps: (gaps: { segs: string; quarter: string }[], one: boolean) =>
    `${gaps.map((g) => `${g.segs} in ${g.quarter}`).join('; ')} ${one ? 'was' : 'were'} never reported. The gap is in the source data, not the dashboard.`,
  emptyWiden: 'Try widening the region, quarter or tier selection.',
  // definitions
  defsTitle: 'How the figures are calculated',
  defs: [
    ['Total revenue', 'Sum of revenue over the filtered records, in US dollars.'],
    ['Average client retention', `The card shows the client-weighted rate, ${nb('Σ(active − churned) ÷ Σ active')}, so a large segment counts for more than a small one. Beneath it is the simple mean of each record's rate, ${nb('(active − churned) ÷ active')}.`],
    ['Active clients (sum)', 'Sum of active clients over the selected records. Active clients is a count at a point in time, so across several quarters the sum counts a client once per quarter (each quarter counted separately); the latest complete quarter is the head count to quote.'],
    ['Average resolution time', `Simple mean of the average resolution hours over records that have a value; a missing value is left out, never treated as zero. The ticket-weighted mean, ${nb('Σ(hours × tickets) ÷ Σ tickets')}, reflects what a typical ticket experienced.`],
    ['Complete data only', 'Keeps only region × tier segments that have a record in every quarter in view, so a quarter with missing segments no longer looks like a decline. Nothing is estimated in either view.'],
  ] as [string, string][],
  // data quality: one plain line per finding; the full report is docs/DATA_QUALITY.md
  dqTitle: 'Data quality',
  dqSub: (rows: number, file: string, n: number) =>
    `${rows} rows read from ${file}. ${n === 0 ? 'No issues found.' : `${n} ${enS(n, 'issue')} found and handled:`}`,
  checksPassed: (p: number, n: number) => `${p} of ${n} checks passed`,
  cleanJson: 'Cleaned data (JSON)',
  reportJson: 'Report (JSON)',
  severity: { high: 'High', medium: 'Medium', low: 'Low', info: 'Note' } as Record<IssueSeverity, string>,
  checksTitle: 'Validation checks',
  passed: 'passed',
  failed: 'failed',
  // upload
  uploadData: 'Upload data',
  useSample: 'Use sample data',
  dataSample: 'Sample data',
  dataYours: 'Your data',
  dataRows: (n: number) => `${n} ${enS(n, 'row')}`,
  uploadHelp: 'A .csv or .xlsx file with the same columns as the sample.',
  uploadReading: 'Reading the file…',
  uploadLoaded: (file: string, n: number) => `Loaded ${file}: ${n} ${enS(n, 'row')}.`,
  uploadFailed: 'This file was not loaded.',
  uploadUnreadable: 'The file could not be read.',
  uploadUnchanged: 'The dashboard has not changed.',
  sampleRestored: 'Back to the sample data.',
  dismiss: 'Dismiss',
};

export type Dict = typeof en;

export const DICT: Record<Lang, Dict> = { en };

export interface I18n {
  lang: Lang;
  t: Dict;
  /** Numbers in the page's language. */
  n: {
    usd: (v: number | null) => string;
    usdCompact: (v: number | null) => string;
    /** Axis ticks and bar labels. */
    usdAxis: (v: number | null) => string;
    int: (v: number | null) => string;
    pct: (v: number | null, digits?: number) => string;
    hours: (v: number | null, digits?: number) => string;
    /** a bare number, its unit in the header or axis */
    dec: (v: number | null, digits?: number) => string;
  };
  region: (r: string) => string;
  tier: (t: string) => string;
  /** 2025-Q3 → 2025-Q3 */
  quarter: (q: string) => string;
  /** 2025-Q3 → Q3 */
  quarterShort: (q: string) => string;
  /** «North · Enterprise» → «Shimol · Korporativ» */
  segment: (s: string) => string;
  /** A summary cell: a region, tier, quarter or «3 quarters» in the page's language. */
  cell: (v: string) => string;
  list: (xs: string[]) => string;
}

export function makeI18n(lang: Lang = DEFAULT_LANG): I18n {
  const t = DICT[lang];
  const region = (r: string) => REGION[lang][r as Region] ?? r;
  const tier = (x: string) => TIER[lang][x as Tier] ?? x;
  const quarter = (q: string) => {
    if (!/^\d{4}-Q\d$/.test(q)) return q;
    return q;
  };
  const quarterShort = (q: string) => `Q${qn(q)}`;
  const segment = (s: string) => s.split(' · ').map((p) => tier(region(p))).join(' · ');
  const cell = (v: string) => {
    const m = /^(\d+) (quarters|regions|branches|tiers)$/.exec(v);
    if (m) return t.count(Number(m[1]), m[2] as 'quarters');
    return segment(quarter(v));
  };
  return {
    lang,
    t,
    n: {
      usd: (v) => F.formatUsd(v, lang),
      usdCompact: (v) => F.formatUsdCompact(v, lang),
      usdAxis: (v) => (v === null ? F.DASH : F.formatUsdAxis(v, lang)),
      int: (v) => F.formatInt(v, lang),
      pct: (v, d = 1) => F.formatPct(v, d, lang),
      hours: (v, d = 1) => F.formatHours(v, d, lang),
      dec: (v, d = 1) => F.formatDecimal(v, d, lang),
    },
    region,
    tier,
    quarter,
    quarterShort,
    segment,
    cell,
    list: (xs) => xs.join(t.and),
  };
}

const Ctx = createContext<I18n>(makeI18n(DEFAULT_LANG));
export const useI18n = () => useContext(Ctx);

/** The page in English: html lang and the tab's title; a ?lang= left in an old link is dropped from the URL. */
export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = DEFAULT_LANG;
    document.title = DICT[DEFAULT_LANG].title;
    const p = new URLSearchParams(window.location.search);
    if (!p.has('lang')) return;
    p.delete('lang');
    const qs = p.toString().replace(/%2C/gi, ',');
    try {
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
    } catch {
      /* sandboxed hosts may forbid it */
    }
  }, []);
  const value = useMemo(() => makeI18n(DEFAULT_LANG), []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
