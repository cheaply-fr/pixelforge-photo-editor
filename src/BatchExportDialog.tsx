import { useEffect, useRef, useState } from 'react';
import { buildBatchExport, type BatchExportResult } from './batch';
import { safeBatchStem } from './export';
import type { Assets, Frame } from './document';
import type { ExportFormat } from './export';

type Props = {
  history: Frame[];
  assets: Assets;
  name: string;
  close: () => void;
  downloaded: (message: string) => void;
};

export default function BatchExportDialog({
  history,
  assets,
  name,
  close,
  downloaded,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const rendering = useRef<AbortController | null>(null);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(92);
  const [result, setResult] = useState<BatchExportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
    return () => rendering.current?.abort();
  }, []);

  const dismiss = () => {
    rendering.current?.abort();
    close();
  };

  const build = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    setProgress(0);
    const controller = new AbortController();
    rendering.current = controller;
    try {
      const next = await buildBatchExport(
        history,
        assets,
        name,
        format,
        quality,
        (completed, total) => setProgress(Math.round((completed / total) * 100)),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setResult(next);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(
        reason instanceof Error
          ? reason.message
          : 'Batch export failed. Your editable draft is kept.',
      );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeBatchStem(name)}-history.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    downloaded(
      `Batch export downloaded (${result.manifest.snapshotCount} snapshots, ${result.blob.size.toLocaleString()} bytes)`,
    );
  };

  return (
    <dialog
      ref={dialog}
      className="editor-dialog export-dialog batch-export-dialog"
      aria-labelledby="batch-export-heading"
      onCancel={dismiss}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (result) download();
          else void build();
        }}
      >
        <h2 id="batch-export-heading">Batch export history</h2>
        <p>
          Render all {history.length} editable history snapshots into one ZIP.
          Each image is flattened locally; your source layers and draft stay on
          this device.
        </p>
        <label>
          Format
          <select
            aria-label="Batch export format"
            value={format}
            disabled={busy}
            onChange={(event) => {
              setFormat(event.target.value as ExportFormat);
              setResult(null);
            }}
          >
            <option value="png">PNG — lossless</option>
            <option value="jpeg">JPEG — smaller, opaque</option>
            <option value="webp">WebP — smaller, transparent</option>
            <option value="psd">PSD — flattened composite</option>
          </select>
        </label>
        {format !== 'png' && format !== 'psd' && (
          <label>
            Quality
            <output>{quality}%</output>
            <input
              aria-label="Batch export quality"
              type="range"
              min="1"
              max="100"
              step="1"
              value={quality}
              disabled={busy}
              onChange={(event) => {
                setQuality(Number(event.target.value));
                setResult(null);
              }}
            />
          </label>
        )}
        <output
          aria-label="Batch export progress"
          aria-live="polite"
          className="export-size"
        >
          {busy
            ? `Rendering history… ${progress}%`
            : result
              ? `${result.manifest.snapshotCount} snapshots · ${result.blob.size.toLocaleString()} bytes`
              : 'Ready to render'}
        </output>
        {error && (
          <p role="alert" className="resize-error">
            {error}
          </p>
        )}
        <p className="export-format-note">
          The ZIP contains a manifest with dimensions and byte sizes. Original
          EXIF, GPS, source color profiles and editable project assets are not
          included.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={dismiss}>
            {busy ? 'Cancel batch export' : 'Close'}
          </button>
          <button type="submit" disabled={busy}>
            {result ? 'Download batch ZIP' : 'Build batch ZIP'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
