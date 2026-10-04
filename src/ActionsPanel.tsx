import { useEffect, useRef, useState } from 'react';
import type { ActionSet } from './actions';

type ActionsPanelProps = {
  actions: ActionSet[];
  recordingId?: string;
  busyId?: string;
  close: () => void;
  start: (name: string) => void;
  stop: () => void;
  run: (id: string) => void;
  remove: (id: string) => void;
};

/**
 * Small local action-recorder surface.  The editor owns execution and local
 * persistence; this component only exposes an accessible recorder/list UI so
 * an action can never bypass the normal command guards or undo history.
 */
export default function ActionsPanel({
  actions,
  recordingId,
  busyId,
  close,
  start,
  stop,
  run,
  remove,
}: ActionsPanelProps) {
  const [name, setName] = useState('Color pass');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const target = dialog.current;
    if (!target) return;
    if (!target.open) target.showModal();
    const onCancel = (event: Event) => {
      event.preventDefault();
      close();
    };
    target.addEventListener('cancel', onCancel);
    return () => target.removeEventListener('cancel', onCancel);
  }, [close]);
  const recording = actions.find((action) => action.id === recordingId);
  return (
    <dialog
      ref={dialog}
      className="editor-dialog actions-dialog"
      aria-labelledby="actions-heading"
      data-testid="actions-dialog"
      onClose={close}
    >
      <div className="actions-header">
        <div>
          <h2 id="actions-heading">Action recipes</h2>
          <p>
            Record safe local commands and replay them on the active document.
            Pixel data and account credentials are never stored in a recipe.
          </p>
        </div>
        <button type="button" onClick={close} aria-label="Close action recipes">
          Close
        </button>
      </div>
      <form
        className="actions-recorder"
        onSubmit={(event) => {
          event.preventDefault();
          if (!recordingId) start(name);
        }}
      >
        <label htmlFor="action-name">Recipe name</label>
        <input
          id="action-name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          disabled={Boolean(recordingId)}
        />
        {recording ? (
          <output className="actions-recording" aria-live="polite" data-testid="actions-recording">
            <span>
              Recording <strong>{recording.name}</strong> ({recording.steps.length} steps)
            </span>
            <button type="button" onClick={stop}>
              Stop recording
            </button>
          </output>
        ) : (
          <button type="submit" data-testid="start-action-recording">
            Start recording
          </button>
        )}
      </form>
      <div className="actions-list" aria-label="Saved action recipes">
        {actions.length ? (
          actions.map((action) => (
            <div className="action-row" key={action.id} data-testid={`action-${action.id}`}>
              <div>
                <strong>{action.name}</strong>
                <small>
                  {action.steps.length} {action.steps.length === 1 ? 'step' : 'steps'}
                </small>
              </div>
              <div className="action-row-buttons">
                <button
                  type="button"
                  onClick={() => run(action.id)}
                  disabled={!action.steps.length || Boolean(recordingId) || Boolean(busyId)}
                >
                  {busyId === action.id ? 'Running…' : 'Run'}
                </button>
                <button
                  type="button"
                  onClick={() => remove(action.id)}
                  disabled={Boolean(recordingId) || Boolean(busyId)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="actions-empty">No recipes yet. Start recording to capture a repeatable edit.</p>
        )}
      </div>
    </dialog>
  );
}
