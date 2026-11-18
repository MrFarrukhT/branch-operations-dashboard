import { AvButton } from '../ui/controls';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function Card({
  children,
  className,
  as: Tag = 'section',
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
  labelledBy?: string;
}) {
  return (
    <Tag
      aria-labelledby={labelledBy}
      className={cx('border border-line bg-surface', className)}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({
  id,
  title,
  subtitle,
  actions,
}: {
  id: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div className="min-w-0">
        <h2 id={id} className="font-display text-[17px] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

/** A compact single-choice control (radio-group semantics, arrow keys move). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'md',
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  /** bar: the header's theme toggle, as tall as the filter chips (32 px). */
  size?: 'sm' | 'md' | 'bar';
}) {
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length]!;
    onChange(next.value);
    return next.value;
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap border border-line bg-surface-2 p-0.5"
      onKeyDown={(e) => {
        if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
        e.preventDefault();
        const v = move(e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1);
        const btn = e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${v}"]`);
        btn?.focus();
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <AvButton
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            data-value={o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cx(
              'tap inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors',
              // sm ≥ 28 px tall, bar 32 px.
              size === 'sm' ? 'min-h-7 px-2 py-1 text-xs' : size === 'bar' ? 'min-h-8 px-2.5 py-1 text-xs' : 'px-2.5 py-1.5 text-[13px]',
              active ? 'bg-surface text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </AvButton>
        );
      })}
    </div>
  );
}

export function TierSwatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block size-2.5 shrink-0" style={{ background: color }} />;
}

// --- icons (inline, 16px, currentColor) ------------------------------------

const icon = (path: ReactNode, className = 'size-4') => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cx('shrink-0', className)}>
    {path}
  </svg>
);

export const Icon = {
  warn: (c?: string) =>
    icon(
      <>
        <path d="M8 1.8 15 14H1L8 1.8Z" />
        <path d="M8 6.2v3.4M8 11.6v.1" />
      </>,
      c,
    ),
  check: (c?: string) => icon(<path d="m3 8.4 3.2 3.1L13 4.6" />, c),
  cross: (c?: string) => icon(<path d="m4 4 8 8M12 4l-8 8" />, c),
  info: (c?: string) =>
    icon(
      <>
        <circle cx="8" cy="8" r="6.4" />
        <path d="M8 7.2v4M8 4.8v.1" />
      </>,
      c,
    ),
  reset: (c?: string) =>
    icon(
      <>
        <path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.8" />
        <path d="M2.6 2.4v2.9h2.9" />
      </>,
      c,
    ),
  sun: (c?: string) =>
    icon(
      <>
        <circle cx="8" cy="8" r="2.8" />
        <path d="M8 1.2v1.5M8 13.3v1.5M1.2 8h1.5M13.3 8h1.5M3.2 3.2l1 1M11.8 11.8l1 1M3.2 12.8l1-1M11.8 4.2l1-1" />
      </>,
      c,
    ),
  moon: (c?: string) => icon(<path d="M13.4 9.6A5.6 5.6 0 0 1 6.4 2.6a5.6 5.6 0 1 0 7 7Z" />, c),
  monitor: (c?: string) =>
    icon(
      <>
        <rect x="1.8" y="2.6" width="12.4" height="8.6" rx="1.4" />
        <path d="M5.6 13.8h4.8" />
      </>,
      c,
    ),
  download: (c?: string) =>
    icon(
      <>
        <path d="M8 2.2v8M4.8 7.2 8 10.4l3.2-3.2" />
        <path d="M2.6 12.6v1.2h10.8v-1.2" />
      </>,
      c,
    ),
  sort: (c?: string) => icon(<path d="m5 6 3-3 3 3M5 10l3 3 3-3" />, c),
  sortAsc: (c?: string) => icon(<path d="m4.5 9.5 3.5-4 3.5 4" />, c),
  sortDesc: (c?: string) => icon(<path d="m4.5 6.5 3.5 4 3.5-4" />, c),
};

/** The part of Recharts' tooltip props our custom tooltips read. */
export interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
}

/** Width of an element, kept current with a ResizeObserver. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
