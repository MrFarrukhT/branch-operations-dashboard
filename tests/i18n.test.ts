import { describe, it } from 'node:test';
import { expect } from './expect';
import { read } from './helpers';
import { DICT, LANGS, makeI18n } from '../src/lib/i18n';
import { formatHours, formatInt, formatPct, formatUsd, formatUsdCompact } from '../src/lib/format';

// The page is in English; the number formatters also support uz and ru locales.

describe('English interface', () => {
  it('one language, English: one dictionary, no switch, no ?lang', () => {
    expect(LANGS).toEqual(['en']);
    expect(Object.keys(DICT)).toEqual(['en']);
    const html = read('index.html');
    expect(html.includes('<html lang="en">')).toBe(true);
    expect(html.includes("get('lang')")).toBe(false);
    expect(read('src/App.tsx').includes('Segmented<Lang>')).toBe(false);
  });

  it('names regions, tiers and quarters in English', () => {
    const en = makeI18n('en');
    expect(en.segment('West · Standard')).toBe('West · Standard');
    expect(en.quarter('2025-Q2')).toBe('2025-Q2');
    expect(en.quarterShort('2025-Q1')).toBe('Q1');
  });

  it('the page holds no form', () => {
    expect(/<form\b/.test(read('src/App.tsx'))).toBe(false);
  });
});

describe('numbers by locale', () => {
  it('uz and ru group thousands with a space and use a decimal comma; en stays as it was', () => {
    const sp = (s: string) => s.replace(/[  ]/g, ' ');
    expect(sp(formatInt(1234567, 'uz'))).toBe('1 234 567');
    expect(sp(formatUsd(1234567, 'ru'))).toBe('1 234 567 $');
    expect(sp(formatUsdCompact(1234567, 'uz'))).toBe('1,23 mln $');
    expect(sp(formatUsdCompact(245000, 'ru'))).toBe('245 тыс. $');
    expect(sp(formatUsdCompact(1500000, 'ru'))).toBe('1,5 млн $');
    expect(formatPct(0.8742, 1, 'uz')).toBe('87,4%');
    expect(sp(formatHours(5.08, 1, 'uz'))).toBe('5,1 soat');
    expect(sp(formatUsdCompact(1500000, 'uz', false))).toBe('1,5 mln');
    // units never break from their number (chart labels wrap at plain spaces)
    expect(/ /.test(formatUsdCompact(808000, 'uz') + formatUsd(1234567, 'ru') + formatHours(5, 1, 'ru'))).toBe(false);
    expect(formatUsdCompact(1234567)).toBe('$1.23M');
    expect(formatUsd(1234567)).toBe('$1,234,567');
  });
});

describe('the phone (< 768 px)', () => {
  it('touch targets: every control carries the 44 px rule under pointer: coarse and below 768 px', () => {
    const css = read('src/index.css');
    expect(/@media \(pointer: coarse\), \(max-width: 767px\)\s*{\s*\.tap\s*{\s*min-height: 44px;\s*min-width: 44px;/.test(css)).toBe(true);
    for (const f of ['src/components/ui.tsx', 'src/components/FilterBar.tsx', 'src/components/SummaryTable.tsx', 'src/components/DataQuality.tsx']) {
      expect(read(f).includes("'tap ") || read(f).includes('"tap ') ? f : `${f} has no .tap control`).toBe(f);
    }
  });

  it('KPIs 2 × 2, filters folded behind one row, table as cards, checks folded', () => {
    expect(read('src/components/KpiGrid.tsx').includes('grid grid-cols-2')).toBe(true);
    expect(read('src/components/FilterBar.tsx').includes('aria-controls="filter-panel"')).toBe(true);
    expect(read('src/components/SummaryTable.tsx').includes('data-row-cards')).toBe(true);
    // each finding is one plain line; the checks are folded, and come first
    const dq = read('src/components/DataQuality.tsx');
    expect((dq.match(/<details className/g) ?? []).length).toBe(1);
    expect(dq.indexOf('data-checks') < dq.indexOf('data-finding')).toBe(true);
  });
});
