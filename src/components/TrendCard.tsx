import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Tier } from '../data/types';
import type { QuarterCoverage, TrendPoint } from '../lib/metrics';
import { formatInt, niceTicks, scaleWords } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { METRIC_TOKEN, type ChartTheme } from '../lib/theme';
import { Card, CardHeader, Icon, TierSwatch, cx, type TipProps } from './ui';

interface Props {
  trend: TrendPoint[];
  coverage: QuarterCoverage[];
  tiers: Tier[];
  theme: ChartTheme;
  likeForLike: boolean;
}

type Measure = 'revenue' | 'activeClients';

/** Room under the axis line for the quarter and, under a partial quarter, «⚠ 4 of 6» and «segments» on two more lines (a single line
 * was cut on narrow columns). Lines at y = 12, 28 and 43, 12 px type. */
export const QUARTER_AXIS_HEIGHT = 50;

/** Each tier's colour in a metric's palette: Enterprise the deep shade, Standard the base. */
type Palette = Record<Tier, string>;

interface Datum {
  quarter: string;
  partial: boolean;
  reported: number;
  expected: number;
  missing: string[];
  total: number;
  Enterprise: number;
  Standard: number;
}

export function TrendCard({ trend, coverage, tiers, theme, likeForLike }: Props) {
  const { t } = useI18n();
  const anyPartial = trend.some((p) => p.partial);
  return (
    <Card className="flex flex-col lg:col-span-7" labelledBy="trend-title">
      <CardHeader
        id="trend-title"
        title={t.trendTitle}
        subtitle={likeForLike ? t.trendSubLfl : t.trendSubAll}
        actions={<TierLegend tiers={tiers} palettes={[theme.metric.revenue, theme.metric.activeClients]} />}
      />
      <div className="grid flex-1 grid-cols-1 gap-x-6 gap-y-2 px-2 pt-3 pb-3 sm:grid-cols-2 sm:px-3">
        <TrendPanel title={t.revenue} measure="revenue" trend={trend} coverage={coverage} tiers={tiers} theme={theme} />
        <TrendPanel title={t.activeClients} measure="activeClients" trend={trend} coverage={coverage} tiers={tiers} theme={theme} />
      </div>
      {anyPartial && (
        <p className="flex items-start gap-2 border-t border-line px-4 py-3 text-[12.5px] text-muted sm:px-5">
          <span className="mt-px text-warn-icon">{Icon.warn('size-3.5')}</span>
          <span>{t.partialNote}</span>
        </p>
      )}
    </Card>
  );
}

/** The tiers' key: one swatch per tier, split across the palettes in view (the trend's two metrics, or the segment's one). */
export function TierLegend({ tiers, palettes }: { tiers: Tier[]; palettes: Palette[] }) {
  const i = useI18n();
  return (
    <ul className="flex items-center gap-4 text-[12.5px] text-ink-2" aria-label={i.t.legend}>
      {tiers.map((t) => (
        <li key={t} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-flex">
            {palettes.map((p, k) => (
              <TierSwatch key={k} color={p[t]} />
            ))}
          </span>
          {i.tier(t)}
        </li>
      ))}
    </ul>
  );
}

function TrendPanel({
  title,
  measure,
  trend,
  coverage,
  tiers,
  theme,
}: {
  title: string;
  measure: Measure;
  trend: TrendPoint[];
  coverage: QuarterCoverage[];
  tiers: Tier[];
  theme: ChartTheme;
}) {
  const i = useI18n();
  const { t: w, n } = i;
  const palette: Palette = theme.metric[measure];
  const data: Datum[] = trend.map((t) => ({
    quarter: t.quarter,
    partial: t.partial,
    reported: t.reported,
    expected: t.expected,
    missing: coverage.find((c) => c.quarter === t.quarter)?.missing ?? [],
    total: measure === 'revenue' ? t.totalRevenue : t.totalActiveClients,
    Enterprise: t[measure].Enterprise,
    Standard: t[measure].Standard,
  }));
  // uz / ru: revenue in bare thousands with the unit once above the axis, as the segment chart.
  const bareK = measure === 'revenue' && i.lang !== 'en';
  const unit = i.lang === 'en' ? null : measure === 'revenue' ? `${scaleWords(i.lang).k} $` : '';
  const fmtShort = bareK ? (v: number) => formatInt(v / 1000, i.lang) : measure === 'revenue' ? n.usdCompact : n.int;
  const fmtAxis = bareK ? fmtShort : measure === 'revenue' ? (v: number) => n.usdAxis(v) : n.int;
  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.total)));
  const fmtSpoken = measure === 'revenue' ? n.usdAxis : n.int; // the screen reader hears the unit with each number
  const summary = data
    .map((d) => `${i.quarter(d.quarter)}: ${fmtSpoken(d.total)}${d.partial ? ` (${w.partialSr(d.reported, d.expected)})` : ''}`)
    .join('; ');

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-center gap-2 px-2 text-[13px] font-medium text-ink-2" data-metric={measure}>
        <span aria-hidden className={cx('inline-block h-[3px] w-4', METRIC_TOKEN[measure].bg)} />
        {title}
      </figcaption>
      <p className="sr-only">
        {w.byQuarter(title)} {summary}.
      </p>
      {unit !== null && (
        <p className="h-[18px] px-2 text-[12px] text-muted" aria-hidden data-axis-unit>
          {unit || ' '}
        </p>
      )}
      <div className={unit !== null ? 'h-[212px]' : 'h-[230px]'}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, bottom: 4, left: 0 }} accessibilityLayer>
            <defs>
              {tiers.map((tier) => (
                <pattern key={tier} id={hatchId(measure, tier)} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill={palette[tier]} fillOpacity={0.28} />
                  <rect width="3" height="6" fill={palette[tier]} />
                </pattern>
              ))}
            </defs>
            <CartesianGrid vertical={false} stroke={theme.grid} />
            <XAxis
              dataKey="quarter"
              tickLine={false}
              axisLine={{ stroke: theme.axis }}
              interval={0}
              height={QUARTER_AXIS_HEIGHT}
              tick={(props) => <QuarterTick {...props} data={data} theme={theme} label={i.quarterShort} />}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={measure === 'revenue' && !bareK ? 54 : 48}
              tick={{ fill: theme.muted, fontSize: 12 }}
              tickFormatter={fmtAxis}
              ticks={ticks}
              domain={[0, ticks[ticks.length - 1]!]}
            />
            <Tooltip
              cursor={{ fill: theme.cursor }}
              content={(p) => <TrendTooltip active={p.active} payload={p.payload} measure={measure} tiers={tiers} palette={palette} />}
              isAnimationActive={false}
            />
            {tiers.map((tier, ti) => (
              <Bar
                key={tier}
                dataKey={tier}
                name={i.tier(tier)}
                stackId="tiers"
                fill={palette[tier]}
                stroke={theme.surface}
                strokeWidth={1}
                maxBarSize={36}
                isAnimationActive={false}
                label={
                  ti === tiers.length - 1
                    ? (lp: { x?: number; y?: number; width?: number; index?: number }) => {
                        const d = data[lp.index ?? 0];
                        if (!d || d.total === 0) return <g />;
                        return (
                          <text
                            x={(lp.x ?? 0) + (lp.width ?? 0) / 2}
                            y={(lp.y ?? 0) - 7}
                            textAnchor="middle"
                            fontSize={12}
                            fontWeight={600}
                            fill={theme.ink2}
                          >
                            {fmtShort(d.total)}
                          </text>
                        );
                      }
                    : undefined
                }
              >
                {data.map((d) => (
                  <Cell
                    key={d.quarter}
                    fill={d.partial ? `url(#${hatchId(measure, tier)})` : palette[tier]}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** The quarter under its column; under a partial one, «⚠ 4 of 6» and «segments» on two lines. */
export function QuarterTick({
  x,
  y,
  payload,
  data,
  theme,
  label,
}: {
  x?: number;
  y?: number;
  payload?: { value: string };
  data: Pick<Datum, 'quarter' | 'partial' | 'reported' | 'expected'>[];
  theme: Pick<ChartTheme, 'ink2' | 'muted' | 'warn'>;
  label: (q: string) => string;
}) {
  const { t } = useI18n();
  const d = data.find((p) => p.quarter === payload?.value);
  const [first, second] = d?.partial ? t.segmentsOfLines(d.reported, d.expected) : ['', ''];
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text y={12} textAnchor="middle" fontSize={12} fill={theme.ink2}>
        {payload ? label(payload.value) : ''}
      </text>
      {d?.partial && (
        <text textAnchor="middle" fontSize={12} fill={theme.muted}>
          <tspan x={0} y={28} fill={theme.warn}>⚠</tspan>
          <tspan dx={4}>{first}</tspan>
          <tspan x={0} y={43}>{second}</tspan>
        </text>
      )}
    </g>
  );
}

function TrendTooltip({
  active,
  payload,
  measure,
  tiers,
  palette,
}: TipProps & { measure: Measure; tiers: Tier[]; palette: Palette }) {
  const i = useI18n();
  if (!active || !payload?.length) return null;
  const d = payload[0]!.payload as Datum;
  const fmt = measure === 'revenue' ? i.n.usd : i.n.int;
  return (
    <div className="min-w-[200px] border border-line bg-surface px-3 py-2.5 text-[12.5px] shadow-[0_8px_24px_rgba(11,11,11,0.12)]">
      <p className="mb-1.5 font-semibold text-ink">
        {i.quarter(d.quarter)} · {measure === 'revenue' ? i.t.revenue : i.t.activeClients}
      </p>
      <ul className="space-y-1">
        {tiers.map((t) => (
          <li key={t} className="flex items-center justify-between gap-4 text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <TierSwatch color={palette[t]} />
              {i.tier(t)}
            </span>
            <span className="tabular text-ink">{fmt(d[t])}</span>
          </li>
        ))}
        <li className="flex justify-between gap-4 border-t border-line pt-1 font-semibold text-ink">
          <span>{i.t.total}</span>
          <span className="tabular">{fmt(d.total)}</span>
        </li>
      </ul>
      {d.partial && (
        <p className="mt-2 max-w-[240px] text-[12px] leading-snug text-warn-ink">
          {i.t.partialTip(d.reported, d.expected, i.list(d.missing.map(i.segment)))}
        </p>
      )}
    </div>
  );
}

const hatchId = (measure: Measure, tier: Tier) => `hatch-${measure}-${tier}`;
