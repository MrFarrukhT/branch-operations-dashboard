import type { CleanResult } from './types';

/** The structured JSON the task asks for: metadata plus the clean records. */
export function toCleanJson(result: CleanResult): string {
  return (
    JSON.stringify(
      {
        source: result.source.file,
        recordCount: result.records.length,
        fields: {
          recordId: 'integer',
          quarter: '"2025-Q1" | "2025-Q2" | "2025-Q3"',
          region: '"North" | "South" | "West"',
          branchName: 'string',
          serviceTier: '"Enterprise" | "Standard"',
          activeClients: 'integer (opening client base of the quarter)',
          newClients: 'integer',
          churnedClients: 'integer',
          revenueUsd: 'number (USD)',
          supportTickets: 'integer',
          avgResolutionHrs: 'number (hours) | null when the source had no value',
        },
        records: result.records,
      },
      null,
      2,
    ) + '\n'
  );
}

export function toReportJson(result: CleanResult): string {
  const { issues, checks, coverage, rejected, source } = result;
  return JSON.stringify({ source, issues, checks, coverage, rejected }, null, 2) + '\n';
}
