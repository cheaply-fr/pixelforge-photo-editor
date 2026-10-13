import { useEffect, useRef, useState } from 'react';
import { selectionDecimal } from './document';

export default function SelectAndMaskDialog({
  close,
  apply,
}: {
  close: () => void;
  apply: (smoothRadius: number, feather: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [smoothRadius, setSmoothRadius] = useState('2');
  const [feather, setFeather] = useState('0');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const radius = selectionDecimal(smoothRadius);
  const featherValue = selectionDecimal(feather);
  const valid = Number.isInteger(radius) && radius >= 0 && radius <= 64 &&
    Number.isInteger(featherValue) && featherValue >= 0 && featherValue <= 1000;
  return (
    <dialog
      ref={dialog}
      className="editor-dialog selection-modify-dialog"
      aria-labelledby="select-and-mask-title"
      onCancel={close}
    >
      <form onSubmit={(event) => { event.preventDefault(); if (valid) apply(radius, featherValue); }}>
        <h2 id="select-and-mask-title">Select and Mask</h2>
        <p>
          Refine the current alpha selection locally. Source pixels stay unchanged;
          semantic subject, hair and cloud inference are not provided.
        </p>
        <label>
          Edge smoothing (px)
          <input
            aria-label="Select and Mask edge smoothing (px)"
            type="text"
            inputMode="numeric"
            value={smoothRadius}
            aria-invalid={smoothRadius !== '' && !(Number.isInteger(radius) && radius >= 0 && radius <= 64) ? true : undefined}
            onChange={(event) => setSmoothRadius(event.target.value)}
          />
        </label>
        <label>
          Feather (px)
          <input
            aria-label="Select and Mask feather (px)"
            type="text"
            inputMode="numeric"
            value={feather}
            aria-invalid={feather !== '' && !(Number.isInteger(featherValue) && featherValue >= 0 && featherValue <= 1000) ? true : undefined}
            onChange={(event) => setFeather(event.target.value)}
          />
        </label>
        {!valid && <p role="alert" className="resize-error">Use smoothing 0–64 px and feather 0–1000 px.</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit" disabled={!valid}>Apply Select and Mask</button>
        </div>
      </form>
    </dialog>
  );
}
