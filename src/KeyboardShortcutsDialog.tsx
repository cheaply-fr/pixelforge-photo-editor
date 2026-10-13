import { useEffect, useMemo, useRef, useState } from 'react';

export type KeyboardShortcutItem = {
  label: string;
  menu: string;
  shortcut?: string;
  command: string;
};

export default function KeyboardShortcutsDialog({
  items,
  close,
}: {
  items: KeyboardShortcutItem[];
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, []);
  const shortcuts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items
      .filter((item) => item.shortcut)
      .filter((item) => !needle || `${item.label} ${item.menu} ${item.shortcut}`.toLocaleLowerCase().includes(needle))
      .slice(0, 100);
  }, [items, query]);
  return (
    <dialog ref={dialog} className="editor-dialog keyboard-shortcuts-dialog" aria-labelledby="keyboard-shortcuts-title" onCancel={close}>
      <form onSubmit={(event) => event.preventDefault()}>
        <h2 id="keyboard-shortcuts-title">Keyboard Shortcuts</h2>
        <p>Search the advertised Photoshop-style shortcuts. A command may still be unavailable for the current document or selection.</p>
        <input
          aria-label="Filter keyboard shortcuts"
          className="text-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter shortcuts…"
          autoComplete="off"
        />
        <div className="keyboard-shortcuts-list" aria-label="Keyboard shortcuts list">
          {shortcuts.length ? shortcuts.map((item) => (
            <div className="keyboard-shortcut-row" key={`${item.menu}-${item.command}`}>
              <span><b>{item.label}</b><small>{item.menu}</small></span>
              <kbd>{item.shortcut}</kbd>
            </div>
          )) : <p className="command-search-empty">No matching shortcuts</p>}
        </div>
        <div className="dialog-actions"><button type="button" onClick={close}>Close</button></div>
      </form>
    </dialog>
  );
}
