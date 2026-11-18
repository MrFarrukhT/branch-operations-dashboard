// Domain types shared by the cleaning pipeline, the metrics layer and the UI.

export const REGIONS = ['North', 'South', 'West'] as const;
export const QUARTERS = ['2025-Q1', '2025-Q2', '2025-Q3'] as const;
/** Enterprise first: it is the larger revenue line and owns categorical slot 1. */
export const TIERS = ['Enterprise', 'Standard'] as const;

export type Region = (typeof REGIONS)[number];
export type Quarter = (typeof QUARTERS)[number];
export type Tier = (typeof TIERS)[number];

/** One cleaned row of branch_operations_2025.csv. */
export interface BranchRecord {
  recordId: number;
  quarter: Quarter;
  region: Region;
  branchName: string;
  serviceTier: Tier;
  /** Clients on the books for the quarter (a stock, not a flow). */
  activeClients: number;
  newClients: number;
  churnedClients: number;
  revenueUsd: number;
  supportTickets: number;
  /** Mean ticket resolution time in hours; null when the source had no value. */
  avgResolutionHrs: number | null;
}

export type IssueSeverity = 'high' | 'medium' | 'low' | 'info';
export type IssueCategory = 'completeness' | 'consistency' | 'format' | 'interpretation';

/** A data-quality finding, produced by the cleaning code (never hand-written). */
export interface DataIssue {
  id: string;
  severity: IssueSeverity;
  category: IssueCategory;
  title: string;
  /** One plain line for the page: what was wrong, how many rows, what was done. */
  summary: string;
  /** What exactly is wrong, with the raw values quoted. */
  detail: string;
  recordIds: number[];
  /** What the pipeline did about it. */
  handling: string;
  /** Why that handling is the right call. */
  rationale: string;
}

/** A rule the cleaned data was checked against. */
export interface ValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

/** One cell of the quarter x region x tier grid. */
export interface CoverageCell {
  quarter: Quarter;
  region: Region;
  tier: Tier;
  recordId: number | null;
  /**
   * For a missing cell: the opening active-client count implied by the previous
   * quarter (active + new - churned). Reference only; never written into the data.
   */
  derivableActiveClients: number | null;
}

/** A row the cleaner could not use at all. */
export interface RejectedRow {
  line: number;
  raw: string;
  reason: string;
}

export interface CleanResult {
  records: BranchRecord[];
  issues: DataIssue[];
  checks: ValidationCheck[];
  coverage: CoverageCell[];
  rejected: RejectedRow[];
  source: {
    file: string;
    dataRows: number;
    lineEnding: 'CRLF' | 'LF' | 'mixed';
    trailingNewline: boolean;
  };
}

/** The data the page shows: the build's sample, or a file the visitor uploaded, cleaned by the same code. */
export interface Dataset extends CleanResult {
  fileName: string;
  origin: 'sample' | 'upload';
}
