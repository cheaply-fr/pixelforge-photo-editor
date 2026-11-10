import { useState } from 'react';
import {
  PAINT_SYMMETRY_MODES,
  PAINT_SYMMETRY_MODE_LABELS,
  PAINT_SYMMETRY_SEGMENTS_MAX,
  PAINT_SYMMETRY_SEGMENTS_MIN,
  normalizePaintSymmetry,
  nudgePaintSymmetryCenter,
  paintSymmetryCopyCount,
  paintSymmetryGuides,
  resolvePaintSymmetryCenter,
  type PaintSymmetryMode,
  type PaintSymmetrySettings,
} from './paintSymmetry';

type Update = (next: PaintSymmetrySettings) => void;

/**
 * Compact Paint Symmetry options (Brush, Pencil, Eraser, Mixer, History, Art
 * History, Clone and Healing; see PAINT_SYMMETRY_TOOLS): mode, segment
 * count, axis rotation, an exact centre and guide visibility.
 */
export function PaintSymmetryControls({
  value,
  onChange,
  canvasWidth,
  canvasHeight,
}: {
  value: PaintSymmetrySettings;
  onChange: Update;
  canvasWidth: number;
  canvasHeight: number;
}) {
  const update = (patch: Partial<PaintSymmetrySettings>) => onChange(normalizePaintSymmetry({ ...value, ...patch }));
  const center = resolvePaintSymmetryCenter(value, canvasWidth, canvasHeight),
    copies = paintSymmetryCopyCount(value),
    segmented = value.mode === 'radial' || value.mode === 'mandala';
  const setCenter = (axis: 'x' | 'y', text: string) => {
    const parsed = Number(text);
    if (text.trim() === '' || !Number.isFinite(parsed)) return;
    update({ center: resolvePaintSymmetryCenter({ center: { ...center, [axis]: parsed } }, canvasWidth, canvasHeight) });
  };
  return (
    <fieldset className="paint-symmetry" data-testid="paint-symmetry-controls" data-mode={value.mode}>
      <legend>Symmetry</legend>
      <label className="select-row">
        <span>Mode</span>
        <select
          aria-label="Paint symmetry"
          value={value.mode}
          onChange={(event) => update({ mode: event.target.value as PaintSymmetryMode })}
        >
          {PAINT_SYMMETRY_MODES.map((mode) => (
            <option key={mode} value={mode}>{PAINT_SYMMETRY_MODE_LABELS[mode]}</option>
          ))}
        </select>
      </label>
      {value.mode !== 'off' && (
        <>
          {segmented && (
            <label className="paint-symmetry-row">
              <span>Segments</span>
              <input
                aria-label="Symmetry segments"
                type="range"
                min={PAINT_SYMMETRY_SEGMENTS_MIN}
                max={PAINT_SYMMETRY_SEGMENTS_MAX}
                step={1}
                value={value.segments}
                onChange={(event) => update({ segments: Number(event.target.value) })}
              />
              <input
                aria-label="Symmetry segments value"
                className="text-input paint-symmetry-number"
                type="number"
                inputMode="numeric"
                min={PAINT_SYMMETRY_SEGMENTS_MIN}
                max={PAINT_SYMMETRY_SEGMENTS_MAX}
                value={value.segments}
                onChange={(event) => {
                  if (event.target.value.trim() !== '') update({ segments: Number(event.target.value) });
                }}
              />
            </label>
          )}
          <label className="paint-symmetry-row">
            <span>Rotation</span>
            <input
              aria-label="Symmetry rotation"
              type="range"
              min={-180}
              max={180}
              step={1}
              value={Math.round(value.rotation)}
              onChange={(event) => update({ rotation: Number(event.target.value) })}
            />
            <output>{Math.round(value.rotation)}°</output>
          </label>
          <div className="paint-symmetry-row paint-symmetry-center">
            <span>Centre</span>
            <input
              aria-label="Symmetry center X"
              className="text-input paint-symmetry-number"
              type="number"
              inputMode="decimal"
              min={0}
              max={canvasWidth}
              value={Math.round(center.x)}
              onChange={(event) => setCenter('x', event.target.value)}
            />
            <input
              aria-label="Symmetry center Y"
              className="text-input paint-symmetry-number"
              type="number"
              inputMode="decimal"
              min={0}
              max={canvasHeight}
              value={Math.round(center.y)}
              onChange={(event) => setCenter('y', event.target.value)}
            />
            <button
              type="button"
              aria-label="Reset symmetry center"
              title="Reset to canvas centre"
              onClick={() => onChange(normalizePaintSymmetry({ ...value, center: undefined }))}
            >
              ⌖
            </button>
          </div>
          <label className="check-row">
            <input
              aria-label="Show symmetry guides"
              type="checkbox"
              checked={value.showGuides}
              onChange={(event) => update({ showGuides: event.target.checked })}
            />
            Show guides
          </label>
          <p className="adjust-note" data-testid="paint-symmetry-summary">
            {copies} copies per dab
          </p>
        </>
      )}
    </fieldset>
  );
}

/**
 * On-canvas axes/segments and a draggable, keyboard-nudgeable centre handle.
 * Dragging previews locally and stores the centre on release.
 */
export function PaintSymmetryOverlay({
  value,
  onChange,
  canvasWidth,
  canvasHeight,
  toCanvas,
}: {
  value: PaintSymmetrySettings;
  onChange: Update;
  canvasWidth: number;
  canvasHeight: number;
  toCanvas: (event: { clientX: number; clientY: number }) => { x: number; y: number };
}) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  if (value.mode === 'off' || !value.showGuides) return null;
  const live = drag ? { ...value, center: drag } : value,
    guides = paintSymmetryGuides(live, canvasWidth, canvasHeight),
    center = guides.center,
    fromPointer = (event: { clientX: number; clientY: number }) =>
      resolvePaintSymmetryCenter({ center: toCanvas(event) }, canvasWidth, canvasHeight),
    store = (next: { x: number; y: number } | undefined) =>
      onChange(normalizePaintSymmetry({ ...value, center: next }));
  return (
    <div className="paint-symmetry-overlay" data-testid="paint-symmetry-overlay" data-mode={value.mode}>
      <svg
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {guides.lines.map((line, index) => (
          <line
            key={index}
            data-testid="paint-symmetry-line"
            className={`paint-symmetry-${line.kind}`}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
          />
        ))}
      </svg>
      <button
        type="button"
        className="paint-symmetry-handle"
        data-testid="paint-symmetry-handle"
        data-center-x={Math.round(center.x)}
        data-center-y={Math.round(center.y)}
        style={{ left: `${(center.x / canvasWidth) * 100}%`, top: `${(center.y / canvasHeight) * 100}%` }}
        aria-label={`Symmetry center at ${Math.round(center.x)}, ${Math.round(center.y)} px. Drag, or use arrow keys to move one pixel, Shift for ten, Home to recenter.`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture?.(event.pointerId);
          setDrag(fromPointer(event));
        }}
        onPointerMove={(event) => {
          if (!drag) return;
          event.stopPropagation();
          setDrag(fromPointer(event));
        }}
        onPointerUp={(event) => {
          if (!drag) return;
          event.stopPropagation();
          const next = fromPointer(event);
          setDrag(null);
          store(next);
        }}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={(event) => {
          const next = nudgePaintSymmetryCenter(value, canvasWidth, canvasHeight, event.key, event.shiftKey);
          if (next === null) return;
          event.preventDefault();
          store(next);
        }}
      />
    </div>
  );
}
