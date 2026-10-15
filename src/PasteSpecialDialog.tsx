import { useEffect, useRef, useState } from 'react';
import type { PasteSpecialMode } from './pasteSpecial';

type PasteSpecialDialogProps = {
  hasSelection: boolean;
  close: () => void;
  apply: (mode: PasteSpecialMode) => void;
};

export default function PasteSpecialDialog({
  hasSelection,
  close,
  apply,
}: PasteSpecialDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<PasteSpecialMode>('in-place');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="editor-dialog paste-special-dialog"
      aria-labelledby="paste-special-title"
      onCancel={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(mode);
        }}
      >
        <h2 id="paste-special-title">Paste Special</h2>
        <p>
          Insert the local layer clipboard without changing the source layer.
          Each option creates one undoable editable layer.
        </p>
        <fieldset>
          <legend>Placement</legend>
          <label>
            <input
              type="radio"
              name="paste-special-placement"
              value="in-place"
              checked={mode === 'in-place'}
              onChange={() => setMode('in-place')}
            />
            Paste in Place
          </label>
          <label>
            <input
              type="radio"
              name="paste-special-placement"
              value="center"
              checked={mode === 'center'}
              onChange={() => setMode('center')}
            />
            Paste at Center
          </label>
          <label className={!hasSelection ? 'disabled' : undefined}>
            <input
              type="radio"
              name="paste-special-placement"
              value="into-selection"
              checked={mode === 'into-selection'}
              disabled={!hasSelection}
              onChange={() => setMode('into-selection')}
            />
            Paste into Selection
          </label>
          {!hasSelection && <small>Create a selection to enable this option.</small>}
        </fieldset>
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit">Paste Layer</button>
        </div>
      </form>
    </dialog>
  );
}
