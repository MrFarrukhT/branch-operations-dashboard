import { AvButton } from '../ui/controls';
import { useRef, useState } from 'react';
import { sampleDataset } from '../data/dataset';
import type { Dataset } from '../data/types';
import { useI18n } from '../lib/i18n';
import { Icon, cx } from './ui';

type Status = { kind: 'idle' } | { kind: 'reading' } | { kind: 'loaded'; text: string } | { kind: 'error'; text: string };

/**
 * «Upload data» and «Use sample data», and the line that says which data is in use. The work is done
 * by src/data/upload.ts, loaded on the first click; on a refused file nothing changes and the reason is shown.
 */
export function UploadData({ dataset, onDataset }: { dataset: Dataset; onDataset: (d: Dataset) => void }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const uploaded = dataset.origin === 'upload';

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setStatus({ kind: 'reading' });
    try {
      const up = await import('../data/upload');
      const result = await up.parseUpload(file.name, await file.arrayBuffer());
      if (!result.ok) {
        setStatus({ kind: 'error', text: result.error });
        return;
      }
      try {
        await up.saveUpload(up.indexedDbStore(), result.dataset);
      } catch {
        /* storage refused (a private window): the upload lasts for this visit only */
      }
      onDataset(result.dataset);
      setStatus({ kind: 'loaded', text: t.uploadLoaded(file.name, result.dataset.records.length) });
    } catch {
      setStatus({ kind: 'error', text: t.uploadUnreadable });
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  const backToSample = async () => {
    try {
      const up = await import('../data/upload');
      await up.forgetUpload(up.indexedDbStore());
    } catch {
      /* nothing was kept */
    }
    onDataset(sampleDataset);
    setStatus({ kind: 'loaded', text: t.sampleRestored });
  };

  const control =
    'tap inline-flex min-h-8 items-center gap-1.5 border px-3 text-[13px] font-medium transition-colors';

  return (
    <div className="no-print mx-auto max-w-[1320px] px-4 pb-3 sm:px-6" data-upload>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 text-[12.5px] text-muted" data-in-use>
          <span className="font-mono text-[11px] font-medium tracking-[0.06em] uppercase">
            {uploaded ? t.dataYours : t.dataSample}
          </span>{' '}
          · <span className="font-medium break-all text-ink-2">{dataset.fileName}</span> · {t.dataRows(dataset.records.length)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => void onFile(e.target.files?.[0])}
            data-upload-input
          />
          <AvButton
            type="button"
            onClick={() => input.current?.click()}
            disabled={status.kind === 'reading'}
            title={t.uploadHelp}
            className={cx(control, 'border-button bg-button text-on-button hover:opacity-90 disabled:opacity-60')}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-3.5 shrink-0">
              <path d="M8 10.4v-8M4.8 5.4 8 2.2l3.2 3.2" />
              <path d="M2.6 12.6v1.2h10.8v-1.2" />
            </svg>
            {t.uploadData}
          </AvButton>
          {uploaded && (
            <AvButton
              type="button"
              onClick={() => void backToSample()}
              className={cx(control, 'border-line-strong bg-surface text-ink-2 hover:border-ink hover:text-ink')}
            >
              {Icon.reset('size-3.5')}
              {t.useSample}
            </AvButton>
          )}
        </div>
      </div>
      <div aria-live="polite">
        {status.kind === 'reading' && <p className="mt-2 text-[12.5px] text-muted">{t.uploadReading}</p>}
        {status.kind === 'loaded' && <p className="mt-2 text-[12.5px] text-muted" data-upload-ok>{status.text}</p>}
      </div>
      {status.kind === 'error' && (
        <div
          role="alert"
          className="mt-2 flex items-start gap-2.5 border border-l-[3px] border-warn-border border-l-signal bg-warn-bg px-3 py-2 text-[13px] text-warn-ink"
          data-upload-error
        >
          <span className="mt-px text-warn-icon">{Icon.warn('size-3.5')}</span>
          <p className="min-w-0 flex-1">
            <span className="font-semibold">{t.uploadFailed}</span> {status.text} {t.uploadUnchanged}
          </p>
          <AvButton
            type="button"
            onClick={() => setStatus({ kind: 'idle' })}
            className="tap -my-1 inline-flex items-center justify-center text-muted hover:text-ink"
            aria-label={t.dismiss}
          >
            {Icon.cross('size-3.5')}
          </AvButton>
        </div>
      )}
    </div>
  );
}
