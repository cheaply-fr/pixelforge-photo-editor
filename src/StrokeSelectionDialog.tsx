import { useEffect, useRef, useState } from 'react';
import { BLEND_MODE_GROUPS, NATIVE_CANVAS_BLEND_MODES } from './blendModes';
import {
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  normalizeStrokeSelectionOptions,
  STROKE_POSITIONS,
  type StrokePosition,
  type StrokeSelectionOptions,
} from './strokeSelection';

/** Edit > Stroke Selection…: width, colour, location, opacity and blend mode. */
export default function StrokeSelectionDialog({
  initial,
  foreground,
  close,
  apply,
}: {
  initial: StrokeSelectionOptions;
  foreground: string;
  close: () => void;
  apply: (options: StrokeSelectionOptions) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(String(initial.width));
  const [color, setColor] = useState(initial.color);
  const [position, setPosition] = useState<StrokePosition>(initial.position);
  const [opacity, setOpacity] = useState(String(initial.opacity));
  const [mode, setMode] = useState<string>(initial.mode);
  useEffect(() => {
    dialog.current?.showModal();
    submit.current?.focus();
  }, []);
  const options = normalizeStrokeSelectionOptions({ width, color, position, opacity, mode });
  const widthValid = normalizeStrokeSelectionOptions({ width, color: '#000000', position: 'center', opacity: 100, mode: 'source-over' });
  return (
    <dialog
      ref={dialog}
      className="editor-dialog stroke-selection-dialog"
      aria-labelledby="stroke-selection-title"
      onCancel={close}
    >
      <form onSubmit={(event) => { event.preventDefault(); if (options) apply(options); }}>
        <h2 id="stroke-selection-title">Stroke Selection</h2>
        <p>
          Draw an outline along the selection edge (where the marching ants run) on the active raster layer. Undo
          restores the original pixels.
        </p>
        <label>
          Width (px)
          <input
            aria-label="Stroke width (px)"
            type="text"
            inputMode="decimal"
            value={width}
            aria-invalid={widthValid ? undefined : true}
            onChange={(event) => setWidth(event.target.value)}
          />
        </label>
        <label>
          Color
          <span className="stroke-selection-color">
            <input aria-label="Stroke color" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            <button type="button" onClick={() => setColor(foreground)}>Use foreground</button>
          </span>
        </label>
        <fieldset className="stroke-selection-position">
          <legend>Location</legend>
          {STROKE_POSITIONS.map((item) => (
            <label key={item.value}>
              <input
                type="radio"
                name="stroke-position"
                value={item.value}
                checked={position === item.value}
                onChange={() => setPosition(item.value)}
              />
              {item.label}
            </label>
          ))}
        </fieldset>
        <label>
          Mode
          <select aria-label="Stroke blend mode" value={mode} onChange={(event) => setMode(event.target.value)}>
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
            aria-label="Stroke opacity (%)"
            type="text"
            inputMode="numeric"
            value={opacity}
            aria-invalid={options || !widthValid ? undefined : true}
            onChange={(event) => setOpacity(event.target.value)}
          />
        </label>
        {!widthValid && (
          <p role="alert" className="resize-error">
            Enter a width from {MIN_STROKE_WIDTH} to {MAX_STROKE_WIDTH} px in 0.5 px steps.
          </p>
        )}
        {widthValid && !options && <p role="alert" className="resize-error">Enter a whole opacity from 1 to 100%.</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button ref={submit} type="submit" disabled={!options}>Stroke</button>
        </div>
      </form>
    </dialog>
  );
}
