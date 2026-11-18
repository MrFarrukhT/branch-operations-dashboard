import { describe, it } from 'node:test';
import { expect } from './expect';
import { rawCsv, read } from './helpers';
import { cleanBranchOperations } from '../src/data/clean';
import { NO_FILTERS, applyFilters, lastCompleteRevenueChange } from '../src/lib/metrics';
import { DICT, makeI18n } from '../src/lib/i18n';

// Regression tests for interface details: labels, units, layout classes and wording that are easy to lose in a refactor.
const { records } = cleanBranchOperations(rawCsv());
const view = (f: Partial<typeof NO_FILTERS>) => applyFilters(records, { ...NO_FILTERS, ...f }).rows;
const words = () => JSON.stringify(DICT.en);
const issues = JSON.parse(read('data/clean/data_quality_report.json')).issues as { id: string; handling: string }[];
const d = DICT.en;

describe('units and button names', () => {
  it('the resolution column names its unit and its cells are bare numbers', () => {
    expect(makeI18n('en').n.dec(4.2)).toBe('4.2');
    expect(read('src/components/SummaryTable.tsx').includes('n.dec(r.resolution)')).toBe(true);
  });

  it('bars carry their unit in the label', async () => {
    const { barLabels } = await import('../src/components/SegmentCard');
    expect(barLabels(makeI18n('en'), 'revenue').bare).toBe(false);
  });

  it('the banner button names the switch, the chart note names the button', () => {
    expect(DICT.en.compare).toBe('Show complete data only');
    expect(DICT.en.partialNote.includes(`“${DICT.en.compare}”`)).toBe(true);
  });
});

describe('segment note, ticks and touch targets', () => {
  it('the segment note says some quarters are missing, not that every quarter is', () => {
    expect(DICT.en.segGaps('A', 2, true).includes('no row for every quarter')).toBe(false);
  });

  it('the partial tick warns with ⚠', () => {
    expect(read('src/components/TrendCard.tsx').includes('▲')).toBe(false);
  });

  it('the trend chart keeps its axis-unit slot', () => {
    expect(read('src/components/TrendCard.tsx').includes('data-axis-unit')).toBe(true);
  });

  it('every control at least 24 px under a mouse too', () => {
    const css = read('src/index.css');
    expect(/@layer components \{\s*\.tap \{\s*min-height: 24px;\s*min-width: 24px;/.test(css)).toBe(true);
  });

  it('earlier wording is gone', () => {
    expect(words().includes('Like-for-like')).toBe(false);
    const clean = read('src/data/clean.ts');
    expect(clean.includes('File encoding quirks')).toBe(false);
    expect(clean.includes("title: 'Region names in mixed case'")).toBe(true);
  });

  it('over several quarters active clients leads with the last complete quarter, the sum on the grey line', () => {
    expect(read('src/components/KpiGrid.tsx').includes('value={n.int(latestComplete.activeClients)}')).toBe(true);
  });
});

describe('coverage banner and revenue change', () => {
  it('the banner keeps its comparison sentence on a phone', () => {
    const src = read('src/components/CoverageNotice.tsx');
    expect(src.includes('<p data-comparison>')).toBe(true);
    expect(src.includes('<p className="hidden sm:block">')).toBe(false);
  });

  it('the revenue ▲/▼ compares the last complete quarter with the one before, on segments in both', () => {
    // Q1 = 1 157 000 and Q2 = 1 246 000 on all six segments (computed by hand over the raw CSV): +7.69 %.
    const c = lastCompleteRevenueChange(view({}))!;
    expect(c.quarter).toBe('2025-Q2');
    expect(c.previous).toBe('2025-Q1');
    expect(Math.round(c.change * 10_000)).toBe(Math.round((1_246_000 / 1_157_000 - 1) * 10_000));
    expect(lastCompleteRevenueChange(view({ quarters: ['2025-Q3'] }))).toBe(null);
    expect(lastCompleteRevenueChange(view({ likeForLike: true }))!.quarter).toBe('2025-Q3');
    expect(DICT.en.vsPrev('2025-Q2', '2025-Q1')).toBe('Q2 vs Q1');
    expect(read('src/components/KpiGrid.tsx').includes('data-revenue-change')).toBe(true);
  });

  it('the banner button is named as the switch', () => {
    expect(DICT.en.compare).toBe('Show complete data only');
  });

  it('the chart measuring span is made hidden from page text and readers', () => {
    expect(read('index.html').includes('<span id="recharts_measurement_span" aria-hidden="true" style="visibility: hidden"></span>')).toBe(true);
  });

  it('a separator between the record and its badge', () => {
    expect(read('src/components/SummaryTable.tsx').split('<span className="sr-only">, </span>').length - 1).toBe(2);
  });

  it('footer «Made by Avada»', () => {
    expect(DICT.en.builtBy).toBe('Made by');
  });
});

describe('phone cards and banner', () => {
  it('phone cards: the first six, «Show all», each opening to its other four numbers', () => {
    const src = read('src/components/SummaryTable.tsx');
    expect(src.includes('export const PHONE_FIRST = 6;')).toBe(true);
    expect(src.includes('rows.slice(0, PHONE_FIRST)')).toBe(true);
    expect(src.includes('data-row-more')).toBe(true);
    expect(src.includes('{t.showAllRows}')).toBe(true);
    for (const col of ['t.col.newClients', 't.col.churnedClients', 't.col.tickets', 't.col.resolution']) {
      expect(src.includes(`figure(${col},`)).toBe(true);
    }
    expect(DICT.en.showAllRows).toBe('Show all');
  });

  it('the ▲/▼ quarter names go through keepQuartersTogether', () => {
    expect(read('src/components/KpiGrid.tsx').includes('keepQuartersTogether(t.vsPrev(')).toBe(true);
  });

  it('the banner gives both changes the same weight', () => {
    const src = read('src/components/CoverageNotice.tsx');
    expect(src.includes('<span className="font-semibold">{sentence.strong}</span>')).toBe(false);
  });

  it('the chart note names the banner button', () => {
    expect(DICT.en.partialNote.endsWith('To compare fairly, press “Show complete data only”.')).toBe(true);
  });
});

describe('active clients as a sum', () => {
  it('the total names active clients over several quarters as a sum', () => {
    expect(`${d.col.activeClients} (${d.activeSum(3)})`).toBe('Active (3-quarter sum)');
    const src = read('src/components/SummaryTable.tsx');
    expect(src.includes("c.key === 'activeClients' && quarterCount > 1")).toBe(true);
    expect(src.includes('`${t.col.activeClients} (${t.activeSum(quarterCount)})`')).toBe(true);
  });

  it('the opened card is two by two, numbers on one baseline', () => {
    const src = read('src/components/SummaryTable.tsx');
    expect(src.includes('grid grid-cols-4')).toBe(false);
    expect(src.includes('grid grid-cols-2 gap-x-2 gap-y-1.5 pb-1')).toBe(true);
    expect(src.includes('tabular mt-auto text-[14px]')).toBe(true);
  });
});

describe('help text, total row and control sizes', () => {
  it('the help text names the sum line the card shows, not «client-quarters»', () => {
    const all = JSON.stringify([d.defs, issues]);
    expect(/client-quarters|as specified|active_clients\./i.test(all)).toBe(false);
    expect(d.defs.some(([, b]) => b.startsWith('Sum of active clients over the selected records.') && b.includes('(each quarter counted separately)'))).toBe(true);
    const en = issues.find((x) => x.id === 'active-clients-is-a-stock')!.handling;
    expect(en.includes('with several quarters selected, the sum is given beneath it on its own line ("3-quarter sum").')).toBe(true);
  });

  it('the total row aligns at the top; its averages say «average»', () => {
    const src = read('src/components/SummaryTable.tsx');
    expect(src.includes("'px-2 py-2.5 align-top whitespace-nowrap")).toBe(true);
    expect(src.includes("(c.key === 'retention' || c.key === 'resolution') && (")).toBe(true);
    expect(d.totalAvg).toBe('average');
  });

  it('small toggles ≥ 28 px, the header toggle 32 px', () => {
    const ui = read('src/components/ui.tsx');
    expect(ui.includes("size === 'sm' ? 'min-h-7 px-2 py-1 text-xs' : size === 'bar' ? 'min-h-8")).toBe(true);
    const app = read('src/App.tsx');
    expect((app.match(/size="bar"/g) ?? []).length).toBe(1);
    expect(read('src/components/FilterBar.tsx').includes('tap inline-flex min-h-8 cursor-pointer')).toBe(true);
  });

  it('no extra space under the footer on a phone', () => {
    expect(read('src/App.tsx').includes('min-h-screen pb-[env(safe-area-inset-bottom)] md:pb-0')).toBe(true);
  });

  it('show all says how many more and folds back; the help heading a sum', () => {
    expect(d.moreRows(10)).toBe('10 more');
    expect(d.showFewerRows).toBe('Show fewer');
    expect(read('src/components/SummaryTable.tsx').includes('onClick={() => setAll(!all)}')).toBe(true);
    expect(d.defs[2]![0]).toBe('Active clients (sum)');
  });
});

describe('active-clients wording in the report', () => {
  it('finding 6 «Handled» names the card the page shows, «Active clients (sum)»', () => {
    const en = issues.find((x) => x.id === 'active-clients-is-a-stock')!.handling;
    expect(en.startsWith('Active clients (sum) adds up the filtered rows.')).toBe(true);
    expect(read('docs/DATA_QUALITY.md').includes('Active clients (sum) adds up the filtered rows.')).toBe(true);
    // the card it names is on the page, under that name
    expect(d.defs.some(([a]) => a === 'Active clients (sum)')).toBe(true);
    expect(/Total Active Clients/.test(JSON.stringify(issues))).toBe(false);
  });

  it('the card\'s sum line drops the bracket (two lines at 1440, not three); the help text keeps it', () => {
    expect(d.clientQuartersSum('3,273', 3)).toBe('3-quarter sum: 3,273');
    expect(d.defs.some(([, b]) => b.includes('(each quarter counted separately)'))).toBe(true);
  });
});

describe('no-break label', () => {
  it('the Active clients card keeps «label: number» on one line (no-break space after the colon), no word changes', () => {
    const line = DICT.en.clientQuartersSum('3,273', 3);
    expect(/: /.test(line)).toBe(false);
    expect(line.endsWith(':\u00a03,273')).toBe(true);
    expect(line.replace(/\u00a0/g, ' ')).toBe('3-quarter sum: 3,273');
  });
});
