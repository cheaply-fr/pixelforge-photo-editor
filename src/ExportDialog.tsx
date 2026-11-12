import { useEffect, useMemo, useRef, useState } from 'react';
import { renderArtboard } from './artboardRender';
import type { Artboard } from './artboards';
import { type Assets, type Frame } from './document';
import {
  COLOR_PROFILES,
  type ColorProfile,
} from './colorProfile';
import {
  convertCanvasProfile,
  encodeImage,
  encodeImageForTarget,
  exportLabels,
  validExportTargetBytes,
  type ExportFormat,
} from './export';
import {
  downloadBlob,
  pickSaveFile,
  supportsSaveFilePicker,
  writeToFileHandle,
} from './download';
import { beginPerformanceSpan, type PerformanceSpan } from './performanceMarks';
import { encodeSvgDocument } from './svgDocumentExport';

/** Formats the dialog offers: the raster encoders plus layered SVG. */
type DialogFormat = ExportFormat | 'svg';
const dialogLabels: Record<DialogFormat, string> = { ...exportLabels, svg: 'SVG' };

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
  /** Open with the layered SVG format selected (File → Export as SVG). */
  startWithSvg?: boolean;
};
type Preview = {
  blob: Blob;
  url: string;
  format: DialogFormat;
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
  startWithSvg = false,
}: Props) {
  const [svg, setSvg] = useState(startWithSvg);
  const shownFormat: DialogFormat = svg ? 'svg' : format;
  const dialog = useRef<HTMLDialogElement>(null);
  const snapshot = useRef({ frame, assets });
  const selectableArtboards = frame.artboards?.filter((item) => item.visible) ?? [];
  const initialArtboardId =
    selectableArtboards.find((item) => item.id === frame.activeArtboardId)?.id ??
    selectableArtboards[0]?.id;
  const [selectedArtboardId, setSelectedArtboardId] =
    useState<string | undefined>(initialArtboardId);
  const [image, setImage] = useState<HTMLCanvasElement | null>(null);
  const [exportProfile, setExportProfile] = useState<ColorProfile>(frame.colorProfile ?? 'srgb');
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
  const [pickerAvailable] = useState(() => supportsSaveFilePicker(window));
  const [savingWithPicker, setSavingWithPicker] = useState(false);

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
          setImage(convertCanvasProfile(result.canvas, frame.colorProfile ?? 'srgb', exportProfile));
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
  }, [selectedArtboardId, exportProfile, frame.colorProfile]);

  useEffect(() => {
    if (!svg) return;
    let cancelled = false;
    let url: string | undefined;
    const span = beginPerformanceSpan('export');
    exportSpan.current = span;
    void encodeSvgDocument(snapshot.current.frame, snapshot.current.assets, {
      artboardId: selectedArtboardId,
      title: name || 'pixelforge-edit',
    })
      .then((blob) => {
        if (cancelled) return;
        span.finish();
        setError('');
        url = URL.createObjectURL(blob);
        setPreview({ blob, url, format: 'svg', quality, targetBytes, targetMet: true });
      })
      .catch((reason: unknown) => {
        span.finish();
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : 'SVG export failed. Your editable draft is kept.');
      });
    return () => {
      cancelled = true;
      span.cancel();
      if (url) URL.revokeObjectURL(url);
      if (exportSpan.current === span) exportSpan.current = null;
    };
  }, [svg, selectedArtboardId, name, quality, targetBytes]);

  useEffect(() => {
    if (!image || svg) return;
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
  }, [image, format, quality, targetBytes, svg]);

  const targetMode = Boolean(!svg && targetBytes && (format === 'jpeg' || format === 'webp'));
  const current =
    preview?.format === shownFormat &&
    preview.targetBytes === targetBytes &&
    (targetMode || preview.quality === quality)
      ? preview
      : null;
  const filename = `${name || 'pixelforge-edit'}.${shownFormat === 'jpeg' ? 'jpg' : shownFormat}`;
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
          // A dedicated object URL per download, revoked after a delay, so a
          // host that fetches the blob asynchronously still finds it.
          downloadBlob(current.blob, filename);
          downloaded(
            `${dialogLabels[shownFormat]} export downloaded (${current.blob.size.toLocaleString()} bytes)`,
          );
        }}
      >
        <h2 id="export-heading">Export image</h2>
        <p data-testid="export-viewport">
          {frame.artboards?.length
            ? `Download the active artboard “${viewport?.name ?? 'Canvas'}” at ${viewport?.w ?? frame.w} × ${viewport?.h ?? frame.h} px.`
            : svg
              ? `Download a layered SVG at ${frame.w} × ${frame.h} px.`
              : `Download a flattened image at ${frame.w} × ${frame.h} px.`}{' '}
          {svg
            ? 'Shapes and text stay editable vectors in other apps.'
            : 'Keep a project file to continue editing layers.'}
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
            value={shownFormat}
            onChange={(event) => {
              const picked = event.target.value as DialogFormat;
              setSvg(picked === 'svg');
              if (picked === 'svg') return;
              const next = picked;
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
            <option value="svg">SVG — layered vectors</option>
          </select>
        </label>
        {!svg && (
        <label>
          Export color profile
          <select
            aria-label="Export color profile"
            value={exportProfile}
            onChange={(event) => setExportProfile(event.target.value as ColorProfile)}
          >
            {COLOR_PROFILES.map((item) => (
              <option key={item} value={item}>
                {item === 'srgb' ? 'sRGB IEC 61966-2.1' : 'Display P3'}
              </option>
            ))}
          </select>
        </label>
        )}
        {!svg && format !== 'png' && format !== 'psd' && format !== 'pdf' && (
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
          {svg
            ? 'SVG keeps shapes and paths as vector elements, text as editable text and layer groups as groups. Pixel layers and layers with masks, styles or adjustments are embedded as PNG images; adjustment layers, clipping masks and blend modes SVG lacks flatten the layers below them into one image. Text uses fonts installed where the file is opened.'
            : format === 'jpeg'
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
          {current && ((shownFormat !== 'psd' && shownFormat !== 'pdf') || rasterPreviewUrl) && (
            <img
              src={shownFormat === 'psd' || shownFormat === 'pdf' ? rasterPreviewUrl ?? undefined : current.url}
              alt={`${dialogLabels[shownFormat]} export preview`}
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
          Encoded locally. Browser exports contain rendered pixels only
          {svg ? ', plus the layer names, shapes and text that keep SVG layers editable' : ''}. Original
          EXIF/GPS metadata and source color profiles are not copied. File Info
          title, description and author stay in the local draft and editable
          .pixelforge project only. File size depends on image content and browser encoding.
        </p>
        {pickerAvailable && (
          <p className="export-format-note" data-testid="export-picker-note">
            If a download does not appear (some embedded browsers ignore
            downloads), use Save with file picker to choose where the file is
            written.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Close
          </button>
          {pickerAvailable && (
            <button
              type="button"
              disabled={!current || savingWithPicker}
              onClick={() => {
                if (!current) return;
                const saved = current;
                setSavingWithPicker(true);
                void (async () => {
                  try {
                    const picked = await pickSaveFile(filename, window);
                    if (picked.status === 'cancelled') return;
                    if (picked.status === 'unavailable') {
                      downloadBlob(saved.blob, filename);
                      downloaded(
                        `${picked.reason} ${dialogLabels[saved.format]} export downloaded instead (${saved.blob.size.toLocaleString()} bytes)`,
                      );
                      return;
                    }
                    await writeToFileHandle(picked.handle, saved.blob);
                    downloaded(
                      `${dialogLabels[saved.format]} export saved with the file picker (${saved.blob.size.toLocaleString()} bytes)`,
                    );
                  } catch {
                    setError('The file could not be written. Try Download image instead.');
                  } finally {
                    setSavingWithPicker(false);
                  }
                })();
              }}
            >
              Save with file picker…
            </button>
          )}
          <button type="submit" disabled={!current}>
            Download image
          </button>
        </div>
      </form>
    </dialog>
  );
}
