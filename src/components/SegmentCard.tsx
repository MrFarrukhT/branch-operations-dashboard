import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Quarter, Tier } from '../data/types';
import type { SegmentMetric, SegmentPoint } from '../lib/metrics';
import { DASH, formatInt, niceTicks, scaleWords } from '../lib/format';
import { useI18n, type I18n } from '../lib/i18n';
import { METRIC_TOKEN, type ChartTheme } from '../lib/theme';
import { TierLegend } from './TrendCard';
import { Card, CardHeader, Segmented, TierSwatch, cx, useElementWidth, type TipProps } from './ui';

interface Props {
  points: SegmentPoint[];
  tiers: Tier[];
  quarters: Quarter[];
  metric: SegmentMetric;
  onMetric: (m: SegmentMetric) => void;
  theme: ChartTheme;
}

/** The four measures, their words in the page's language and their number formats. */
export function metrics(i: I18n): Record<SegmentMetric, { label: string; short: string; fmt: (v: number | null) => string; full: (v: number | null) => string; note: string }> {
  const w = i.t.metric;
  return {
    revenue: { ...w.revenue, fmt: i.n.usdCompact, full: i.n.usd },
    activeClients: { ...w.activeClients, fmt: i.n.int, full: i.n.int },
    retention: { ...w.retention, fmt: (v) => i.n.pct(v), full: (v) => i.n.pct(v, 2) },
    resolution: { ...w.resolution, fmt: (v) => i.n.hours(v), full: (v) => i.n.hours(v, 2) },
  };
}

/**
 * uz / ru bars carry bare numbers and the axis names the unit once («ming $», «soat», «%»), so a label fits a 28 px bar
 * en keeps its own short labels ($245K, 4.2 h).
 */
export function barLabels(i: I18n, metric: SegmentMetric): { bare: boolean; label: (v: number) => string; unit: string | null } {
  if (i.lang === 'en') {
    const m = metrics(i)[metric];
    return { bare: false, label: (v) => m.fmt(v), unit: null };
  }
  const w = scaleWords(i.lang);
  switch (metric) {
    case 'revenue':
      return { bare: true, label: (v) => formatInt(v / 1000, i.lang), unit: `${w.k} $` };
    case 'activeClients':
      return { bare: true, label: (v) => i.n.int(v), unit: null };
    case 'retention':
      return { bare: true, label: (v) => i.n.dec(v * 100, 1), unit: '%' };
    case 'resolution':
      return { bare: true, label: (v) => i.n.dec(v, 1), unit: w.hours };
  }
}

/**
 * Retention's axis: from 0 % every bar looked the same height; it starts 2 points under the lowest value,
 * rounded down to a whole percent, and ends at 100 %. Ticks fall on round percents inside that range.
 */
export function retentionAxis(values: number[]): { domain: [number, number]; ticks: number[] } {
  const min = values.length ? Math.min(...values) : 0;
  const lo = Math.max(0, Math.floor(min * 100 - 2));
  const span = 100 - lo;
  const step = [1, 2, 5, 10, 20, 25].find((s) => span / s <= 5) ?? 25;
  const ticks: number[] = [];
  for (let p = Math.ceil(lo / step) * step; p <= 100; p += step) ticks.push(p / 100);
  if (ticks[ticks.length - 1] !== 1) ticks.push(1);
  return { domain: [lo / 100, 1], ticks };
}

/**
 * Value labels over the bars: the full labels when each bar has 66 px, else compact ones
 * (10 px type, wider gaps between a region's two bars) down to a phone's 340 px chart; none only below that.
 */
export function segmentLabelMode(chartWidth: number, bars: number): 'full' | 'compact' | 'none' {
  if (chartWidth === 0) return 'full';
  const per = chartWidth / Math.max(1, bars);
  return per >= 66 ? 'full' : per >= 44 ? 'compact' : 'none';
}

type Datum = { region: string } & Record<Tier, number | null> & Record<`q_${Tier}`, number>;

export function SegmentCard({ points, tiers, quarters, metric, onMetric, theme }: Props) {
  const i = useI18n();
  const METRICS = metrics(i);
  const m = METRICS[metric];
  const [chartRef, chartWidth] = useElementWidth<HTMLDivElement>();
  const bars = barLabels(i, metric);
  const palette = theme.metric[metric];
  // Cap labels need room per bar; on a narrow chart they shrink rather than go (the tooltip and table carry the exact values).
  const labelMode = segmentLabelMode(chartWidth, points.length * tiers.length);
  const compact = labelMode === 'compact';
  const data: Datum[] = points.map((p) => ({
    region: p.region,
    Enterprise: p.values.Enterprise,
    Standard: p.values.Standard,
    q_Enterprise: p.quarterCount.Enterprise,
    q_Standard: p.quarterCount.Standard,
  }));
  const gaps = points.flatMap((p) =>
    tiers.filter((t) => p.quarterCount[t] > 0 && p.quarterCount[t] < quarters.length).map((t) => i.segment(`${p.region} · ${t}`)),
  );
  const values = data.flatMap((d) => tiers.map((t) => d[t])).filter((v): v is number => v !== null);
  const retention = metric === 'retention' ? retentionAxis(values) : null;
  const ticks = retention ? retention.ticks : niceTicks(Math.max(0, ...values));
  const domain: [number, number] = retention ? retention.domain : [0, ticks[ticks.length - 1]!];
  const isSum = metric === 'revenue' || metric === 'activeClients';
  const summary = data
    .map((d) => `${i.region(d.region)}: ${tiers.map((t) => `${i.tier(t)} ${m.fmt(d[t])}`).join(', ')}`)
    .join('; ');

  return (
    <Card className="flex flex-col lg:col-span-5" labelledBy="segment-title">
      <CardHeader id="segment-title" title={i.t.segTitle} subtitle={i.t.segSub(m.note)} />
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 sm:px-5">
        <Segmented
          label={i.t.measure}
          size="sm"
          value={metric}
          onChange={onMetric}
          options={(Object.keys(METRICS) as SegmentMetric[]).map((k) => ({
            value: k,
            // each measure wears its metric's colour, as on the KPI cards
            label: (
              <>
                <span aria-hidden className={cx('hidden size-2 min-[400px]:inline-block', METRIC_TOKEN[k].bg)} />
                {METRICS[k].short}
              </>
            ),
            title: METRICS[k].label,
          }))}
        />
        <TierLegend tiers={tiers} palettes={[palette]} />
      </div>
      <figure className="min-w-0 flex-1 px-2 pt-2 pb-2 sm:px-3">
        <p className="sr-only">
          {i.t.segByRegion(m.note)} {summary.replace(/\.$/, '')}.
        </p>
        {bars.unit && (
          <p className="px-2 text-[12px] text-muted" aria-hidden data-axis-unit>
            {bars.unit}
          </p>
        )}
        <div ref={chartRef} className={bars.unit ? 'h-[226px]' : 'h-[244px]'}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 24, right: 8, bottom: 4, left: 0 }} barGap={compact ? 6 : 2} barCategoryGap="22%" accessibilityLayer>
              <CartesianGrid vertical={false} stroke={theme.grid} />
              <XAxis dataKey="region" tickLine={false} axisLine={{ stroke: theme.axis }} tick={{ fill: theme.ink2, fontSize: 12 }} tickFormatter={i.region} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={bars.bare ? 48 : metric === 'revenue' ? 54 : 48}
                allowDataOverflow={metric === 'retention'}
                tick={{ fill: theme.muted, fontSize: 12 }}
                tickFormatter={(v: number) =>
                  bars.bare
                    ? metric === 'retention'
                      ? formatInt(v * 100, i.lang)
                      : metric === 'resolution'
                        ? Number.isInteger(v) ? formatInt(v, i.lang) : i.n.dec(v, 1)
                        : bars.label(v)
                    : metric === 'retention'
                      ? i.n.pct(v, 0)
                      : metric === 'resolution'
                        ? i.n.hours(v, 0)
                        : m.fmt(v)
                }
                domain={domain}
                ticks={ticks}
              />
              <Tooltip
                cursor={{ fill: theme.cursor }}
                content={(p) => <SegmentTooltip active={p.active} payload={p.payload} metric={metric} tiers={tiers} quarters={quarters} palette={palette} />}
                isAnimationActive={false}
              />
              {tiers.map((tier) => (
                <Bar key={tier} dataKey={tier} name={i.tier(tier)} fill={palette[tier]} maxBarSize={28} isAnimationActive={false}>
                  {labelMode !== 'none' && (
                  <LabelList
                    dataKey={tier}
                    position="top"
                    offset={compact ? 4 : 6}
                    fill={theme.ink2}
                    fontSize={compact ? 10 : 12}
                    fontWeight={600}
                    formatter={(v: number | null) => (v === null ? '' : bars.label(v))}
                  />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </figure>
      {retention && (
        <p className="px-4 pb-2 text-[12px] text-muted sm:px-5" data-axis-note>
          {i.t.axisNotZero(i.n.pct(retention.domain[0], 0))}
        </p>
      )}
      {gaps.length > 0 && (
        <p className="border-t border-line px-4 py-3 text-[12.5px] text-muted sm:px-5">
          {i.t.segGaps(i.list(gaps), gaps.length, isSum)}
        </p>
      )}
    </Card>
  );
}

function SegmentTooltip({
  active,
  payload,
  metric,
  tiers,
  quarters,
  palette,
}: TipProps & { metric: SegmentMetric; tiers: Tier[]; quarters: Quarter[]; palette: Record<Tier, string> }) {
  const i = useI18n();
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload as Datum;
  const m = metrics(i)[metric];
  return (
    <div className="min-w-[210px] border border-line bg-surface px-3 py-2.5 text-[12.5px] shadow-[0_8px_24px_rgba(11,11,11,0.12)]">
      <p className="mb-1.5 font-semibold text-ink">
        {i.region(d.region)} · {m.label}
      </p>
      <ul className="space-y-1">
        {tiers.map((t) => (
          <li key={t} className="flex items-center justify-between gap-4 text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <TierSwatch color={palette[t]} />
              {i.tier(t)}
            </span>
            <span className="text-right">
              <span className="tabular text-ink">{d[t] === null ? DASH : m.full(d[t])}</span>
              {d[`q_${t}`] < quarters.length && (
                <span className="block text-[11px] text-warn-ink">
                  {i.t.quartersOf(d[`q_${t}`], quarters.length)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
