import { useEffect, useRef, useState } from 'react';

/** Select > Save Selection…: name a selection stored in the document. */
export default function SaveSelectionDialog({
  initialName,
  existingNames,
  close,
  save,
}: {
  initialName: string;
  existingNames: readonly string[];
  close: () => void;
  save: (name: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  useEffect(() => {
    dialog.current?.showModal();
    input.current?.select();
  }, []);
  const trimmed = name.trim();
  const duplicate = existingNames.some((item) => item.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  const valid = trimmed.length > 0 && trimmed.length <= 160 && !duplicate;
  return (
    <dialog ref={dialog} className="editor-dialog save-selection-dialog" aria-labelledby="save-selection-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); if (valid) save(trimmed); }}>
        <h2 id="save-selection-title">Save Selection</h2>
        <p>
          Store the current selection in this document. Load it later from the Saved selections panel; it is kept
          in local drafts and project files. Use Select › Download Selection File… for a separate file.
        </p>
        <label>
          Name
          <input
            ref={input}
            aria-label="Name for the saved selection"
            maxLength={160}
            value={name}
            aria-invalid={name !== '' && !valid ? true : undefined}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {!valid && (
          <p role="alert" className="resize-error">
            {duplicate ? 'A saved selection already uses that name.' : 'Enter a name.'}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit" disabled={!valid}>Save selection</button>
        </div>
      </form>
    </dialog>
  );
}
