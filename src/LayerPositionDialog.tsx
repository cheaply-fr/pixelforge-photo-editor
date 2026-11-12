import { useEffect, useRef, useState } from 'react';

/**
 * Layer > Arrange > Move to Position…: type the Layers panel row (1 = top)
 * the selected layer should move to, instead of dragging or stepping it one
 * row at a time through a tall stack.
 */
export default function LayerPositionDialog({
  layerName,
  current,
  count,
  close,
  apply,
}: {
  layerName: string;
  /** Current panel position of the (topmost) selected layer, 1 = top. */
  current: number;
  count: number;
  close: () => void;
  apply: (position: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(String(current));
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const parsed = /^\d{1,4}$/.test(value.trim()) ? Number(value.trim()) : NaN;
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= count;
  const move = (position: number) => {
    if (position >= 1 && position <= count) apply(position);
  };
  return (
    <dialog
      ref={dialog}
      className="editor-dialog layer-position-dialog"
      aria-labelledby="layer-position-title"
      onCancel={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) move(parsed);
        }}
      >
        <h2 id="layer-position-title">Move Layer to Position</h2>
        <p>
          Move <b>{layerName}</b> (now {current} of {count}) to a row of the Layers panel, where 1 is the
          top. Folders and clipping groups move as one unit. One undo step.
        </p>
        <label>
          Position (1–{count})
          <input
            aria-label="Layer position"
            type="number"
            inputMode="numeric"
            min={1}
            max={count}
            step={1}
            value={value}
            aria-invalid={value !== '' && !valid ? true : undefined}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
          />
        </label>
        {!valid && (
          <p role="alert" className="resize-error">
            Enter a whole number from 1 to {count}.
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" disabled={!valid || parsed === current}>
            Move layer
          </button>
        </div>
      </form>
    </dialog>
  );
}
