import { useEffect, useRef, useState } from 'react';
import { BLEND_MODE_GROUPS, NATIVE_CANVAS_BLEND_MODES } from './blendModes';
import {
  EDIT_FILL_CONTENTS,
  editFillColor,
  normalizeEditFillOptions,
  type EditFillContents,
  type EditFillOptions,
} from './editFill';

/** Edit > Fill…: choose contents, opacity and blend mode before filling. */
export default function EditFillDialog({
  foreground,
  background,
  hasSelection,
  close,
  apply,
}: {
  foreground: string;
  background: string;
  hasSelection: boolean;
  close: () => void;
  apply: (options: EditFillOptions) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const [contents, setContents] = useState<EditFillContents>('foreground');
  const [color, setColor] = useState(foreground);
  const [opacity, setOpacity] = useState('100');
  const [mode, setMode] = useState('source-over');
  useEffect(() => {
    dialog.current?.showModal();
    // Enter applies the default (foreground, 100%, Normal) like the menu used to.
    submit.current?.focus();
  }, []);
  const options = normalizeEditFillOptions({ contents, color, opacity, mode });
  const swatch = editFillColor(contents, { foreground, background, color });
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
        <p className="edit-fill-swatch">
          <span aria-hidden="true" style={{ background: swatch }} /> {swatch}
        </p>
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
            aria-invalid={options ? undefined : true}
            onChange={(event) => setOpacity(event.target.value)}
          />
        </label>
        {!options && <p role="alert" className="resize-error">Enter a whole opacity from 1 to 100%.</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button ref={submit} type="submit" disabled={!options}>Fill</button>
        </div>
      </form>
    </dialog>
  );
}
