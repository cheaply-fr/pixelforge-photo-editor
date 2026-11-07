import { useEffect, useRef } from 'react';
import { HISTORY_DESKTOP_BYTES, HISTORY_MAX_STEPS, HISTORY_STANDARD_BYTES, formatMiB } from './historyBudget';

export default function PurgeHistoryDialog({ close, apply }: { close: () => void; apply: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className="editor-dialog purge-history-dialog" aria-labelledby="purge-history-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); apply(); }}>
        <h2 id="purge-history-title">Purge Undo History</h2>
        <p>This keeps the current editable document and clears earlier undo and redo snapshots. The local draft, layers, assets, and current pixels remain available.</p>
        <p className="adjust-note">Undo and redo can retain up to {HISTORY_MAX_STEPS} states and {formatMiB(HISTORY_DESKTOP_BYTES)} of image data in memory on desktop ({formatMiB(HISTORY_STANDARD_BYTES)} or less on phones and low-memory devices). Purging releases that memory immediately.</p>
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Purge history</button></div>
      </form>
    </dialog>
  );
}
