import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { issuesByRecord, sampleDataset } from './dataset';
import type { CleanResult, Dataset } from './types';

export interface DatasetView extends Dataset {
  issuesByRecord: Map<number, CleanResult['issues']>;
}

const Ctx = createContext<DatasetView>({ ...sampleDataset, issuesByRecord: issuesByRecord(sampleDataset.issues) });

/** Every part of the page reads the data in use from here, so an upload recomputes the whole dashboard at once. */
export function DatasetProvider({ value, children }: { value: Dataset; children: ReactNode }) {
  const view = useMemo(() => ({ ...value, issuesByRecord: issuesByRecord(value.issues) }), [value]);
  return <Ctx.Provider value={view}>{children}</Ctx.Provider>;
}

export const useDataset = () => useContext(Ctx);
