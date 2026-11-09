import { useEffect, useRef, useState } from 'react';
import { typeMaskEntryText, type TextMaskOrientation } from './textMask';

/**
 * Temporary text entry for the Horizontal/Vertical Type Mask tools. The text
 * is never stored as a layer: committing turns it into a selection and
 * cancelling leaves the document (and its selection) untouched.
 */
export default function TypeMaskEntryDialog({
  orientation,
  initial,
  close,
  apply,
}: {
  orientation: TextMaskOrientation;
  initial: string;
  close: () => void;
  apply: (text: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(initial);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const result = typeMaskEntryText(value);
  const title = orientation === 'vertical' ? 'Vertical Type Mask' : 'Horizontal Type Mask';
  const commit = () => { if (result.ok) apply(result.text); };
  return (
    <dialog ref={dialog} className="editor-dialog type-mask-entry-dialog" aria-labelledby="type-mask-entry-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); commit(); }}>
        <h2 id="type-mask-entry-title">{title}</h2>
        <p>The typed text becomes a selection at the clicked point using the current font, size and selection mode. No text layer is added.</p>
        <label>
          Mask text
          <textarea
            aria-label="Type mask text"
            rows={3}
            value={value}
            aria-invalid={result.ok ? undefined : true}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              // Photoshop commits type with Ctrl/Cmd+Enter; plain Enter adds a line.
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                commit();
              }
            }}
          />
        </label>
        {!result.ok && <p role="alert" className="resize-error">{result.error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit" disabled={!result.ok}>Create selection</button>
        </div>
      </form>
    </dialog>
  );
}
