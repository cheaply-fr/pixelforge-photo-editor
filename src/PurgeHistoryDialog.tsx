import { useEffect, useRef } from 'react';

export default function PurgeHistoryDialog({ close, apply }: { close: () => void; apply: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className="editor-dialog purge-history-dialog" aria-labelledby="purge-history-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); apply(); }}>
        <h2 id="purge-history-title">Purge Undo History</h2>
        <p>This keeps the current editable document and clears earlier undo and redo snapshots. The local draft, layers, assets, and current pixels remain available.</p>
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Purge history</button></div>
      </form>
    </dialog>
  );
}
