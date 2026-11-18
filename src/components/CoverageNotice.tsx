import { AvButton } from '../ui/controls';
import type { QuarterCoverage } from '../lib/metrics';
import { useI18n } from '../lib/i18n';
import { Icon } from './ui';

export interface QuarterComparison {
  quarter: string;
  previous: string;
  reportedChange: number | null;
  likeForLikeChange: number | null;
  likeForLikeSegments: number;
}

interface Props {
  partial: QuarterCoverage[];
  likeForLike: boolean;
  excluded: number;
  excludedSegments: string[];
  comparison: QuarterComparison | null;
  onLikeForLike: (on: boolean) => void;
}

/** States plainly when a quarter in view is incomplete, and what that does to the comparison. On a phone too: its first line, the comparison sentence and the button. */
export function CoverageNotice({ partial, likeForLike, excluded, excludedSegments, comparison, onLikeForLike }: Props) {
  const i = useI18n();
  const { t } = i;
  if (likeForLike) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border border-line bg-info-bg px-4 py-2 text-[13.5px] text-ink-2 sm:items-start sm:py-3">
        <span className="text-accent sm:mt-0.5">{Icon.info()}</span>
        <p className="min-w-0 flex-1 basis-48">
          <span className="font-semibold text-ink">{t.lflView}</span>{' '}
          <span className="hidden sm:inline">
            {excluded > 0 ? t.lflSetAside(excluded, i.list(excludedSegments.map(i.segment))) : t.lflNothing}
          </span>
        </p>
        <AvButton type="button" onClick={() => onLikeForLike(false)} className="tap no-print text-[13px] font-semibold text-accent-ink underline-offset-2 hover:underline">
          {t.showAll}
        </AvButton>
      </div>
    );
  }
  if (partial.length === 0) return null;
  const sentence = comparison && comparison.reportedChange !== null && comparison.likeForLikeChange !== null
    ? t.comparison(
        i.quarter(comparison.quarter),
        i.quarter(comparison.previous),
        t.change(comparison.reportedChange, i.lang),
        comparison.likeForLikeSegments,
        t.change(comparison.likeForLikeChange, i.lang),
      )
    : null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border border-l-[3px] border-warn-border border-l-signal bg-warn-bg px-4 py-2 text-[13.5px] text-warn-ink sm:items-start sm:py-3">
      <span className="text-warn-icon sm:mt-0.5">{Icon.warn()}</span>
      <div className="min-w-0 flex-1 basis-48 space-y-1">
        {partial.map((p) => (
          <p key={p.quarter}>
            <span className="font-semibold">{t.incomplete(i.quarter(p.quarter), p.reported, p.expected)}</span>{' '}
            <span className="hidden sm:inline">{t.noDataFor(i.list(p.missing.map(i.segment)))}</span>
          </p>
        ))}
        {sentence && (
          <p data-comparison>
            {/* Both changes in the same weight: bolding only the like-for-like one read as cherry-picking. */}
            {sentence.before}
            {sentence.strong}
            {sentence.after}
          </p>
        )}
      </div>
      <AvButton
        type="button"
        onClick={() => onLikeForLike(true)}
        className="tap no-print border border-warn-border bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-accent"
      >
        {t.compare}
      </AvButton>
    </div>
  );
}
