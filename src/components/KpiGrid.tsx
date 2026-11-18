import type { ReactNode } from 'react';
import type { Kpis } from '../lib/metrics';
import { DASH, keepQuartersTogether } from '../lib/format';
import { useI18n } from '../lib/i18n';
import type { Quarter } from '../data/types';
import { METRIC_TOKEN, type MetricKey } from '../lib/theme';
import { cx } from './ui';

interface Props {
  kpis: Kpis;
  quartersInView: Quarter[];
  latestComplete: { quarter: Quarter; activeClients: number } | null;
  /** The last complete quarter's revenue against the complete quarter before it (null: fewer than two in view). */
  revenueChange: { quarter: Quarter; previous: Quarter; change: number } | null;
}

/** On a phone the cards sit 2 × 2 and keep their first note; the second shows from 640 px. Each card
 * opens with its metric's colour, the same colour the charts and the table give that metric. */
function Kpi({ metric, label, value, title, children, more }: { metric: MetricKey; label: string; value: string; title?: string; children?: ReactNode; more?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col border border-line bg-surface px-3 py-3 sm:px-5 sm:py-4" data-metric={metric}>
      <span aria-hidden className={cx('mb-2.5 block h-[3px] w-6', METRIC_TOKEN[metric].bg)} />
      <dt className="text-[12.5px] leading-snug font-medium text-ink-2 sm:text-[13px]">{label}</dt>
      <dd className="mt-1.5 font-display text-[22px] leading-none font-semibold tracking-[-0.03em] whitespace-nowrap text-ink min-[400px]:text-[24px] sm:text-[32px]" title={title}>
        {value}
      </dd>
      {children && (
        <dd className="mt-2 space-y-0.5 text-[12px] leading-snug text-muted sm:mt-2.5 sm:text-[12.5px]">
          {children}
          {more && <div className="hidden space-y-0.5 sm:block">{more}</div>}
        </dd>
      )}
    </div>
  );
}

export function KpiGrid({ kpis, quartersInView, latestComplete, revenueChange }: Props) {
  const i = useI18n();
  const { t, n } = i;
  const empty = kpis.recordCount === 0;
  const multiQuarter = quartersInView.length > 1;
  const records = t.records(kpis.recordCount);

  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4" aria-label={t.kpiAria}>
      <Kpi
        metric="revenue"
        label={t.kpiRevenue}
        value={empty ? DASH : n.usdCompact(kpis.totalRevenue)}
        title={n.usd(kpis.totalRevenue)}
        more={!empty && <p>{t.sumOf(records)}</p>}
      >
        {/* The exact total under the card on every filter, then the ▲/▼, which speaks of the same quarter
            the active-clients card leads with when there is a pair of complete quarters. */}
        {!empty && (
          <p className="tabular" data-revenue-exact>
            {n.usd(kpis.totalRevenue)}
          </p>
        )}
        {!empty && revenueChange && (
          <p className="tabular" data-revenue-change>
            <span className="font-medium text-ink-2">
              {revenueChange.change >= 0 ? '▲' : '▼'} {n.pct(Math.abs(revenueChange.change))}
            </span>{' '}
            · {keepQuartersTogether(t.vsPrev(revenueChange.quarter, revenueChange.previous))}
          </p>
        )}
      </Kpi>

      {/* The big figure is the client-weighted rate, the brief's simple mean beneath it. */}
      <Kpi metric="retention" label={t.kpiRetention} value={n.pct(kpis.weightedRetention)}>
        {!empty && (
          <>
            <p>{t.clientWeighted}</p>
            <p>
              {t.simpleMean(records)} <span className="font-medium text-ink-2">{n.pct(kpis.avgRetention)}</span>
            </p>
          </>
        )}
      </Kpi>

      {/* Active clients is a stock: over several quarters the card leads with the last complete quarter's count, the
          client-quarters sum on the grey line, on a phone too. */}
      {!empty && multiQuarter && latestComplete ? (
        <Kpi metric="activeClients" label={t.kpiActive} value={n.int(latestComplete.activeClients)}>
          <p>{t.latestComplete(i.quarter(latestComplete.quarter))}</p>
          <p>{t.clientQuartersSum(n.int(kpis.totalActiveClients), quartersInView.length)}</p>
        </Kpi>
      ) : (
        <Kpi metric="activeClients" label={t.kpiActive} value={empty ? DASH : n.int(kpis.totalActiveClients)}>
          {!empty && !multiQuarter && (
            <p>{t.inQuarter(i.quarter(quartersInView[0]!), n.int(kpis.newClients), n.int(kpis.churnedClients))}</p>
          )}
        </Kpi>
      )}

      <Kpi
        metric="resolution"
        label={t.kpiResolution}
        value={n.hours(kpis.avgResolutionHrs)}
        more={
          !empty && (
            <p>
              {kpis.resolutionMissing > 0
                ? t.resolutionMissing(kpis.resolutionMissing)
                : t.meanTickets(records, n.int(kpis.totalTickets))}
            </p>
          )
        }
      >
        {!empty && (
          <p>
            {t.ticketWeighted} <span className="font-medium text-ink-2">{n.hours(kpis.weightedResolutionHrs)}</span>
          </p>
        )}
      </Kpi>
    </dl>
  );
}
