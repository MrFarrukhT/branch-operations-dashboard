import { AvButton } from './ui/controls';
import { AvadaWordmark } from './ui/logo';
import { useEffect, useMemo, useState } from 'react';
import { DatasetProvider } from './data/DatasetContext';
import { sampleDataset } from './data/dataset';
import { QUARTERS, type BranchRecord, type Dataset } from './data/types';
import {
  applyFilters,
  computeKpis,
  coverageInView,
  lastCompleteRevenueChange,
  latestCompleteQuarter,
  quarterlyTrend,
  segmentBreakdown,
  segmentOf,
  type Filters,
  type SegmentMetric,
} from './lib/metrics';
import { CHART_THEME, useTheme, type ThemePreference } from './lib/theme';
import { readFiltersFromUrl, writeFiltersToUrl } from './lib/url-state';
import { CoverageNotice, type QuarterComparison } from './components/CoverageNotice';
import { DataQuality } from './components/DataQuality';
import { FilterBar } from './components/FilterBar';
import { KpiGrid } from './components/KpiGrid';
import { SegmentCard } from './components/SegmentCard';
import { SummaryTable } from './components/SummaryTable';
import { TrendCard } from './components/TrendCard';
import { UploadData } from './components/UploadData';
import { Card, Icon, Segmented } from './components/ui';
import { useI18n } from './lib/i18n';

/**
 * The page waits for the browser's kept upload (if any) before its first paint, so a returning visitor never sees the sample
 * flash first; with nothing kept, or no storage, it shows the sample.
 */
export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  useEffect(() => {
    let live = true;
    import('./data/upload')
      .then((up) => up.loadSaved(up.indexedDbStore()))
      .catch(() => null)
      .then((saved) => live && setDataset(saved ?? sampleDataset));
    return () => {
      live = false;
    };
  }, []);
  if (!dataset) return <div className="min-h-screen" aria-busy="true" />;
  return (
    <DatasetProvider value={dataset}>
      <Dashboard dataset={dataset} onDataset={setDataset} />
    </DatasetProvider>
  );
}

function Dashboard({ dataset, onDataset }: { dataset: Dataset; onDataset: (d: Dataset) => void }) {
  const { records, issues } = dataset;
  const { preference, resolved, setPreference } = useTheme();
  const i = useI18n();
  const { t } = i;
  const theme = CHART_THEME[resolved];
  const [filters, setFilters] = useState<Filters>(() => readFiltersFromUrl());
  const [metric, setMetric] = useState<SegmentMetric>('revenue');

  useEffect(() => writeFiltersToUrl(filters), [filters]);

  const view = useMemo(() => applyFilters(records, filters), [records, filters]);
  const kpis = useMemo(() => computeKpis(view.rows), [view]);
  const coverage = useMemo(() => coverageInView(records, filters), [records, filters]);
  const trend = useMemo(() => quarterlyTrend(view.rows, coverage, filters.likeForLike), [view, coverage, filters.likeForLike]);
  const segments = useMemo(() => segmentBreakdown(view.rows, view.regions, metric), [view, metric]);
  const latestComplete = useMemo(() => latestCompleteQuarter(view.rows), [view]);
  const revenueChange = useMemo(() => lastCompleteRevenueChange(view.rows), [view]);
  const partial = coverage.filter((c) => c.reported < c.expected && c.reported > 0);
  const comparison = useMemo(() => compareLastPartial(records, filters, partial.map((p) => p.quarter)), [records, filters, partial]);
  const excludedSegments = [...new Set(view.excluded.map(segmentOf))];
  const empty = view.rows.length === 0;

  return (
    <div className="min-h-screen pb-[env(safe-area-inset-bottom)] md:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
        {t.skip}
      </a>

      {/* Top bar: the Avada wordmark on a hairline rule */}
      <div className="border-b border-line">
        <div className="mx-auto flex h-12 max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-6">
          <a href="https://avada.uz" className="tap inline-flex items-center text-ink" aria-label="Avada">
            <AvadaWordmark className="h-[15px] w-auto" aria-hidden />
          </a>
          <span className="border border-line-strong px-2 py-px font-mono text-[11px] font-medium tracking-[0.04em] text-muted uppercase">{t.sample}</span>
        </div>
      </div>

      <header className="mx-auto flex max-w-[1320px] flex-wrap items-end justify-between gap-x-4 gap-y-3 px-4 pt-6 pb-3 sm:px-6 sm:pt-10 sm:pb-5">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] font-medium tracking-[0.06em] text-muted uppercase">
            <span aria-hidden className="inline-block size-2 bg-signal" />
            {t.eyebrow}
          </p>
          <h1 className="mt-2 font-display text-[28px] leading-[1.05] font-semibold tracking-[-0.03em] text-ink sm:text-[44px]">{t.title}</h1>
          <p className="mt-1 hidden text-[14px] text-muted sm:block">
            {t.subtitle(i.quarter(QUARTERS[0]), i.quarter(QUARTERS[QUARTERS.length - 1]!))}
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-2">
          <a href="#data-quality" className="tap inline-flex items-center gap-1.5 text-[13px] font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
            {Icon.info('size-3.5')}
            {t.dqLink(issues.length)}
          </a>
          <Segmented<ThemePreference>
            label={t.theme}
            size="bar"
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'system', label: <>{Icon.monitor('size-3.5')}<span className="sr-only">{t.themeSystem}</span></>, title: t.themeSystemTitle },
              { value: 'light', label: <>{Icon.sun('size-3.5')}<span className="sr-only">{t.themeLight}</span></>, title: t.themeLight },
              { value: 'dark', label: <>{Icon.moon('size-3.5')}<span className="sr-only">{t.themeDark}</span></>, title: t.themeDark },
            ]}
          />
        </div>
      </header>

      <UploadData dataset={dataset} onDataset={onDataset} />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        shown={view.rows.length}
        total={records.length}
        excludedByLikeForLike={view.excluded.length}
      />

      <main id="main" className="mx-auto max-w-[1320px] space-y-4 px-4 pt-4 pb-10 sm:px-6 sm:pt-5">
        <CoverageNotice
          partial={partial}
          likeForLike={filters.likeForLike}
          excluded={view.excluded.length}
          excludedSegments={excludedSegments}
          comparison={comparison}
          onLikeForLike={(on) => setFilters({ ...filters, likeForLike: on })}
        />

        <KpiGrid kpis={kpis} quartersInView={view.quarters} latestComplete={latestComplete} revenueChange={revenueChange} />

        {empty ? (
          <EmptyState records={records} filters={filters} onReset={() => setFilters({ regions: [], quarters: [], tiers: [], likeForLike: false })} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <TrendCard trend={trend} coverage={coverage} tiers={view.tiers} theme={theme} likeForLike={filters.likeForLike} />
              <SegmentCard points={segments} tiers={view.tiers} quarters={view.quarters} metric={metric} onMetric={setMetric} theme={theme} />
            </div>
            <SummaryTable rows={view.rows} kpis={kpis} />
          </>
        )}

        <Definitions />
        <DataQuality />
      </main>

      <footer className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-6 text-[12.5px] text-muted sm:px-6">
        <p>
          <a href="https://avada.uz" className="tap inline-flex items-center font-medium text-ink-2 hover:underline">
            {t.builtBy} Avada
          </a>{' '}
          · avada.uz
        </p>
        <p className="break-all">{t.footerSource(dataset.fileName, records.length)}</p>
      </footer>

    </div>
  );
}

/** Revenue change into the latest partial quarter: as reported vs like-for-like. */
function compareLastPartial(records: BranchRecord[], filters: Filters, partialQuarters: string[]): QuarterComparison | null {
  const last = partialQuarters[partialQuarters.length - 1];
  if (!last) return null;
  const inView = applyFilters(records, { ...filters, likeForLike: false }).quarters;
  const previous = inView[inView.indexOf(last as (typeof inView)[number]) - 1];
  if (!previous) return null;
  const pair = { ...filters, quarters: [previous, last as typeof previous] };
  const revenue = (likeForLike: boolean, q: string) =>
    applyFilters(records, { ...pair, likeForLike })
      .rows.filter((r) => r.quarter === q)
      .reduce((s, r) => s + r.revenueUsd, 0);
  const change = (a: number, b: number) => (a > 0 ? b / a - 1 : null);
  const lfl = applyFilters(records, { ...pair, likeForLike: true });
  return {
    quarter: last,
    previous,
    reportedChange: change(revenue(false, previous), revenue(false, last)),
    likeForLikeChange: change(revenue(true, previous), revenue(true, last)),
    likeForLikeSegments: new Set(lfl.rows.map(segmentOf)).size,
  };
}

function EmptyState({ records, filters, onReset }: { records: BranchRecord[]; filters: Filters; onReset: () => void }) {
  const i = useI18n();
  const { t } = i;
  const gaps = coverageInView(records, filters).filter((c) => c.reported === 0 && c.missing.length > 0);
  return (
    <Card className="flex flex-col items-center px-6 py-14 text-center">
      <div className="flex size-11 items-center justify-center bg-surface-2 text-muted">{Icon.info('size-5')}</div>
      <h2 className="mt-4 text-[16px] font-semibold text-ink">{t.emptyTitle}</h2>
      <p className="mt-1.5 max-w-md text-[13.5px] text-muted">
        {gaps.length > 0
          ? t.emptyGaps(
              gaps.map((g) => ({ segs: i.list(g.missing.map(i.segment)), quarter: i.quarter(g.quarter) })),
              gaps.length === 1 && gaps[0]!.missing.length === 1,
            )
          : t.emptyWiden}
      </p>
      <AvButton
        type="button"
        onClick={onReset}
        className="tap mt-5 inline-flex items-center gap-1.5 bg-button px-3.5 py-2 text-[13px] font-semibold text-on-button hover:opacity-90"
      >
        {Icon.reset()}
        {t.resetFilters}
      </AvButton>
    </Card>
  );
}

function Definitions() {
  const { t } = useI18n();
  return (
    <details className="group border border-line bg-surface px-4 py-1 sm:px-5">
      <summary className="tap flex cursor-pointer list-none items-center py-2 text-[13.5px] font-semibold text-ink marker:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="text-muted transition-transform group-open:rotate-90">›</span>
          {t.defsTitle}
        </span>
      </summary>
      <dl className="mt-1 mb-3 grid gap-x-6 gap-y-3 text-[13px] leading-relaxed text-ink-2 md:grid-cols-2">
        {t.defs.map(([term, text], n) => (
          <div key={term} className={n === t.defs.length - 1 ? 'md:col-span-2' : undefined}>
            <dt className="font-semibold text-ink">{term}</dt>
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
