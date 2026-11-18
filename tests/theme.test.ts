import { describe, it } from 'node:test';
import { existsSync } from 'node:fs';
import { expect } from './expect';
import { read } from './helpers';
import { CHART_THEME } from '../src/lib/theme';

// Paper, ink and one red, hairline rules, square corners; Inter Tight / Inter / IBM Plex Mono.
describe('Avada theme', () => {
  const css = read('src/index.css');

  it('light tokens are the Avada theme\'s: white paper, ink text and buttons, hairline rules, the red signal', () => {
    for (const t of ['--page: #ffffff;', '--ink: #0b0b0b;', '--muted: #6a6a67;', '--border: #e4e4e2;', '--button: #0b0b0b;', '--signal: #e3261b;']) {
      expect(css.includes(t) ? t : `missing ${t}`).toBe(t);
    }
    expect(/#2a78d6|#eb6834|#1c5cab/i.test(css)).toBe(false);
  });

  it('square corners and Avada\'s three faces, self-hosted', () => {
    for (const r of ['sm', 'md', 'lg', 'xl']) expect(css.includes(`--radius-${r}: 0px;`)).toBe(true);
    expect(css.includes("--font-sans: 'Inter'")).toBe(true);
    expect(css.includes("--font-display: 'Inter Tight'")).toBe(true);
    expect(css.includes("--font-mono: 'IBM Plex Mono'")).toBe(true);
    for (const f of ['inter-latin-wght-normal.woff2', 'inter-tight-latin-wght-normal.woff2', 'ibm-plex-mono-latin-400-normal.woff2', 'OFL-Inter.txt']) {
      expect(existsSync(new URL(`../public/fonts/${f}`, import.meta.url)) ? f : `missing ${f}`).toBe(f);
    }
  });

  it('the Avada wordmark opens the page; no rounded card or shadow is left', () => {
    const app = read('src/App.tsx');
    expect(app.includes("import { AvadaWordmark } from './ui/logo';")).toBe(true);
    expect(app.includes('<AvadaWordmark')).toBe(true);
    for (const f of ['src/App.tsx', 'src/components/ui.tsx', 'src/components/KpiGrid.tsx', 'src/components/CoverageNotice.tsx']) {
      expect(/rounded-(lg|xl)|shadow-\[0_1px/.test(read(f)) ? `${f} still rounded or shadowed` : f).toBe(f);
    }
  });

  it('charts are ink: the series ink, the comparison grey, the warning red', () => {
    expect(CHART_THEME.light.tier).toEqual({ Enterprise: '#0b0b0b', Standard: '#a3a39e' });
    expect(CHART_THEME.light.warn).toBe('#e3261b');
    expect(CHART_THEME.dark.tier.Enterprise).toBe('#f4f4f1');
  });
});

const lum = (hex: string) => {
  const c = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};

describe('one colour per metric, in both themes', () => {
  const metricsOf = (t: 'light' | 'dark') =>
    (CHART_THEME[t] as unknown as { metric?: Record<string, { Enterprise: string; Standard: string }> }).metric;

  it('four metrics, two tier shades each; revenue is Avada\'s red', () => {
    for (const t of ['light', 'dark'] as const) {
      const m = metricsOf(t);
      expect(m ? Object.keys(m) : []).toEqual(['revenue', 'retention', 'activeClients', 'resolution']);
    }
    expect(metricsOf('light')?.revenue?.Standard).toBe('#e3261b');
    expect(metricsOf('dark')?.revenue?.Standard).toBe('#ff5a4f');
  });

  it('every chart mark ≥ 3:1 on the surface; the two tiers of a metric clearly apart; metrics in different hues', () => {
    for (const t of ['light', 'dark'] as const) {
      const surface = CHART_THEME[t].surface;
      expect(metricsOf(t) ? 'metric' : 'CHART_THEME has no metric colours').toBe('metric');
      const m = metricsOf(t)!;
      for (const [name, shades] of Object.entries(m)) {
        for (const c of [shades.Enterprise, shades.Standard]) {
          expect(contrast(c, surface) >= 3 ? name : `${t} ${name} ${c} is ${contrast(c, surface).toFixed(2)}:1`).toBe(name);
        }
        expect(contrast(shades.Enterprise, shades.Standard) >= 1.6 ? name : `${t} ${name} tiers too close`).toBe(name);
      }
      expect(new Set(Object.values(m).map((s) => s.Standard)).size).toBe(4);
    }
  });

  it('the CSS tokens carry the same colours, and the cards, charts and table read them', () => {
    const css = read('src/index.css');
    for (const t of ['light', 'dark'] as const) {
      expect(metricsOf(t) ? 'metric' : 'CHART_THEME has no metric colours').toBe('metric');
      for (const shades of Object.values(metricsOf(t)!)) {
        expect(css.includes(shades.Standard) ? shades.Standard : `index.css lacks ${shades.Standard}`).toBe(shades.Standard);
      }
    }
    for (const f of ['src/components/KpiGrid.tsx', 'src/components/TrendCard.tsx', 'src/components/SegmentCard.tsx', 'src/components/SummaryTable.tsx']) {
      expect(/metric(Color|\.|\[)|--m-|bg-m-|METRIC_TOKEN/.test(read(f)) ? f : `${f} has no metric colour`).toBe(f);
    }
  });
});
