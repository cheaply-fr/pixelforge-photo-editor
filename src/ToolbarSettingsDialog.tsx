import { useEffect, useRef, useState } from 'react';

export type ToolbarColumns = 'auto' | '2' | '3';

export default function ToolbarSettingsDialog({ value, close, apply }: {
  value: ToolbarColumns;
  close: () => void;
  apply: (value: ToolbarColumns) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [columns, setColumns] = useState<ToolbarColumns>(value);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className="editor-dialog toolbar-settings-dialog" aria-labelledby="toolbar-settings-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); apply(columns); }}>
        <h2 id="toolbar-settings-title">Toolbar</h2>
        <p>Choose a compact palette width. Auto uses two columns at normal widths and three columns on wide editor viewports; mobile layouts stay touch-sized.</p>
        <label className="select-row">
          <span>Tool columns</span>
          <select aria-label="Tool columns" value={columns} onChange={(event) => setColumns(event.target.value as ToolbarColumns)}>
            <option value="auto">Auto</option>
            <option value="2">Two columns</option>
            <option value="3">Three columns</option>
          </select>
        </label>
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Apply</button></div>
      </form>
    </dialog>
  );
}
