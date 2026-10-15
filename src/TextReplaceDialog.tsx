import { useEffect, useRef, useState } from 'react';

export default function TextReplaceDialog({
  close,
  apply,
}: {
  close: () => void;
  apply: (find: string, replace: string, matchCase: boolean, wholeWord: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, []);
  const valid = find.length > 0;
  return (
    <dialog ref={dialog} className="editor-dialog text-replace-dialog" aria-labelledby="text-replace-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); if (valid) apply(find, replace, matchCase, wholeWord); }}>
        <h2 id="text-replace-title">Find and Replace Text</h2>
        <p>Replace matching text across editable text layers. Rasterized and vector layers remain unchanged.</p>
        <label>
          Find
          <input aria-label="Find text" value={find} onChange={(event) => setFind(event.target.value)} autoComplete="off" />
        </label>
        <label>
          Replace with
          <input aria-label="Replace text" value={replace} onChange={(event) => setReplace(event.target.value)} autoComplete="off" />
        </label>
        <label className="check-row"><input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} /> Match case</label>
        <label className="check-row"><input type="checkbox" checked={wholeWord} onChange={(event) => setWholeWord(event.target.checked)} /> Whole words only</label>
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit" disabled={!valid}>Replace all</button>
        </div>
      </form>
    </dialog>
  );
}
