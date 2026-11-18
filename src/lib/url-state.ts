import { QUARTERS, REGIONS, TIERS } from '../data/types';
import { NO_FILTERS, type Filters } from './metrics';

/** Filters live in the query string so a filtered view can be bookmarked or shared. */
export function readFiltersFromUrl(search = window.location.search): Filters {
  const p = new URLSearchParams(search);
  const list = <T extends string>(key: string, allowed: readonly T[]): T[] => {
    const values = (p.get(key) ?? '').split(',').filter((v): v is T => (allowed as readonly string[]).includes(v));
    const unique = allowed.filter((a) => values.includes(a));
    return unique.length === allowed.length ? [] : unique;
  };
  return {
    regions: list('region', REGIONS),
    quarters: list('quarter', QUARTERS),
    tiers: list('tier', TIERS),
    likeForLike: p.get('lfl') === '1',
  };
}

export function writeFiltersToUrl(f: Filters) {
  const p = new URLSearchParams(window.location.search);
  const set = (key: string, values: string[]) => (values.length ? p.set(key, values.join(',')) : p.delete(key));
  set('region', f.regions);
  set('quarter', f.quarters);
  set('tier', f.tiers);
  if (f.likeForLike) p.set('lfl', '1');
  else p.delete('lfl');
  // Keep commas readable in the address bar (?region=North,West); they are safe in a query value.
  const qs = p.toString().replace(/%2C/gi, ',');
  const url = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  try {
    window.history.replaceState(null, '', url);
  } catch {
    /* some sandboxed hosts forbid history changes; filters still work */
  }
}

export const isFiltered = (f: Filters) =>
  f.regions.length > 0 || f.quarters.length > 0 || f.tiers.length > 0 || f.likeForLike !== NO_FILTERS.likeForLike;
