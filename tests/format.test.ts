import { describe, it } from 'node:test';
import { expect } from './expect';
import { formatHours, formatInt, formatPct, formatUsd, formatUsdCompact, niceTicks } from '../src/lib/format';

describe('format', () => {
  it('compact USD with three significant figures, fixed', () => {
    expect(formatUsdCompact(3_460_000)).toBe('$3.46M');
    expect(formatUsdCompact(1_234_567)).toBe('$1.23M');
    // fixed precision, never trimmed: $1.20M, not $1.2M
    expect(formatUsdCompact(1_200_000)).toBe('$1.20M');
    expect(formatUsdCompact(245_000)).toBe('$245K');
    expect(formatUsdCompact(12_500)).toBe('$12.5K');
    expect(formatUsdCompact(980)).toBe('$980');
    expect(formatUsdCompact(0)).toBe('$0');
    expect(formatUsdCompact(null)).toBe('—');
  });
  it('full USD, integers, percent, hours', () => {
    expect(formatUsd(3_460_000)).toBe('$3,460,000');
    expect(formatInt(3273)).toBe('3,273');
    expect(formatPct(0.94032)).toBe('94.0%');
    expect(formatPct(0.8742)).toBe('87.4%');
    expect(formatHours(4.98)).toBe('5.0 h');
    expect(formatHours(null)).toBe('—');
    expect(formatPct(Number.NaN)).toBe('—');
  });
});

describe('niceTicks', () => {
  it('produces round steps that clear the maximum', () => {
    expect(niceTicks(1_246_000)).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    expect(niceTicks(1_282)).toEqual([0, 500, 1_000, 1_500]);
    expect(niceTicks(960_000)).toEqual([0, 250_000, 500_000, 750_000, 1_000_000]);
    expect(niceTicks(7.1)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});
