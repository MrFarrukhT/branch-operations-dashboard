/**
 * Parse and clean branch_operations CSV text into typed records, and describe
 * every data-quality problem found on the way.
 *
 * Nothing here is specific to the 16 rows we were given: each issue is
 * *detected* (casing drift, missing-value tokens, mixed precision, coverage
 * gaps, duplicates, logic violations), so a fresh export with different
 * problems produces a different, still-accurate report.
 *
 * Pure functions only - no file system - so the browser, the build script and
 * the tests all share exactly one implementation.
 */
import {
  QUARTERS,
  REGIONS,
  TIERS,
  type BranchRecord,
  type CleanResult,
  type CoverageCell,
  type DataIssue,
  type IssueSeverity,
  type Quarter,
  type Region,
  type RejectedRow,
  type Tier,
  type ValidationCheck,
} from './types';

export const EXPECTED_COLUMNS = [
  'record_id',
  'quarter',
  'region',
  'branch_name',
  'service_tier',
  'active_clients',
  'new_clients',
  'churned_clients',
  'revenue_usd',
  'support_tickets',
  'avg_resolution_hrs',
] as const;

type Column = (typeof EXPECTED_COLUMNS)[number];

/** Tokens that mean "no value" in exports we see in practice. Compared case-insensitively. */
export const MISSING_TOKENS = ['', 'n/a', 'na', 'null', 'none', '-', '--', 'nan', '#n/a'];

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180: quoted fields, escaped quotes, CRLF or LF)
// ---------------------------------------------------------------------------

export interface ParsedCsv {
  header: string[];
  rows: { line: number; cells: string[]; raw: string }[];
  blankLines: number[];
  lineEnding: 'CRLF' | 'LF' | 'mixed';
  trailingNewline: boolean;
  hadBom: boolean;
}

export function parseCsv(input: string): ParsedCsv {
  const hadBom = input.charCodeAt(0) === 0xfeff;
  const text = hadBom ? input.slice(1) : input;

  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  const lineEnding: ParsedCsv['lineEnding'] = crlf > 0 && lf > 0 ? 'mixed' : crlf > 0 ? 'CRLF' : 'LF';
  const trailingNewline = /\r?\n$/.test(text);

  const records: { line: number; cells: string[]; raw: string }[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordStartLine = 1;
  let recordStart = 0;

  const endRecord = (endIndex: number) => {
    cells.push(field);
    records.push({ line: recordStartLine, cells, raw: text.slice(recordStart, endIndex) });
    cells = [];
    field = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      cells.push(field);
      field = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      // handled by the \n on the next iteration
    } else if (ch === '\n') {
      endRecord(text[i - 1] === '\r' ? i - 1 : i);
      line++;
      recordStartLine = line;
      recordStart = i + 1;
    } else field += ch;
  }
  if (field !== '' || cells.length > 0) endRecord(text.length);

  const blankLines: number[] = [];
  const nonBlank = records.filter((r) => {
    const blank = r.cells.length === 1 && r.cells[0]!.trim() === '';
    if (blank) blankLines.push(r.line);
    return !blank;
  });

  const [head, ...rows] = nonBlank;
  return {
    header: head ? head.cells.map((c) => c.trim()) : [],
    rows,
    blankLines,
    lineEnding,
    trailingNewline,
    hadBom,
  };
}

// ---------------------------------------------------------------------------
// Field normalisers
// ---------------------------------------------------------------------------

export function isMissing(raw: string): boolean {
  return MISSING_TOKENS.includes(raw.trim().toLowerCase());
}

/** Case- and whitespace-insensitive match against a closed vocabulary. */
export function matchVocabulary<T extends string>(raw: string, vocabulary: readonly T[]): T | null {
  const key = raw.trim().replace(/\s+/g, ' ').toLowerCase();
  return vocabulary.find((v) => v.toLowerCase() === key) ?? null;
}

/** Accepts "2025-Q1", "2025 q1", "2025Q1", "2025_Q1". */
export function normalizeQuarter(raw: string): Quarter | null {
  const m = /^\s*(\d{4})\s*[-_ ]?\s*q\s*([1-4])\s*$/i.exec(raw);
  if (!m) return null;
  const candidate = `${m[1]}-Q${m[2]}`;
  return (QUARTERS as readonly string[]).includes(candidate) ? (candidate as Quarter) : null;
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/;

export function parseNumber(raw: string): number | null {
  const t = raw.trim();
  return NUMBER_RE.test(t) ? Number(t) : null;
}

export function decimalPlaces(raw: string): number {
  const t = raw.trim();
  const dot = t.indexOf('.');
  return dot === -1 ? 0 : t.length - dot - 1;
}

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2, info: 3 };

const INTEGER_COLUMNS: Column[] = ['active_clients', 'new_clients', 'churned_clients', 'support_tickets'];

const segmentKey = (q: string, r: string, t: string) => `${q}|${r}|${t}`;

interface Drift {
  recordId: number;
  raw: string;
  canonical: string;
}

export function cleanBranchOperations(csvText: string, fileName = 'branch_operations_2025.csv'): CleanResult {
  const parsed = parseCsv(csvText);
  const header = parsed.header.map((h) => h.toLowerCase());
  const missingColumns = EXPECTED_COLUMNS.filter((c) => !header.includes(c));
  if (missingColumns.length > 0) {
    throw new Error(`CSV is missing required column(s): ${missingColumns.join(', ')}`);
  }
  const col = Object.fromEntries(EXPECTED_COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<Column, number>;

  const records: BranchRecord[] = [];
  const rejected: RejectedRow[] = [];
  const regionDrift: Drift[] = [];
  const tierDrift: Drift[] = [];
  const quarterDrift: Drift[] = [];
  const whitespace: Drift[] = [];
  const missingResolution: Drift[] = [];
  const precision = new Map<Column, Map<number, number[]>>(); // column -> decimals -> recordIds

  for (const row of parsed.rows) {
    const get = (c: Column) => row.cells[col[c]] ?? '';
    const reject = (reason: string) => rejected.push({ line: row.line, raw: row.raw, reason });

    if (row.cells.length !== header.length) {
      reject(`expected ${header.length} fields, found ${row.cells.length}`);
      continue;
    }

    const recordId = parseNumber(get('record_id'));
    if (recordId === null || !Number.isInteger(recordId)) {
      reject(`record_id "${get('record_id')}" is not an integer`);
      continue;
    }

    for (const c of EXPECTED_COLUMNS) {
      const raw = get(c);
      if (raw !== raw.trim()) whitespace.push({ recordId, raw: `${c}="${raw}"`, canonical: raw.trim() });
    }

    const quarter = normalizeQuarter(get('quarter'));
    if (!quarter) {
      reject(`unrecognised quarter "${get('quarter')}"`);
      continue;
    }
    if (get('quarter').trim() !== quarter) quarterDrift.push({ recordId, raw: get('quarter'), canonical: quarter });

    const region = matchVocabulary<Region>(get('region'), REGIONS);
    if (!region) {
      reject(`unrecognised region "${get('region')}"`);
      continue;
    }
    if (get('region').trim() !== region) regionDrift.push({ recordId, raw: get('region'), canonical: region });

    const tier = matchVocabulary<Tier>(get('service_tier'), TIERS);
    if (!tier) {
      reject(`unrecognised service_tier "${get('service_tier')}"`);
      continue;
    }
    if (get('service_tier').trim() !== tier) tierDrift.push({ recordId, raw: get('service_tier'), canonical: tier });

    const numbers: Partial<Record<Column, number>> = {};
    let bad: string | null = null;
    for (const c of [...INTEGER_COLUMNS, 'revenue_usd'] as Column[]) {
      const raw = get(c);
      const n = parseNumber(raw);
      if (n === null) bad = `${c} "${raw}" is ${isMissing(raw) ? 'missing' : 'not a number'} (required)`;
      else if (n < 0) bad = `${c} ${raw} is negative`;
      else if (INTEGER_COLUMNS.includes(c) && !Number.isInteger(n)) bad = `${c} ${raw} is not a whole count`;
      if (bad) break;
      numbers[c] = n!;
      trackPrecision(precision, c, raw, recordId);
    }
    if (bad) {
      reject(bad);
      continue;
    }

    const rawHrs = get('avg_resolution_hrs');
    let avgResolutionHrs: number | null = null;
    if (isMissing(rawHrs)) {
      missingResolution.push({ recordId, raw: rawHrs, canonical: 'null' });
    } else {
      avgResolutionHrs = parseNumber(rawHrs);
      if (avgResolutionHrs === null || avgResolutionHrs < 0) {
        reject(`avg_resolution_hrs "${rawHrs}" is not a valid duration`);
        continue;
      }
      trackPrecision(precision, 'avg_resolution_hrs', rawHrs, recordId);
    }

    records.push({
      recordId,
      quarter,
      region,
      branchName: get('branch_name').trim().replace(/\s+/g, ' '),
      serviceTier: tier,
      activeClients: numbers.active_clients!,
      newClients: numbers.new_clients!,
      churnedClients: numbers.churned_clients!,
      revenueUsd: numbers.revenue_usd!,
      supportTickets: numbers.support_tickets!,
      avgResolutionHrs,
    });
  }

  // Duplicates: keep the first occurrence so totals are never double counted.
  const seenIds = new Set<number>();
  const seenSegments = new Map<string, number>();
  const duplicateIds: number[] = [];
  const duplicateSegments: { recordId: number; keptId: number }[] = [];
  const unique: BranchRecord[] = [];
  for (const r of records) {
    const key = segmentKey(r.quarter, r.region, r.serviceTier);
    if (seenIds.has(r.recordId)) duplicateIds.push(r.recordId);
    else if (seenSegments.has(key)) duplicateSegments.push({ recordId: r.recordId, keptId: seenSegments.get(key)! });
    else {
      seenIds.add(r.recordId);
      seenSegments.set(key, r.recordId);
      unique.push(r);
    }
  }
  unique.sort((a, b) => a.recordId - b.recordId);

  const coverage = buildCoverage(unique);
  const issues: DataIssue[] = [];

  // --- completeness -------------------------------------------------------
  const missingCells = coverage.filter((c) => c.recordId === null);
  for (const quarter of QUARTERS) {
    const gaps = missingCells.filter((c) => c.quarter === quarter);
    if (gaps.length === 0) continue;
    const expected = coverage.filter((c) => c.quarter === quarter).length;
    const names = gaps.map((g) => `${g.region} · ${g.tier}`).join(' and ');
    const derivable = gaps
      .filter((g) => g.derivableActiveClients !== null)
      .map((g) => `${g.region} · ${g.tier} ≈ ${g.derivableActiveClients}`)
      .join(', ');
    issues.push({
      id: `missing-segments-${quarter}`,
      severity: 'high',
      category: 'completeness',
      title: `${quarter} is incomplete: ${expected - gaps.length} of ${expected} segments reported`,
      summary:
        `${quarter} has no ${gaps.length === 1 ? 'row' : 'rows'} for ${names} (${gaps.length} of ${expected} segments). ` +
        'Nothing was estimated; the quarter is marked as partial.',
      detail:
        `No row exists for ${names} in ${quarter}. Every other quarter has all ${expected} region × tier segments, ` +
        `so ${quarter} totals (revenue, active clients, tickets) are not comparable with earlier quarters.` +
        (derivable ? ` The prior-quarter flow would put their opening active clients at ${derivable}.` : ''),
      recordIds: [],
      handling:
        'Rows are NOT imputed. The dashboard flags the quarter as partial on the trend chart and in a notice, ' +
        'and offers a "Complete data only" switch that keeps only segments reported in every selected quarter.',
      rationale:
        'Revenue, tickets and resolution time cannot be derived from other columns, and a guessed number would ' +
        'look exactly like a real one. Showing the gap keeps every figure on screen traceable to a source row.',
    });
  }

  // --- consistency --------------------------------------------------------
  if (regionDrift.length > 0) {
    issues.push({
      id: 'region-casing',
      severity: 'medium',
      category: 'consistency',
      title: 'Region names in mixed case',
      summary: `${rows(regionDrift.length)} had a region name in the wrong case (${quoted(regionDrift)}). Corrected.`,
      detail: `${describeDrift(regionDrift)}. Grouped as-is, "North" and "north" would become two separate regions.`,
      recordIds: regionDrift.map((d) => d.recordId),
      handling: `Matched case-insensitively against the known regions (${REGIONS.join(', ')}) and rewritten in canonical Title Case.`,
      rationale: regionConfirmedByBranch(regionDrift, unique)
        ? 'The branch name confirms the region in every affected row (each branch appears under exactly one region ' +
          'elsewhere), so the correction is certain, not a guess. Unknown spellings would be rejected rather than coerced.'
        : 'Only the spelling differs from a known region. Unknown spellings would be rejected rather than coerced.',
    });
  }
  if (tierDrift.length > 0) {
    issues.push({
      id: 'tier-casing',
      severity: 'medium',
      category: 'consistency',
      title: 'Inconsistent service-tier casing',
      summary: `${rows(tierDrift.length)} had a service tier in the wrong case (${quoted(tierDrift)}). Corrected.`,
      detail: describeDrift(tierDrift),
      recordIds: tierDrift.map((d) => d.recordId),
      handling: `Matched case-insensitively against ${TIERS.join(' / ')} and rewritten canonically.`,
      rationale: 'Same value, different spelling; grouping must not split it.',
    });
  }
  if (quarterDrift.length > 0) {
    issues.push({
      id: 'quarter-format',
      severity: 'low',
      category: 'consistency',
      title: 'Inconsistent quarter format',
      summary: `${rows(quarterDrift.length)} wrote the quarter another way (${quoted(quarterDrift)}). Rewritten as YYYY-Qn.`,
      detail: describeDrift(quarterDrift),
      recordIds: quarterDrift.map((d) => d.recordId),
      handling: 'Normalised to the YYYY-Qn form.',
      rationale: 'Quarters sort and group as strings; one spelling keeps that correct.',
    });
  }
  if (duplicateIds.length > 0 || duplicateSegments.length > 0) {
    issues.push({
      id: 'duplicates',
      severity: 'high',
      category: 'consistency',
      title: 'Duplicate rows',
      summary: `${rows(duplicateIds.length + duplicateSegments.length)} repeated an earlier row. The first copy was kept, the repeats removed.`,
      detail: [
        duplicateIds.length ? `Repeated record_id: ${duplicateIds.join(', ')}` : '',
        ...duplicateSegments.map((d) => `record ${d.recordId} repeats the segment of record ${d.keptId}`),
      ]
        .filter(Boolean)
        .join('; '),
      recordIds: [...duplicateIds, ...duplicateSegments.map((d) => d.recordId)],
      handling: 'The first occurrence is kept; later copies are dropped.',
      rationale: 'Summing both copies would double count revenue and clients.',
    });
  }

  // --- missing values -----------------------------------------------------
  if (missingResolution.length > 0) {
    issues.push({
      id: 'missing-resolution-time',
      severity: 'medium',
      category: 'completeness',
      title: 'Missing average resolution time',
      summary:
        `${rows(missingResolution.length)} had no resolution time (${quoted(missingResolution)}). ` +
        'Left blank and excluded from the resolution-time average.',
      detail: `${describeDrift(missingResolution, 'avg_resolution_hrs')} — a text placeholder in a numeric column. The row's other fields are complete.`,
      recordIds: missingResolution.map((d) => d.recordId),
      handling:
        'Stored as null (not 0). The record stays in every other KPI; the resolution-time average is taken over ' +
        'records that have a value, and the card says how many were excluded.',
      rationale:
        'Zero would claim the tickets were solved instantly and drag the average down; dropping the whole row ' +
        'would lose valid revenue and client figures. Filling from neighbours would invent a measurement.',
    });
  }

  // --- format ------------------------------------------------------------
  for (const [column, byPlaces] of precision) {
    if (byPlaces.size < 2) continue;
    const [common] = [...byPlaces.entries()].sort((a, b) => b[1].length - a[1].length);
    const outliers = [...byPlaces.entries()].filter(([places]) => places !== common![0]).flatMap(([, ids]) => ids);
    issues.push({
      id: `precision-${column}`,
      severity: 'low',
      category: 'format',
      title: `Mixed number precision in ${column}`,
      summary: `${rows(outliers.length)} gave the resolution time with a different number of decimals. Same value; nothing changed.`,
      detail:
        `Most values carry ${plural(common![0], 'decimal place')}, but ${outliers.length === 1 ? 'record' : 'records'} ` +
        `${outliers.join(', ')} ${outliers.length === 1 ? 'does' : 'do'} not (e.g. "6" where "6.0" is expected).`,
      recordIds: outliers,
      handling: 'Parsed as numbers, so "6" and "6.0" are the same value. Display precision is set by the UI, not the source.',
      rationale: 'Harmless to the maths, but it hints at a hand-edited or differently exported row, worth telling the data owner.',
    });
  }
  if (whitespace.length > 0) {
    issues.push({
      id: 'whitespace',
      severity: 'low',
      category: 'format',
      title: 'Leading or trailing whitespace',
      summary: `${rows(new Set(whitespace.map((w) => w.recordId)).size)} had extra spaces around a value. The spaces were removed.`,
      detail: whitespace.map((w) => `record ${w.recordId}: ${w.raw}`).join('; '),
      recordIds: [...new Set(whitespace.map((w) => w.recordId))],
      handling: 'Trimmed.',
      rationale: 'Invisible spaces split groups and break exact matches.',
    });
  }
  if (parsed.lineEnding !== 'LF' || !parsed.trailingNewline || parsed.hadBom || parsed.blankLines.length > 0) {
    const notes = [
      parsed.lineEnding !== 'LF' ? `${parsed.lineEnding} (Windows) line endings` : '',
      !parsed.trailingNewline ? 'no newline after the last row' : '',
      parsed.hadBom ? 'a UTF-8 byte-order mark' : '',
      parsed.blankLines.length ? `blank line(s) at ${parsed.blankLines.join(', ')}` : '',
    ].filter(Boolean);
    const plain = [
      parsed.lineEnding !== 'LF' ? 'Windows line endings' : '',
      !parsed.trailingNewline ? 'no line break after the last row' : '',
      parsed.hadBom ? 'a hidden marker at the start' : '',
      parsed.blankLines.length ? `${plural(parsed.blankLines.length, 'blank line')}` : '',
    ].filter(Boolean);
    issues.push({
      id: 'file-format',
      severity: 'info',
      category: 'format',
      title: 'File format',
      summary: `The file has ${plain.join(' and ')}. Read correctly; no rows affected.`,
      detail: `The file uses ${notes.join(', ')}.`,
      recordIds: [],
      handling: 'The parser accepts CRLF and LF, a missing final newline and a BOM; blank lines are skipped.',
      rationale:
        'A naive split on "\\n" leaves "\\r" glued to the last column ("4.2\\r"), which turns numbers into text. ' +
        'Handled in the parser so no value is affected.',
    });
  }
  if (rejected.length > 0) {
    issues.push({
      id: 'rejected-rows',
      severity: 'high',
      category: 'consistency',
      title: `${rejected.length} row(s) could not be used`,
      summary: `${rows(rejected.length)} could not be read (an unknown name or a missing number). Left out.`,
      detail: rejected.map((r) => `line ${r.line}: ${r.reason}`).join('; '),
      recordIds: [],
      handling: 'Excluded from the dataset and listed here.',
      rationale: 'A row with an unknown region or a non-numeric required field cannot be placed or summed safely.',
    });
  }

  // --- interpretation ----------------------------------------------------
  const flow = flowIdentity(unique);
  if (flow.pairs > 0 && flow.matches === flow.pairs) {
    issues.push({
      id: 'active-clients-is-a-stock',
      severity: 'info',
      category: 'interpretation',
      title: 'Active clients is a point-in-time count',
      summary: 'Active clients is a start-of-quarter count, so the card shows the latest complete quarter, not a sum of quarters.',
      detail:
        `In all ${flow.pairs} consecutive-quarter pairs, next quarter's active_clients = active + new − churned of the ` +
        'quarter before, so active_clients is the opening client base of each quarter.',
      recordIds: [],
      handling:
        'Active clients (sum) adds up the filtered rows. The Active clients card shows the latest complete quarter; with ' +
        'several quarters selected, the sum is given beneath it on its own line ("3-quarter sum").',
      rationale:
        'The same client is counted once per quarter, so a multi-quarter sum is not a head count. The identity ' +
        'also validates the data: it holds for every pair of rows the file lets us check.',
    });
  }

  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const checks = buildChecks(unique, rejected, duplicateIds, duplicateSegments, coverage, flow);

  return {
    records: unique,
    issues,
    checks,
    coverage,
    rejected,
    source: {
      file: fileName,
      dataRows: parsed.rows.length,
      lineEnding: parsed.lineEnding,
      trailingNewline: parsed.trailingNewline,
    },
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** «1 row» / «2 rows», capitalised: the start of a finding's one-line summary. */
const rows = (n: number) => (n === 1 ? 'One row' : `${n} rows`);
/** The raw values as the file had them: «"north", "WEST"». */
const quoted = (drift: Drift[]) => [...new Set(drift.map((d) => `"${d.raw.trim()}"`))].join(', ');

/** True when every re-cased row's branch is filed under the canonical region in correctly spelled rows. */
function regionConfirmedByBranch(drift: Drift[], records: BranchRecord[]): boolean {
  const exact = new Set(drift.map((d) => d.recordId));
  return drift.every((d) => {
    const row = records.find((r) => r.recordId === d.recordId);
    if (!row) return false;
    const others = records.filter((r) => r.branchName === row.branchName && !exact.has(r.recordId));
    return others.length > 0 && others.every((r) => r.region === d.canonical);
  });
}

function trackPrecision(map: Map<Column, Map<number, number[]>>, column: Column, raw: string, recordId: number) {
  if (column !== 'avg_resolution_hrs') return; // only the decimal column has a meaningful precision
  const places = decimalPlaces(raw);
  const byPlaces = map.get(column) ?? new Map<number, number[]>();
  byPlaces.set(places, [...(byPlaces.get(places) ?? []), recordId]);
  map.set(column, byPlaces);
}

function describeDrift(drift: Drift[], column?: string): string {
  return drift
    .map((d) => `record ${d.recordId} has ${column ? `${column} = ` : ''}"${d.raw}"${d.canonical !== 'null' ? ` (→ ${d.canonical})` : ''}`)
    .join('; ');
}

/** Every quarter × region × tier cell, with the record that fills it (if any). */
export function buildCoverage(records: BranchRecord[]): CoverageCell[] {
  const byKey = new Map(records.map((r) => [segmentKey(r.quarter, r.region, r.serviceTier), r]));
  const cells: CoverageCell[] = [];
  for (const quarter of QUARTERS) {
    for (const region of REGIONS) {
      for (const tier of TIERS) {
        const rec = byKey.get(segmentKey(quarter, region, tier));
        let derivable: number | null = null;
        if (!rec) {
          const prevQuarter = QUARTERS[QUARTERS.indexOf(quarter) - 1];
          const prev = prevQuarter ? byKey.get(segmentKey(prevQuarter, region, tier)) : undefined;
          if (prev) derivable = prev.activeClients + prev.newClients - prev.churnedClients;
        }
        cells.push({ quarter, region, tier, recordId: rec?.recordId ?? null, derivableActiveClients: derivable });
      }
    }
  }
  return cells;
}

/** active(q+1) === active(q) + new(q) − churned(q), for every consecutive pair present. */
export function flowIdentity(records: BranchRecord[]) {
  const byKey = new Map(records.map((r) => [segmentKey(r.quarter, r.region, r.serviceTier), r]));
  let pairs = 0;
  let matches = 0;
  const mismatches: string[] = [];
  for (const r of records) {
    const next = QUARTERS[QUARTERS.indexOf(r.quarter) + 1];
    const n = next ? byKey.get(segmentKey(next, r.region, r.serviceTier)) : undefined;
    if (!n) continue;
    pairs++;
    const expected = r.activeClients + r.newClients - r.churnedClients;
    if (expected === n.activeClients) matches++;
    else mismatches.push(`record ${n.recordId}: expected ${expected}, found ${n.activeClients}`);
  }
  return { pairs, matches, mismatches };
}

function buildChecks(
  records: BranchRecord[],
  rejected: RejectedRow[],
  duplicateIds: number[],
  duplicateSegments: unknown[],
  coverage: CoverageCell[],
  flow: ReturnType<typeof flowIdentity>,
): ValidationCheck[] {
  const ids = records.map((r) => r.recordId);
  const min = Math.min(...ids);
  const max = Math.max(...ids);
  const contiguous = ids.length > 0 && max - min + 1 === ids.length;

  const branchToRegion = new Map<string, Set<string>>();
  const regionToBranch = new Map<string, Set<string>>();
  for (const r of records) {
    branchToRegion.set(r.branchName, (branchToRegion.get(r.branchName) ?? new Set()).add(r.region));
    regionToBranch.set(r.region, (regionToBranch.get(r.region) ?? new Set()).add(r.branchName));
  }
  const oneToOne =
    [...branchToRegion.values()].every((s) => s.size === 1) && [...regionToBranch.values()].every((s) => s.size === 1);

  const churnOver = records.filter((r) => r.churnedClients > r.activeClients);
  const newOver = records.filter((r) => r.newClients > r.activeClients);
  const filled = coverage.filter((c) => c.recordId !== null).length;

  return [
    {
      id: 'all-rows-parsed',
      label: 'Every row could be read',
      passed: rejected.length === 0,
      detail: rejected.length === 0 ? `${records.length} of ${records.length} rows usable` : `${rejected.length} row(s) rejected`,
    },
    {
      id: 'unique-ids',
      label: 'Record ids are unique',
      passed: duplicateIds.length === 0,
      detail: duplicateIds.length === 0 ? `${ids.length} distinct ids` : `repeated: ${duplicateIds.join(', ')}`,
    },
    {
      id: 'contiguous-ids',
      label: 'Record ids have no gaps',
      passed: contiguous,
      detail: contiguous
        ? `${min}–${max} with no gaps: no row was dropped mid-file; the missing segments are absent from the export itself`
        : `ids span ${min}–${max} but only ${ids.length} exist`,
    },
    {
      id: 'one-row-per-segment',
      label: 'At most one row per quarter, region and tier',
      passed: duplicateSegments.length === 0,
      detail: duplicateSegments.length === 0 ? 'no duplicated segment' : `${duplicateSegments.length} duplicate(s)`,
    },
    {
      id: 'full-coverage',
      label: 'Every quarter has every segment',
      passed: filled === coverage.length,
      detail: `${filled} of ${coverage.length} quarter × region × tier cells filled`,
    },
    {
      id: 'branch-region',
      label: 'Each branch belongs to one region',
      passed: oneToOne,
      detail: [...branchToRegion.entries()].map(([b, r]) => `${b} → ${[...r].join('/')}`).join(', '),
    },
    {
      id: 'churn-le-active',
      label: 'Churned ≤ active clients',
      passed: churnOver.length === 0,
      detail: churnOver.length === 0 ? 'holds in every row' : `violated in ${churnOver.map((r) => r.recordId).join(', ')}`,
    },
    {
      id: 'new-le-active',
      label: 'New ≤ active clients',
      passed: newOver.length === 0,
      detail: newOver.length === 0 ? 'holds in every row' : `violated in ${newOver.map((r) => r.recordId).join(', ')}`,
    },
    {
      id: 'flow-identity',
      label: 'Client counts add up from quarter to quarter',
      passed: flow.mismatches.length === 0,
      detail:
        flow.mismatches.length === 0
          ? `active + new − churned = next quarter's active in ${flow.matches} of ${flow.pairs} pairs`
          : flow.mismatches.join('; '),
    },
  ];
}
