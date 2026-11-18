/** Display formatting. One place, so cards, charts, tooltips and table agree. Every function takes the page's language (default en). */

export const DASH = '—';

export type NumLang = 'en' | 'uz' | 'ru';

// uz writes numbers as ru does (1 234 567,5); browsers ship ru's number data, not always uz's (Chromium falls back to en).
const TAG: Record<NumLang, string> = { en: 'en-US', uz: 'ru-RU', ru: 'ru-RU' };
const NB = '\u00a0';
/** Thousands / millions / billions after a compact number (uz and ru write the unit after, with a space). */
const SCALE: Record<NumLang, { k: string; m: string; b: string; hours: string }> = {
  en: { k: 'K', m: 'M', b: 'B', hours: 'h' },
  uz: { k: `${NB}ming`, m: `${NB}mln`, b: `${NB}mlrd`, hours: 'soat' },
  ru: { k: `${NB}тыс.`, m: `${NB}млн`, b: `${NB}млрд`, hours: 'ч' },
};

const decimals = (n: number, digits: number, lang: NumLang) =>
  new Intl.NumberFormat(TAG[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

/** en: $1.23M · $1.30M · $245K · $12.0K · $980 — uz: 1,23 mln $ — ru: 1,23 млн $ (non-breaking spaces). Three significant
 * figures; en keeps them fixed (2 decimals under 10, 1 under 100: $1.30M, never $1.3M), uz / ru trim
 * trailing zeros. `unit: false` leaves the $ off in uz / ru (bar labels, where the chart's title names the currency). `trim`
 * drops trailing zeros in en too: axis ticks only ($0, $500K, $1M, $1.5M). */
export function formatUsdCompact(value: number | null, lang: NumLang = 'en', unit = true, trim = lang !== 'en'): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  const sign = value < 0 ? '−' : '';
  const v = Math.abs(value);
  const s = SCALE[lang];
  const money = (n: string, suffix: string) =>
    lang === 'en' ? `${sign}$${n}${suffix}` : `${sign}${n}${suffix}${unit ? `${NB}$` : ''}`;
  const scaled = (n: number, suffix: string) => {
    const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
    const fixed = lang === 'en' ? n.toFixed(digits) : decimals(n, digits, lang);
    const text = trim ? trimZeros(fixed, lang === 'en' ? '.' : ',') : fixed;
    return money(text, suffix);
  };
  if (v >= 1e9) return scaled(v / 1e9, s.b);
  if (v >= 1e6) return scaled(v / 1e6, s.m);
  if (v >= 1e3) return scaled(v / 1e3, s.k);
  return money(String(Math.round(v)), '');
}

/** Axis ticks: $0, $250K, $1M, $1.5M (round steps, so trailing zeros are dropped). */
export function formatUsdAxis(value: number, lang: NumLang = 'en'): string {
  return formatUsdCompact(value, lang, false, true);
}

/** en $1,234,567 · uz / ru 1 234 567 $ */
export function formatUsd(value: number | null, lang: NumLang = 'en'): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  if (lang === 'en') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
  return `${formatInt(value, lang)}${NB}$`;
}

/** en 1,234 · uz / ru 1 234 */
export function formatInt(value: number | null, lang: NumLang = 'en'): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  return new Intl.NumberFormat(TAG[lang], { maximumFractionDigits: 0 }).format(value);
}

/** 0.8742 -> en "87.4%" · uz / ru "87,4%" */
export function formatPct(ratio: number | null, digits = 1, lang: NumLang = 'en'): string {
  if (ratio === null || !Number.isFinite(ratio)) return DASH;
  return lang === 'en' ? `${(ratio * 100).toFixed(digits)}%` : `${decimals(ratio * 100, digits, lang)}%`;
}

/** 5.08 -> en "5.1 h" · uz "5,1 soat" · ru "5,1 ч" */
export function formatHours(hours: number | null, digits = 1, lang: NumLang = 'en'): string {
  if (hours === null || !Number.isFinite(hours)) return DASH;
  const n = lang === 'en' ? hours.toFixed(digits) : decimals(hours, digits, lang);
  return `${n}${lang === 'en' ? ' ' : NB}${SCALE[lang].hours}`;
}

/** A bare number for a column or bar whose header or axis names the unit: en 4.2 · uz / ru 4,2. */
export function formatDecimal(value: number | null, digits = 1, lang: NumLang = 'en'): string {
  if (value === null || !Number.isFinite(value)) return DASH;
  return lang === 'en' ? value.toFixed(digits) : decimals(value, digits, lang);
}

/** The unit words a chart's axis carries when its bars are labelled bare: uz «ming $» · ru «тыс. $». */
export function scaleWords(lang: NumLang): { k: string; hours: string } {
  return { k: SCALE[lang].k.trim(), hours: SCALE[lang].hours };
}

function trimZeros(s: string, point = '.'): string {
  if (!s.includes(point)) return s;
  const esc = point === '.' ? '\\.' : point;
  return s.replace(new RegExp(`${esc}?0+$`), '');
}

/** Round axis ticks: 0 → a "nice" ceiling above max in steps of 1, 2, 2.5 or 5 × 10^k. */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / target;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

/** Quarter names never break inside at a phone's width: «1-chorakka» keeps its hyphen (U+2011),
 * «1-му кв.» and «к 1-му» keep their spaces (U+00A0). */
export function keepQuartersTogether(s: string): string {
  return s
    .replace(/(\d)-/g, '$1‑')
    .replace(/ кв\./g, `${NB}кв.`)
    .replace(/(^|\s)к /g, `$1к${NB}`);
}
