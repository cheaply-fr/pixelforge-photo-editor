import { useEffect, useMemo, useRef, useState } from 'react';
import { renderArtboard } from './artboardRender';
import type { Artboard } from './artboards';
import { type Assets, type Frame } from './document';
import {
  encodeImage,
  encodeImageForTarget,
  exportLabels,
  validExportTargetBytes,
  type ExportFormat,
} from './export';
import { beginPerformanceSpan, type PerformanceSpan } from './performanceMarks';

type Props = {
  frame: Frame;
  assets: Assets;
  name: string;
  format: ExportFormat;
  quality: number;
  targetBytes?: number;
  setFormat: (format: ExportFormat) => void;
  setQuality: (quality: number) => void;
  setTargetBytes: (bytes: number | undefined) => void;
  close: () => void;
  downloaded: (message: string) => void;
};
type Preview = {
  blob: Blob;
  url: string;
  format: ExportFormat;
  quality: number;
  targetBytes?: number;
  targetMet: boolean;
};

const MAX_TARGET_KB = 64 * 1024;

export default function ExportDialog({
  frame,
  assets,
  name,
  format,
  quality,
  targetBytes,
  setFormat,
  setQuality,
  setTargetBytes,
  close,
  downloaded,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const snapshot = useRef({ frame, assets });
  const selectableArtboards = frame.artboards?.filter((item) => item.visible) ?? [];
  const initialArtboardId =
    selectableArtboards.find((item) => item.id === frame.activeArtboardId)?.id ??
    selectableArtboards[0]?.id;
  const [selectedArtboardId, setSelectedArtboardId] =
    useState<string | undefined>(initialArtboardId);
  const [image, setImage] = useState<HTMLCanvasElement | null>(null);
  const rasterPreviewUrl = useMemo(() => {
    if (!image) return null;
    try {
      return image.toDataURL('image/png');
    } catch {
      return null;
    }
  }, [image]);
  const [viewport, setViewport] = useState<Artboard | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [targetInput, setTargetInput] = useState(
    targetBytes ? String(Math.round(targetBytes / 1024)) : '',
  );
  const [targetError, setTargetError] = useState('');
  const exportSpan = useRef<PerformanceSpan | null>(null);

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    let cancelled = false;
    void renderArtboard(
      snapshot.current.frame,
      snapshot.current.assets,
      selectedArtboardId,
    )
      .then((result) => {
        if (!cancelled) {
          setImage(result.canvas);
          setViewport(result.artboard);
        }
      })
      .catch(() => {
        if (!cancelled)
          setError('Could not prepare the image. Your editable draft is kept.');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedArtboardId]);

  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    let url: string | undefined;
    const span = beginPerformanceSpan('export');
    exportSpan.current = span;
    const targetMode = Boolean(targetBytes && (format === 'jpeg' || format === 'webp'));
    const encoded = targetMode
      ? encodeImageForTarget(image, format, targetBytes!)
      : encodeImage(image, format, quality).then((blob) => ({
          blob,
          quality,
          targetBytes,
          targetMet: true,
        }));
    void encoded
      .then((result) => {
        if (cancelled) return;
        span.finish();
        setError('');
        url = URL.createObjectURL(result.blob);
        setPreview({
          blob: result.blob,
          url,
          format,
          quality: result.quality,
          targetBytes: result.targetBytes,
          targetMet: result.targetMet,
        });
      })
      .catch((reason: unknown) => {
        span.finish();
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Export failed. Your editable draft is kept.',
          );
      });
    return () => {
      cancelled = true;
      span.cancel();
      if (url) URL.revokeObjectURL(url);
      if (exportSpan.current === span) exportSpan.current = null;
    };
  }, [image, format, quality, targetBytes]);

  const targetMode = Boolean(targetBytes && (format === 'jpeg' || format === 'webp'));
  const current =
    preview?.format === format &&
    preview.targetBytes === targetBytes &&
    (targetMode || preview.quality === quality)
      ? preview
      : null;
  const filename = `${name || 'pixelforge-edit'}.${format === 'jpeg' ? 'jpg' : format}`;
  const updateTarget = (value: string) => {
    setTargetInput(value);
    if (!value.trim()) {
      setTargetBytes(undefined);
      setTargetError('');
      return;
    }
    const kb = Number(value);
    const bytes = Number.isFinite(kb) ? Math.round(kb * 1024) : NaN;
    if (!validExportTargetBytes(bytes)) {
      setTargetBytes(undefined);
      setTargetError(
        `Enter a target between 1 and ${MAX_TARGET_KB.toLocaleString()} KB.`,
      );
      return;
    }
    setTargetBytes(bytes);
    setTargetError('');
  };

  return (
    <dialog
      ref={dialog}
      className="editor-dialog export-dialog"
      aria-labelledby="export-heading"
      onCancel={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!current) return;
          const anchor = document.createElement('a');
          anchor.download = filename;
          anchor.href = current.url;
          anchor.click();
          downloaded(
            `${exportLabels[format]} export downloaded (${current.blob.size.toLocaleString()} bytes)`,
          );
        }}
      >
        <h2 id="export-heading">Export image</h2>
        <p data-testid="export-viewport">
          {frame.artboards?.length
            ? `Download the active artboard “${viewport?.name ?? 'Canvas'}” at ${viewport?.w ?? frame.w} × ${viewport?.h ?? frame.h} px.`
            : `Download a flattened image at ${frame.w} × ${frame.h} px.`}{' '}
          Keep a project file to continue editing layers.
        </p>
        {selectableArtboards.length > 0 && (
          <label>
            Artboard
            <select
              aria-label="Export artboard"
              value={selectedArtboardId ?? ''}
              onChange={(event) => setSelectedArtboardId(event.target.value)}
            >
              {selectableArtboards.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.w} × {item.h} px)
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Format
          <select
            aria-label="Export format"
            value={format}
            onChange={(event) => {
              const next = event.target.value as ExportFormat;
              setFormat(next);
              if (next === 'png' || next === 'psd' || next === 'pdf') {
                setTargetBytes(undefined);
                setTargetInput('');
                setTargetError('');
              }
            }}
          >
            <option value="png">PNG — lossless</option>
            <option value="jpeg">JPEG — smaller, opaque</option>
            <option value="webp">WebP — smaller, transparent</option>
            <option value="psd">PSD — flattened composite</option>
            <option value="pdf">PDF — flattened page</option>
          </select>
        </label>
        {format !== 'png' && format !== 'psd' && format !== 'pdf' && (
          <>
            <label>
              Quality
              <output>
                {targetMode && current
                  ? `${current.quality}% (auto)`
                  : `${quality}%`}
              </output>
              <input
                aria-label="Export quality"
                type="range"
                min="1"
                max="100"
                step="1"
                value={targetMode && current ? current.quality : quality}
                disabled={targetMode}
                onChange={(event) => setQuality(Number(event.target.value))}
              />
            </label>
            <label>
              Target size (KB)
              <input
                aria-label="Target size (KB)"
                type="number"
                min="1"
                max={MAX_TARGET_KB}
                step="1"
                inputMode="numeric"
                placeholder="No limit"
                value={targetInput}
                onChange={(event) => updateTarget(event.target.value)}
              />
            </label>
            {targetError && (
              <p role="alert" className="resize-error">
                {targetError}
              </p>
            )}
          </>
        )}
        <p className="export-format-note">
          {format === 'jpeg'
            ? 'JPEG uses lossy compression. Transparent areas become white.'
            : format === 'webp'
              ? 'WebP uses lossy color compression and preserves transparency. Quality 100 is not a lossless guarantee.'
              : format === 'psd'
                ? 'PSD stores a flattened 8-bit RGB composite with an alpha channel. Layers, masks, profiles, metadata and undo history are omitted; keep a .pixelforge project for editable recovery.'
                : format === 'pdf'
                  ? 'PDF stores one flattened JPEG composite on a single page. Layers, editable text, profiles, metadata and undo history are omitted; keep a .pixelforge project for editable recovery.'
                  : 'PNG preserves transparency and pixels without lossy compression. Quality does not apply.'}
        </p>
        {targetMode && (
          <p className="export-format-note">
            The encoder searches for the highest quality that fits the target;
            dimensions are never reduced.
          </p>
        )}
        <div className="export-preview">
          {current && ((format !== 'psd' && format !== 'pdf') || rasterPreviewUrl) && (
            <img
              src={format === 'psd' || format === 'pdf' ? rasterPreviewUrl ?? undefined : current.url}
              alt={`${exportLabels[format]} export preview`}
            />
          )}
        </div>
        <output
          className="export-size"
          aria-label="Encoded file size"
          aria-live="polite"
          data-bytes={current?.blob.size ?? ''}
        >
          {current
            ? `${current.blob.size.toLocaleString()} bytes · ${filename}${
                targetMode
                  ? current.targetMet
                    ? ` · target met at ${current.quality}% quality`
                    : ` · target not met at ${current.quality}% minimum quality`
                  : ''
              }`
            : error
              ? 'Preview unavailable'
              : 'Encoding preview…'}
        </output>
        {error && (
          <p role="alert" className="resize-error">
            {error}
          </p>
        )}
        <p data-testid="export-privacy-disclosure">
          Encoded locally. Browser exports contain rendered pixels only. Original
          EXIF/GPS metadata and source color profiles are not copied. File Info
          title, description and author stay in the local draft and editable
          .pixelforge project only. File size depends on image content and browser encoding.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Close
          </button>
          <button type="submit" disabled={!current}>
            Download image
          </button>
        </div>
      </form>
    </dialog>
  );
}
