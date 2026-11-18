import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'bod-theme';
const media = () => (typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null);

function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme() {
  const [preference, setPref] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(() => media()?.matches ?? false);

  useEffect(() => {
    const m = media();
    if (!m) return;
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') delete root.dataset.theme;
    else root.dataset.theme = preference;
    try {
      if (preference === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, preference);
    } catch {
      /* storage unavailable: the choice lasts for this visit only */
    }
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => setPref(p), []);
  const resolved: ResolvedTheme = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  return { preference, resolved, setPreference };
}

/** Chart colours per theme (SVG attributes need concrete values). Mirrors the CSS tokens. */
export const CHART_THEME = {
  light: {
    surface: '#ffffff',
    ink: '#0b0b0b',
    ink2: '#3a3a3a',
    muted: '#6a6a67',
    grid: '#e4e4e2',
    axis: '#cfcfca',
    warn: '#e3261b',
    cursor: 'rgba(11,11,11,0.05)',
    // Avada's charts are ink, not a palette (avada-theme.css --chart-*): the series ink, the second the comparison grey
    tier: { Enterprise: '#0b0b0b', Standard: '#a3a39e' },
    // One colour per metric: Standard the base, Enterprise the deep shade; mirrors --m-* in index.css.
    metric: {
      revenue: { Enterprise: '#9e1810', Standard: '#e3261b' },
      retention: { Enterprise: '#0a5340', Standard: '#148f6f' },
      activeClients: { Enterprise: '#123f8c', Standard: '#2f6fd6' },
      resolution: { Enterprise: '#7a4100', Standard: '#b86e00' },
    },
  },
  dark: {
    surface: '#101010',
    ink: '#f4f4f1',
    ink2: '#c9c9c4',
    muted: '#8f8f8a',
    grid: '#262624',
    axis: '#3a3a37',
    warn: '#ff5a4f',
    cursor: 'rgba(255,255,255,0.06)',
    tier: { Enterprise: '#f4f4f1', Standard: '#6b6b67' },
    // dark: the base lifted to the dark theme's red and its kin, Enterprise the light shade (the stronger mark on black)
    metric: {
      revenue: { Enterprise: '#ffbdb7', Standard: '#ff5a4f' },
      retention: { Enterprise: '#8fe0c2', Standard: '#1e9e76' },
      activeClients: { Enterprise: '#a9c8ff', Standard: '#3d7fe0' },
      resolution: { Enterprise: '#ffd08a', Standard: '#c27a12' },
    },
  },
} as const;

export type MetricKey = keyof (typeof CHART_THEME)['light']['metric'];

/** The metric's colour as Tailwind classes (literal, so Tailwind generates them): a swatch / rule and its deep shade. */
export const METRIC_TOKEN: Record<MetricKey, { bg: string; deep: string; border: string }> = {
  revenue: { bg: 'bg-m-revenue', deep: 'bg-m-revenue-deep', border: 'border-m-revenue' },
  retention: { bg: 'bg-m-retention', deep: 'bg-m-retention-deep', border: 'border-m-retention' },
  activeClients: { bg: 'bg-m-active', deep: 'bg-m-active-deep', border: 'border-m-active' },
  resolution: { bg: 'bg-m-resolution', deep: 'bg-m-resolution-deep', border: 'border-m-resolution' },
};

export type ChartTheme = (typeof CHART_THEME)[ResolvedTheme];
