import { useEffect, useRef, useState } from 'react';
import { BLEND_MODE_GROUPS, NATIVE_CANVAS_BLEND_MODES } from './blendModes';
import {
  EDIT_FILL_CONTENTS,
  editFillColor,
  editFillImagePatternId,
  editFillPatternTile,
  normalizeEditFillOptions,
  renderEditFillPattern,
  type EditFillContents,
  type EditFillOptions,
} from './editFill';
import { PATTERN_IDS, PATTERN_MAX_TILE, PATTERN_MIN_TILE, type PatternId } from './patternStamp';
import type { ImagePattern } from './imagePatterns';

const PREVIEW = 64;
const patternLabel = (id: string) => id[0].toUpperCase() + id.slice(1);

/** Edit > Fill…: choose contents, opacity and blend mode before filling. */
export default function EditFillDialog({
  foreground,
  background,
  hasSelection,
  imagePatterns = [],
  initialPattern = 'mesh',
  initialTileSize = 32,
  close,
  apply,
}: {
  foreground: string;
  background: string;
  hasSelection: boolean;
  /** Selection-defined Pattern Stamp patterns offered as Fill patterns. */
  imagePatterns?: readonly ImagePattern[];
  /** Pattern source the Pattern menu starts on (the Pattern Stamp's current one). */
  initialPattern?: string;
  initialTileSize?: number;
  close: () => void;
  apply: (options: EditFillOptions) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const [contents, setContents] = useState<EditFillContents>('foreground');
  const [color, setColor] = useState(foreground);
  const [opacity, setOpacity] = useState('100');
  const [mode, setMode] = useState('source-over');
  const [patternSource, setPatternSource] = useState(initialPattern);
  const [tileSize, setTileSize] = useState(String(initialTileSize));
  const [transparentBackground, setTransparentBackground] = useState(true);
  const preview = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    // Enter applies the default (foreground, 100%, Normal) like the menu used to.
    submit.current?.focus();
  }, []);
  const imageIds = imagePatterns.map((item) => item.id);
  const options = normalizeEditFillOptions(
    { contents, color, opacity, mode, pattern: { source: patternSource, tileSize, transparentBackground } },
    imageIds,
  );
  const swatch = editFillColor(contents, { foreground, background, color });
  const imagePattern = imagePatterns.find((item) => item.id === editFillImagePatternId(patternSource));
  const opacityValid = normalizeEditFillOptions({ contents: 'black', opacity, mode }) !== null;
  const procedural = contents === 'pattern' && options?.pattern && !imagePattern ? options.pattern : null;
  const previewKey = procedural ? `${procedural.source}:${procedural.tileSize}:${procedural.transparentBackground}` : '';
  useEffect(() => {
    const canvas = preview.current;
    const [source, size, transparent] = previewKey.split(':');
    if (!canvas || !source) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const tile = editFillPatternTile(
      { source: source as PatternId, tileSize: Number(size), transparentBackground: transparent === 'true' },
      { foreground, background },
    );
    context.clearRect(0, 0, PREVIEW, PREVIEW);
    context.putImageData(new ImageData(renderEditFillPattern(PREVIEW, PREVIEW, tile), PREVIEW, PREVIEW), 0, 0);
  }, [previewKey, foreground, background]);
  return (
    <dialog ref={dialog} className="editor-dialog edit-fill-dialog" aria-labelledby="edit-fill-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); if (options) apply(options); }}>
        <h2 id="edit-fill-title">Fill</h2>
        <p>
          Fill {hasSelection ? 'the selection' : 'the whole layer'} on the active raster layer. Undo restores the
          original pixels.
        </p>
        <label>
          Contents
          <select aria-label="Fill contents" value={contents} onChange={(event) => setContents(event.target.value as EditFillContents)}>
            {EDIT_FILL_CONTENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        {contents === 'color' && (
          <label>
            Color
            <input aria-label="Fill color" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          </label>
        )}
        {contents === 'pattern' ? (
          <>
            <label>
              Pattern
              <select aria-label="Fill pattern" value={patternSource} onChange={(event) => setPatternSource(event.target.value)}>
                {PATTERN_IDS.map((id) => <option key={id} value={id}>{patternLabel(id)}</option>)}
                {imagePatterns.map((item) => (
                  <option key={item.id} value={`image:${item.id}`}>{item.label} ({item.width}×{item.height})</option>
                ))}
              </select>
            </label>
            {imagePattern ? (
              <p className="edit-fill-pattern-note">Uses the defined pattern at {imagePattern.width}×{imagePattern.height} px.</p>
            ) : (
              <>
                <label>
                  Tile size (px)
                  <input
                    aria-label="Fill pattern tile size (px)"
                    type="number"
                    inputMode="numeric"
                    min={PATTERN_MIN_TILE}
                    max={PATTERN_MAX_TILE}
                    step={1}
                    value={tileSize}
                    aria-invalid={procedural ? undefined : true}
                    onChange={(event) => setTileSize(event.target.value)}
                  />
                </label>
                <label className="edit-fill-check">
                  <input
                    type="checkbox"
                    checked={transparentBackground}
                    onChange={(event) => setTransparentBackground(event.target.checked)}
                  />
                  Transparent background (lines only)
                </label>
                <p className="edit-fill-swatch">
                  <canvas
                    ref={preview}
                    width={PREVIEW}
                    height={PREVIEW}
                    className="edit-fill-pattern-preview"
                    aria-hidden="true"
                    data-testid="edit-fill-pattern-preview"
                  />
                  Foreground {foreground.toLowerCase()}
                  {transparentBackground ? ' on transparent' : ` on ${background.toLowerCase()}`}
                </p>
              </>
            )}
          </>
        ) : (
          <p className="edit-fill-swatch">
            <span aria-hidden="true" style={{ background: swatch }} /> {swatch}
          </p>
        )}
        <label>
          Mode
          <select aria-label="Fill blend mode" value={mode} onChange={(event) => setMode(event.target.value)}>
            {BLEND_MODE_GROUPS.map((group) => {
              const modes = group.modes.filter((item) => NATIVE_CANVAS_BLEND_MODES.has(item.value));
              return modes.length ? (
                <optgroup key={group.label} label={group.label}>
                  {modes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
        <label>
          Opacity (%)
          <input
            aria-label="Fill opacity (%)"
            type="text"
            inputMode="numeric"
            value={opacity}
            aria-invalid={opacityValid ? undefined : true}
            onChange={(event) => setOpacity(event.target.value)}
          />
        </label>
        {!opacityValid && <p role="alert" className="resize-error">Enter a whole opacity from 1 to 100%.</p>}
        {opacityValid && !options && (
          <p role="alert" className="resize-error">
            Enter a whole tile size from {PATTERN_MIN_TILE} to {PATTERN_MAX_TILE} px.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button ref={submit} type="submit" disabled={!options}>Fill</button>
        </div>
      </form>
    </dialog>
  );
}
