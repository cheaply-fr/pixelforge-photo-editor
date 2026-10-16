import { useEffect, useRef, useState } from 'react';
import {
  buildImageBatchExport,
  buildImageBatchActionExport,
  type BatchImageExportResult,
  type BatchImageProgress,
  type BatchImageSource,
} from './imageBatch.ts';
import { actionParameterNames, type ActionParameterValues, type ActionSet } from './actions.ts';
import { safeBatchStem, type ExportFormat } from './export.ts';

type Props = {
  sources: BatchImageSource[];
  name?: string;
  close: () => void;
  downloaded: (message: string) => void;
  action?: ActionSet;
};

/** Local multi-input image export. Source files are intentionally owned by the caller. */
export default function ImageBatchDialog({
  sources,
  name,
  close,
  downloaded,
  action,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [format, setFormat] = useState<ExportFormat>('png');
  const [quality, setQuality] = useState(92);
  const [result, setResult] = useState<BatchImageExportResult | null>(null);
  const [progress, setProgress] = useState<BatchImageProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const parameterNames = action ? actionParameterNames(action) : [];
  const [parameters, setParameters] = useState<ActionParameterValues>({});

  useEffect(() => {
    dialog.current?.showModal();
    return () => controller.current?.abort();
  }, []);

  const dismiss = () => {
    controller.current?.abort();
    close();
  };

  const build = async () => {
    setBusy(true);
    setError('');
    setResult(null);
    setProgress(null);
    const nextController = new AbortController();
    controller.current = nextController;
    try {
      const next = action
        ? await buildImageBatchActionExport({
            sources,
            format,
            quality,
            action,
            parameters,
            signal: nextController.signal,
            onProgress: setProgress,
          })
        : await buildImageBatchExport({
            sources,
            format,
            quality,
            signal: nextController.signal,
            onProgress: setProgress,
          });
      if (!nextController.signal.aborted) setResult(next);
    } catch (reason) {
      if (!nextController.signal.aborted) {
        setError(
          reason instanceof Error
            ? reason.message
            : 'Batch export failed. Your editable draft is kept.',
        );
      }
    } finally {
      if (!nextController.signal.aborted) setBusy(false);
    }
  };

  const download = () => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeBatchStem(name || 'pixelforge-images')}-batch.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    downloaded(
      `Batch export downloaded (${result.manifest.exportedCount} images, ${result.blob.size.toLocaleString()} bytes)`,
    );
  };

  const completed = progress?.completed ?? 0;
  const total = progress?.total ?? sources.length;

  return (
    <dialog
      ref={dialog}
      className="editor-dialog export-dialog batch-export-dialog"
      aria-labelledby="image-batch-heading"
      onCancel={dismiss}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (result) download();
          else void build();
        }}
      >
        <h2 id="image-batch-heading">
          {action ? `Batch apply “${action.name}”` : 'Batch export images'}
        </h2>
        <p>
          {action
            ? `Apply this local Action to ${sources.length} image${sources.length === 1 ? '' : 's'} and download one ZIP.`
            : `Process ${sources.length} local image${sources.length === 1 ? '' : 's'} into one ZIP.`}{' '}
          Each file is rendered locally; the original files and metadata stay on this device.
        </p>
        {action && parameterNames.length > 0 && (
          <fieldset aria-label="Batch Action parameters">
            <legend>Action parameters</legend>
            {parameterNames.map((parameter) => (
              <label key={parameter}>
                {parameter}
                <input
                  aria-label={`Action parameter ${parameter}`}
                  value={String(parameters[parameter] ?? '')}
                  disabled={busy}
                  onChange={(event) =>
                    setParameters((current) => ({ ...current, [parameter]: event.target.value }))
                  }
                />
              </label>
            ))}
          </fieldset>
        )}
        <label>
          Format
          <select
            aria-label="Batch image export format"
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
              aria-label="Batch image export quality"
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
          aria-label="Batch image export progress"
          aria-live="polite"
          className="export-size"
        >
          {busy
            ? `Rendering images… ${completed}/${total}`
            : result
              ? `${result.manifest.exportedCount}/${result.manifest.sourceCount} images · ${result.blob.size.toLocaleString()} bytes`
              : action
                ? `Ready to apply ${action.steps.length} step${action.steps.length === 1 ? '' : 's'}`
                : 'Ready to render'}
        </output>
        {result && result.manifest.failures.length > 0 && (
          <section aria-label="Batch image export failures">
            <strong>{result.manifest.failures.length} file(s) skipped</strong>
            <ul>
              {result.manifest.failures.map((failure) => (
                <li key={`${failure.source}-${failure.reason}`}>
                  {failure.source}: {failure.reason}
                </li>
              ))}
            </ul>
          </section>
        )}
        {error && (
          <p role="alert" className="resize-error">
            {error}
          </p>
        )}
        <p className="export-format-note">
          The ZIP contains rendered pixels and a dimensions/byte-size manifest.
          EXIF, GPS, color profiles and editable project data are omitted.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={dismiss}>
            {busy ? 'Cancel batch export' : 'Close'}
          </button>
          <button type="submit" disabled={busy || !sources.length}>
            {result ? 'Download batch ZIP' : action ? 'Apply Action and build ZIP' : 'Build batch ZIP'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
