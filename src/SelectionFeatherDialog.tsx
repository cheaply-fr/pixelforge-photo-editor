import { useEffect, useRef, useState } from 'react';
import { selectionDecimal } from './document';

export default function SelectionFeatherDialog({
  close,
  apply,
}: {
  close: () => void;
  apply: (feather: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState('2');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const parsed = selectionDecimal(value);
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 1000;
  return (
    <dialog ref={dialog} className="editor-dialog selection-feather-dialog" aria-labelledby="selection-feather-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); if (valid) apply(parsed); }}>
        <h2 id="selection-feather-title">Feather Selection</h2>
        <p>Soften the selection edge with a bounded alpha blur. Image pixels stay unchanged until the selection is used.</p>
        <label>
          Feather (px)
          <input aria-label="Selection feather radius (px)" type="text" inputMode="numeric" value={value} aria-invalid={value !== '' && !valid ? true : undefined} onChange={(event) => setValue(event.target.value)} />
        </label>
        {!valid && <p role="alert" className="resize-error">Enter a whole radius from 0 to 1000 px.</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit" disabled={!valid}>Apply feather</button>
        </div>
      </form>
    </dialog>
  );
}
