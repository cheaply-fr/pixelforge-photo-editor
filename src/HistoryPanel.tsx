import { History as HistoryIcon } from 'lucide-react';
import type { Frame } from './document.ts';
import { canRestoreHistory, summarizeHistory } from './historyTimeline.ts';

type Props = {
  history: readonly Frame[];
  currentIndex: number;
  restore: (targetIndex: number) => void;
};

export default function HistoryPanel({ history, currentIndex, restore }: Props) {
  const entries = summarizeHistory(history, currentIndex);
  return (
    <section className="panel history-panel" aria-label="History">
      <div className="panel-title">
        <span><HistoryIcon />History</span>
        <small aria-label="History position">{entries.length ? `${currentIndex + 1} / ${entries.length}` : '0 / 0'}</small>
      </div>
      {entries.length ? (
        <ol className="history-list" aria-label="History states">
          {entries.map((entry) => (
            <li key={entry.index} className={entry.current ? 'history-entry current' : 'history-entry'}>
              <button
                type="button"
                aria-current={entry.current ? 'step' : undefined}
                aria-label={`Restore history step ${entry.index + 1}: ${entry.activeLayer}`}
                disabled={entry.current || !canRestoreHistory(history, currentIndex, entry.index)}
                onClick={() => restore(entry.index)}
              >
                <span className="history-entry-label">{entry.label}</span>
                <small>{entry.width} × {entry.height} · {entry.layerCount} layer{entry.layerCount === 1 ? '' : 's'}</small>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="history-empty">No committed edits yet.</p>
      )}
      <p className="history-note">Restore is local and undoable. New edits after a restore replace only the abandoned redo branch.</p>
    </section>
  );
}
