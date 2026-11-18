import { AvButton, AvTable } from '../ui/controls';
import { NativeSelect } from '../ui/native-select';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDataset } from '../data/DatasetContext';
import { sortRows, summarize, type GroupBy, type Kpis, type Sort, type SortKey, type SummaryRow } from '../lib/metrics';
import { DICT, useI18n, type I18n } from '../lib/i18n';
import { METRIC_TOKEN, type MetricKey } from '../lib/theme';
import type { BranchRecord } from '../data/types';
import { Card, CardHeader, Icon, Segmented, cx } from './ui';

interface Props {
  rows: BranchRecord[];
  kpis: Kpis;
}

export interface Column {
  key: SortKey;
  label: string;
  numeric?: boolean;
  /** A KPI column wears its metric's colour. */
  metric?: MetricKey;
  render: (r: SummaryRow) => string;
  /** Hidden when grouping makes the column redundant. */
  hideWhen?: GroupBy[];
}

/** What a row is first, then the four KPI columns in the cards' order, then the rest, so a tablet shows
 * revenue without scrolling. */
export function columnsFor(i: I18n): Column[] {
  const c = i.t.col;
  const n = i.n;
  return [
    { key: 'label', label: c.label, render: (r) => i.cell(r.label) },
    { key: 'quarter', label: c.quarter, render: (r) => i.cell(r.quarter), hideWhen: ['quarter'] },
    { key: 'region', label: c.region, render: (r) => i.cell(r.region), hideWhen: ['region', 'segment'] },
    { key: 'branch', label: c.branch, render: (r) => i.cell(r.branch), hideWhen: ['quarter', 'tier'] },
    { key: 'tier', label: c.tier, render: (r) => i.cell(r.tier), hideWhen: ['tier', 'segment'] },
    { key: 'revenue', label: c.revenue, numeric: true, metric: 'revenue', render: (r) => n.usd(r.revenue) },
    { key: 'retention', label: c.retention, numeric: true, metric: 'retention', render: (r) => n.pct(r.retention) },
    { key: 'activeClients', label: c.activeClients, numeric: true, metric: 'activeClients', render: (r) => n.int(r.activeClients) },
    { key: 'resolution', label: c.resolution, numeric: true, metric: 'resolution', render: (r) => n.dec(r.resolution) },
    { key: 'newClients', label: c.newClients, numeric: true, render: (r) => n.int(r.newClients) },
    { key: 'churnedClients', label: c.churnedClients, numeric: true, render: (r) => n.int(r.churnedClients) },
    { key: 'tickets', label: c.tickets, numeric: true, render: (r) => n.int(r.tickets) },
    { key: 'records', label: c.records, numeric: true, render: (r) => String(r.records), hideWhen: ['record'] },
  ];
}

/** True while the table can still scroll right (a pixel of rounding allowed): the right-edge fade shows. */
export function canScrollRight(el: { scrollLeft: number; clientWidth: number; scrollWidth: number }): boolean {
  return el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

/** The phone's «Sort by»: the same sort state as the wide table's column headings. */
export const PHONE_SORTS: { label: string; sort: Sort | null }[] = [
  { label: DICT.en.sortOriginal, sort: null },
  { label: DICT.en.sortRevenue, sort: { key: 'revenue', dir: 'desc' } },
  { label: DICT.en.sortRetention, sort: { key: 'retention', dir: 'desc' } },
  { label: DICT.en.sortActive, sort: { key: 'activeClients', dir: 'desc' } },
  { label: DICT.en.sortResolution, sort: { key: 'resolution', dir: 'asc' } },
  { label: DICT.en.sortQuarter, sort: { key: 'quarter', dir: 'asc' } },
];

const GROUP_KEYS: GroupBy[] = ['record', 'quarter', 'region', 'tier', 'segment'];

const round = (v: number | null, digits: number) => (v === null ? null : Number(v.toFixed(digits)));

/** The table as shown, as CSV: raw values (not display strings) so it re-imports cleanly, retention to 4 decimals, and the
 * table's total row last. */
export function toCsv(columns: Column[], rows: SummaryRow[], kpis: Kpis, i?: I18n): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(',');
  const cell = (c: Column, r: SummaryRow) =>
    c.key === 'label' && r.record ? r.record.recordId : c.key === 'retention' ? round(r.retention, 4) : r[c.key];
  const body = rows.map((r) => columns.map((c) => esc(cell(c, r))).join(','));
  const total = columns.map((c, idx) => esc(idx === 0 ? (i?.t.total ?? 'Total') : totalRaw(c.key, kpis))).join(',');
  return [header, ...body, total].join('\n') + '\n';
}

function totalRaw(key: SortKey, k: Kpis): number | null {
  switch (key) {
    case 'records':
      return k.recordCount;
    case 'activeClients':
      return k.totalActiveClients;
    case 'newClients':
      return k.newClients;
    case 'churnedClients':
      return k.churnedClients;
    case 'retention':
      return round(k.weightedRetention, 4);
    case 'revenue':
      return k.totalRevenue;
    case 'tickets':
      return k.totalTickets;
    case 'resolution':
      return round(k.avgResolutionHrs, 2);
    default:
      return null;
  }
}

export function SummaryTable({ rows, kpis }: Props) {
  const i = useI18n();
  const { t } = i;
  const [groupBy, setGroupBy] = useState<GroupBy>('record');
  const [sort, setSort] = useState<Sort | null>(null);

  const groups = GROUP_KEYS.map((value) => ({ value, label: t.group[value] }));
  const groupLabel = t.group[groupBy];
  const columns = columnsFor(i)
    .filter((c) => !c.hideWhen?.includes(groupBy))
    .map((c) => (c.key === 'label' ? { ...c, label: groupBy === 'record' ? t.col.label : groupLabel } : c));
  const data = useMemo(() => sortRows(summarize(rows, groupBy), sort), [rows, groupBy, sort]);
  const quarterCount = useMemo(() => new Set(rows.map((r) => r.quarter)).size, [rows]);
  const { issuesByRecord } = useDataset();

  // The wide table's scroll state: a hint line while it overflows, a right-edge fade while it can still
  // scroll right; kept current on scroll and on resize.
  const scroller = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ overflow: false, more: false });
  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const next = { overflow: el.scrollWidth > el.clientWidth + 1, more: canScrollRight(el) };
    setScroll((s) => (s.overflow === next.overflow && s.more === next.more ? s : next));
  }, []);
  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, [measure, groupBy, data]);
  const phoneSort = Math.max(0, PHONE_SORTS.findIndex((o) => (o.sort === null ? sort === null : sort?.key === o.sort.key && sort.dir === o.sort.dir)));

  const onSort = (key: SortKey, numeric?: boolean) =>
    setSort((s) => {
      // First click: numbers high→low, text A→Z. Third click returns to the natural order.
      const first: Sort['dir'] = numeric ? 'desc' : 'asc';
      if (!s || s.key !== key) return { key, dir: first };
      if (s.dir === first) return { key, dir: first === 'asc' ? 'desc' : 'asc' };
      return null;
    });

  const download = () => {
    const blob = new Blob([toCsv(columns, data, kpis, i)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `branch-operations-2025-${groupBy}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Card labelledBy="table-title">
      <CardHeader
        id="table-title"
        title={t.tableTitle}
        subtitle={
          <>
            <span className="hidden sm:inline">{t.tableSub}</span>
            <span className="sm:hidden">{t.tableSubPhone}</span>
          </>
        }
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Segmented
              label={t.groupBy}
              size="sm"
              value={groupBy}
              onChange={(g) => {
                setGroupBy(g);
                setSort(null);
              }}
              options={groups}
            />
            <AvButton
              type="button"
              onClick={download}
              className="tap inline-flex min-h-8 items-center gap-1.5 border border-line-strong px-2.5 text-[12.5px] font-medium text-ink-2 hover:border-accent hover:text-ink"
            >
              {Icon.download('size-3.5')}
              CSV
            </AvButton>
          </div>
        }
      />
      <div className="mt-3 flex items-center gap-3 px-4 sm:hidden" data-phone-sort>
        <label htmlFor="phone-sort" className="shrink-0 text-[13px] font-medium text-ink-2">
          {t.sortBy}
        </label>
        <NativeSelect
          id="phone-sort"
          value={phoneSort}
          onChange={(e) => setSort(PHONE_SORTS[Number(e.target.value)]?.sort ?? null)}
          className="tap min-h-11 w-full min-w-0 border border-line-strong bg-surface px-3 text-[16px] text-ink"
        >
          {PHONE_SORTS.map((o, k) => (
            <option key={o.label} value={k}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <RowCards rows={data} kpis={kpis} groupBy={groupBy} quarterCount={quarterCount} />
      <div className="mt-3 hidden sm:block">
        <p className={cx('px-4 pb-2 text-[12.5px] text-muted sm:px-5', !scroll.overflow && 'hidden')} data-scroll-hint aria-hidden={!scroll.overflow}>
          {t.scrollHint}
        </p>
        <div className="relative border-t border-line">
      <div ref={scroller} onScroll={measure} className="overflow-x-auto" tabIndex={0} role="region" aria-labelledby="table-title">
        <AvTable className="w-full min-w-[860px] border-collapse text-[13px]">
          <caption className="sr-only">
            {t.caption(
              groupBy === 'record' ? null : groupLabel,
              sort ? `${columns.find((c) => c.key === sort.key)?.label} ${sort.dir === 'asc' ? t.asc : t.desc}` : null,
            )}
          </caption>
          <thead>
            <tr className="bg-surface-2">
              {columns.map((c, idx) => {
                const dir = sort?.key === c.key ? sort.dir : null;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                    className={cx(
                      'border-b border-line px-2 py-0 font-medium whitespace-nowrap text-muted first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5',
                      c.numeric ? 'text-right' : 'text-left',
                      idx === 0 && 'sticky left-0 z-10 bg-surface-2',
                    )}
                  >
                    <AvButton
                      type="button"
                      onClick={() => onSort(c.key, c.numeric)}
                      className={cx('tap inline-flex min-h-9 items-center gap-1 hover:text-ink', c.numeric && 'flex-row-reverse', dir && 'text-ink')}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {c.metric && <span aria-hidden className={cx('inline-block size-2', METRIC_TOKEN[c.metric].bg)} />}
                        {c.label}
                      </span>
                      <span className={cx(dir ? 'text-accent' : 'opacity-40')}>
                        {dir === 'asc' ? Icon.sortAsc('size-3.5') : dir === 'desc' ? Icon.sortDesc('size-3.5') : Icon.sort('size-3.5')}
                      </span>
                    </AvButton>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => {
              const notes = r.record ? issuesByRecord.get(r.record.recordId) : undefined;
              return (
                <tr key={r.key} className="group border-b border-line last:border-b-0 hover:bg-surface-2">
                  {columns.map((c, idx) => (
                    <td
                      key={c.key}
                      className={cx(
                        // the divider on each cell, not only the row: a sticky first cell paints over the row's own border
                        'border-b border-line px-2 py-2.5 whitespace-nowrap group-last:border-b-0 first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5',
                        c.numeric ? 'tabular text-right text-ink' : 'text-ink-2',
                        idx === 0 && 'sticky left-0 bg-surface font-medium text-ink group-hover:bg-surface-2',
                        c.key === 'resolution' && r.resolution === null && 'text-muted',
                      )}
                    >
                      {c.render(r)}
                      {idx === 0 && notes && <span className="sr-only">, </span>}
                      {idx === 0 && notes && (
                        <span
                          className="ml-1.5 inline-flex translate-y-[-1px] items-center bg-warn-bg px-1.5 py-px text-[10.5px] font-semibold text-warn-ink"
                          title={notes.map((x) => x.title).join(' · ')}
                        >
                          {t.cleaned}
                          <span className="sr-only">: {notes.map((x) => x.title).join('; ')}</span>
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line-strong bg-surface-2 font-semibold text-ink">
              {columns.map((c, idx) => (
                <td
                  key={c.key}
                  className={cx(
                    // align-top: a two-line cell (the sum, an average) keeps every main number on one baseline.
                    'px-2 py-2.5 align-top whitespace-nowrap first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5',
                    c.numeric && 'tabular text-right',
                    idx === 0 && 'sticky left-0 bg-surface-2',
                  )}
                >
                  {idx === 0 ? t.total : footerValue(c.key, kpis, i)}
                  {/* Active clients is a count at a point in time: over several quarters the total is a sum, and says so. */}
                  {c.key === 'activeClients' && quarterCount > 1 && (
                    <span className="block text-[11px] font-normal text-muted" data-active-sum>
                      {t.activeSum(quarterCount)}
                    </span>
                  )}
                  {/* Retention and resolution under «Total» are means, not sums: the same grey line says so. */}
                  {(c.key === 'retention' || c.key === 'resolution') && (
                    <span className="block text-[11px] font-normal text-muted" data-total-avg>
                      {c.key === 'retention' ? t.totalWeighted : t.totalAvg}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </AvTable>
      </div>
          <div
            aria-hidden
            data-scroll-fade
            className={cx('pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-r from-transparent to-surface', !scroll.more && 'hidden')}
          />
        </div>
      </div>
    </Card>
  );
}

/** Phones (< 640 px): each row a card, what it is first, then revenue · active · retention; the first
 * PHONE_FIRST cards and «Show all», each card opening to its other four numbers. */
export const PHONE_FIRST = 6;

function RowCards({ rows, kpis, groupBy, quarterCount }: { rows: SummaryRow[]; kpis: Kpis; groupBy: GroupBy; quarterCount: number }) {
  const i = useI18n();
  const { t, n } = i;
  const { issuesByRecord } = useDataset();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, PHONE_FIRST);
  const figure = (label: string, value: string, key: string) => (
    <div key={key} className="flex flex-col">
      <dt className="text-muted">{label}</dt>
      {/* mt-auto: the numbers share one baseline when a label wraps. */}
      <dd className="tabular mt-auto text-[14px] font-semibold text-ink">{value}</dd>
    </div>
  );
  const figures = (revenue: number, active: number, retention: number | null, activeLabel = t.col.activeClients) => (
    <dl className="mt-1.5 grid grid-cols-3 gap-2 text-[12px]">
      {figure(t.col.revenue, n.usdCompact(revenue), 'revenue')}
      {figure(activeLabel, n.int(active), 'active')}
      {figure(t.col.retention, n.pct(retention), 'retention')}
    </dl>
  );
  const more = (fresh: number, churned: number, tickets: number, resolution: number | null) => (
    <details className="group/more mt-1" data-row-more>
      <summary className="tap flex min-h-11 cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-accent-ink [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open/more:rotate-90" aria-hidden="true">›</span>
        {t.moreFigures}
      </summary>
      {/* Two by two, so a two-line label does not drop its number below the others. */}
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1.5 pb-1 text-[12px]" data-more-grid>
        {figure(t.col.newClients, n.int(fresh), 'new')}
        {figure(t.col.churnedClients, n.int(churned), 'churned')}
        {figure(t.col.tickets, n.int(tickets), 'tickets')}
        {figure(t.col.resolution, n.dec(resolution), 'resolution')}
      </dl>
    </details>
  );
  const describe = (r: SummaryRow): string[] => {
    if (groupBy === 'record') return [i.quarter(r.quarter), i.region(r.region), i.tier(r.tier), r.label];
    const parts: string[] = [];
    if (groupBy !== 'quarter') parts.push(i.cell(r.quarter));
    if (groupBy !== 'region' && groupBy !== 'segment') parts.push(i.cell(r.region));
    if (groupBy !== 'tier' && groupBy !== 'segment') parts.push(i.cell(r.tier));
    parts.push(t.records(r.records));
    return parts;
  };
  return (
    <ul className="mt-3 divide-y divide-line border-t border-line sm:hidden" data-row-cards>
      {shown.map((r) => {
        const notes = r.record ? issuesByRecord.get(r.record.recordId) : undefined;
        return (
          <li key={r.key} className="px-4 pt-3 pb-1">
            <p className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold text-ink">
              {groupBy === 'record' ? r.branch : i.cell(r.label)}
              {notes && <span className="sr-only">, </span>}
              {notes && (
                <span
                  className="bg-warn-bg px-1.5 py-px text-[10.5px] font-semibold text-warn-ink"
                  title={notes.map((x) => x.title).join(' · ')}
                >
                  {t.cleaned}
                </span>
              )}
            </p>
            <p className="text-[12.5px] text-muted">{describe(r).join(' · ')}</p>
            {figures(r.revenue, r.activeClients, r.retention)}
            {more(r.newClients, r.churnedClients, r.tickets, r.resolution)}
          </li>
        );
      })}
      {rows.length > PHONE_FIRST && (
        <li className="px-4 py-2" data-show-all>
          {/* The count still to come, and a way back. */}
          <AvButton
            type="button"
            onClick={() => setAll(!all)}
            aria-expanded={all}
            className="tap flex min-h-11 w-full items-center justify-center border border-line-strong text-[13.5px] font-semibold text-ink hover:border-accent"
          >
            {all ? t.showFewerRows : `${t.showAllRows} (${t.moreRows(rows.length - PHONE_FIRST)})`}
          </AvButton>
        </li>
      )}
      <li className="bg-surface-2 px-4 pt-3 pb-1">
        <p className="text-[14px] font-semibold text-ink">{t.total}</p>
        <p className="text-[12.5px] text-muted">{t.records(kpis.recordCount)}</p>
        {figures(
          kpis.totalRevenue,
          kpis.totalActiveClients,
          kpis.weightedRetention,
          quarterCount > 1 ? `${t.col.activeClients} (${t.activeSum(quarterCount)})` : t.col.activeClients,
        )}
        {more(kpis.newClients, kpis.churnedClients, kpis.totalTickets, kpis.avgResolutionHrs)}
      </li>
    </ul>
  );
}

function footerValue(key: SortKey, k: Kpis, i: I18n): string {
  const n = i.n;
  switch (key) {
    case 'records':
      return String(k.recordCount);
    case 'activeClients':
      return n.int(k.totalActiveClients);
    case 'newClients':
      return n.int(k.newClients);
    case 'churnedClients':
      return n.int(k.churnedClients);
    case 'retention':
      return n.pct(k.weightedRetention);
    case 'revenue':
      return n.usd(k.totalRevenue);
    case 'tickets':
      return n.int(k.totalTickets);
    case 'resolution':
      return n.dec(k.avgResolutionHrs);
    default:
      return '';
  }
}
