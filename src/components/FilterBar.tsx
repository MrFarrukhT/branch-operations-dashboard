import { AvButton } from '../ui/controls';
import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import { QUARTERS, REGIONS, TIERS } from '../data/types';
import type { Filters } from '../lib/metrics';
import { isFiltered } from '../lib/url-state';
import { Icon, cx } from './ui';

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  shown: number;
  total: number;
  excludedByLikeForLike: number;
}

/** Toggle one value; selecting every value collapses back to "All" (an empty list). */
function toggle<T extends string>(chosen: T[], value: T, all: readonly T[]): T[] {
  const next = chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value];
  const ordered = all.filter((v) => next.includes(v));
  return ordered.length === all.length ? [] : ordered;
}

function ChipGroup<T extends string>({
  id,
  label,
  values,
  chosen,
  onChange,
  display = (v) => v,
  allLabel,
}: {
  id: string;
  label: string;
  values: readonly T[];
  chosen: T[];
  onChange: (v: T[]) => void;
  display?: (v: T) => string;
  allLabel: string;
}) {
  const all = chosen.length === 0;
  const chip = (active: boolean) =>
    cx(
      'tap inline-flex min-h-8 items-center justify-center gap-1.5 border px-3 text-[13px] font-medium transition-colors',
      active
        ? 'border-button bg-button text-on-button'
        : 'border-line-strong bg-surface text-ink-2 hover:border-ink hover:text-ink',
    );
  return (
    <div role="group" aria-labelledby={`${id}-label`} className="flex min-w-0 flex-wrap items-center gap-1.5 lg:flex-nowrap">
      {/* the one-row bar (≥ 1024 px) names its groups from 1280 px; below that the chips speak for themselves, the name stays for readers */}
      <span id={`${id}-label`} className="mr-1 w-full font-mono text-[11px] font-medium tracking-[0.06em] whitespace-nowrap text-muted uppercase sm:w-auto lg:sr-only xl:not-sr-only xl:whitespace-nowrap">
        {label}
      </span>
      <AvButton type="button" aria-pressed={all} className={chip(all)} onClick={() => onChange([])}>
        {allLabel}
      </AvButton>
      {values.map((v) => {
        const active = chosen.includes(v);
        return (
          <AvButton
            key={v}
            type="button"
            aria-pressed={active}
            className={chip(active)}
            onClick={() => onChange(toggle(chosen, v, values))}
          >
            {active && Icon.check('size-3.5')}
            {display(v)}
          </AvButton>
        );
      })}
    </div>
  );
}

export function FilterBar({ filters, onChange, shown, total, excludedByLikeForLike }: Props) {
  const i = useI18n();
  const { t } = i;
  const filtered = isFiltered(filters);
  // Phones and tablets: the filters fold behind one row so the first screen shows numbers; from
  // 1024 px the bar is one solid row, chips, the switch and reset together, so stuck it stays under 64 px.
  const [open, setOpen] = useState(false);
  const chosen = filters.regions.length + filters.quarters.length + filters.tiers.length + (filters.likeForLike ? 1 : 0);
  const count = t.shownOf(shown, total);
  return (
    <div className="no-print border-b border-line bg-page md:sticky md:top-0 md:z-30">
      <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:hidden">
        <AvButton
          type="button"
          aria-expanded={open}
          aria-controls="filter-panel"
          onClick={() => setOpen(!open)}
          className="tap inline-flex min-h-9 items-center gap-2 border border-line-strong bg-surface px-3 text-[13.5px] font-semibold text-ink"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden className="size-4 shrink-0">
            <path d="M2 4h12M4.5 8h7M7 12h2" />
          </svg>
          {t.filters} · <span className={chosen ? 'text-accent-ink' : 'font-medium text-muted'}>{chosen ? t.filtersChosen(chosen) : t.filtersAll}</span>
          <span aria-hidden className={cx('text-muted transition-transform', open && 'rotate-90')}>›</span>
        </AvButton>
        <p className="tabular text-[13px] text-muted">
          {count.before}
          <span className="font-semibold text-ink">{count.strong}</span>
          {count.after}
        </p>
      </div>
      <div
        id="filter-panel"
        className={cx(
          'mx-auto max-w-[1320px] flex-wrap items-center gap-x-6 gap-y-3 px-4 pt-1 pb-3 sm:px-6 lg:flex lg:flex-nowrap lg:gap-x-5 lg:py-2.5',
          open ? 'flex' : 'hidden',
        )}
        data-filter-row
      >
        <ChipGroup
          id="f-region"
          label={t.region}
          allLabel={t.all}
          values={REGIONS}
          chosen={filters.regions}
          onChange={(regions) => onChange({ ...filters, regions })}
          display={i.region}
        />
        <ChipGroup
          id="f-quarter"
          label={t.quarter}
          allLabel={t.all}
          values={QUARTERS}
          chosen={filters.quarters}
          onChange={(quarters) => onChange({ ...filters, quarters })}
          display={i.quarterShort}
        />
        <ChipGroup
          id="f-tier"
          label={t.tier}
          allLabel={t.all}
          values={TIERS}
          chosen={filters.tiers}
          onChange={(tiers) => onChange({ ...filters, tiers })}
          display={i.tier}
        />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:ml-auto lg:flex-nowrap">
          <AvButton
            type="button"
            role="switch"
            aria-checked={filters.likeForLike}
            aria-describedby="lfl-help"
            onClick={() => onChange({ ...filters, likeForLike: !filters.likeForLike })}
            className="tap inline-flex min-h-8 cursor-pointer items-center gap-2 text-[13px] font-medium whitespace-nowrap text-ink-2"
          >
            <span
              aria-hidden
              className={cx(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
                filters.likeForLike ? 'border-signal bg-signal' : 'border-line-strong bg-surface-2',
              )}
            >
              <span
                className={cx(
                  'inline-block size-3.5 rounded-full bg-surface transition-transform',
                  filters.likeForLike ? 'translate-x-[18px]' : 'translate-x-[2px]',
                )}
              />
            </span>
            {t.likeForLike}
          </AvButton>
          <span id="lfl-help" className="sr-only">
            {t.likeForLikeHelp}
          </span>
          <AvButton
            type="button"
            onClick={() => onChange({ regions: [], quarters: [], tiers: [], likeForLike: false })}
            disabled={!filtered}
            className="tap inline-flex min-h-8 items-center gap-1.5 px-2.5 text-[13px] font-medium whitespace-nowrap text-accent-ink hover:bg-accent-wash disabled:cursor-default disabled:text-muted disabled:opacity-60 disabled:hover:bg-transparent"
          >
            {Icon.reset()}
            {t.resetFilters}
          </AvButton>
          {/* one count on screen: the folded row's below 1024 px, this one from 1280 px; readers hear this one throughout */}
          <p aria-live="polite" className="tabular sr-only text-[13px] text-muted xl:not-sr-only xl:whitespace-nowrap">
            {count.before}
            <span className="font-semibold text-ink">{count.strong}</span>
            {count.after}
            {excludedByLikeForLike > 0 && <span> · {t.setAside(excludedByLikeForLike)}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}
