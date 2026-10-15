import { useEffect, useMemo, useRef, useState } from 'react';

export type CommandSearchItem = {
  label: string;
  menu: string;
  shortcut?: string;
  command: string;
  disabled?: boolean;
};

export default function CommandSearchDialog({
  items,
  close,
  run,
}: {
  items: CommandSearchItem[];
  close: () => void;
  run: (command: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, []);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items
      .filter((item) => !needle || `${item.label} ${item.menu}`.toLocaleLowerCase().includes(needle))
      .slice(0, 30);
  }, [items, query]);
  return (
    <dialog ref={dialog} className="editor-dialog command-search-dialog" aria-labelledby="command-search-title" onCancel={close}>
      <form onSubmit={(event) => event.preventDefault()}>
        <h2 id="command-search-title">Search commands</h2>
        <p>Find an editor command by name, then run it without opening a menu.</p>
        <input
          aria-label="Search commands"
          className="text-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tools, filters, layers…"
          autoComplete="off"
        />
        <div className="command-search-results" aria-label="Command results">
          {filtered.length ? filtered.map((item) => (
            <button
              key={`${item.menu}-${item.command}`}
              type="button"
              disabled={item.disabled}
              onClick={() => run(item.command)}
            >
              <span><b>{item.label}</b><small>{item.menu}</small></span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          )) : <p className="command-search-empty">No matching commands</p>}
        </div>
        <div className="dialog-actions"><button type="button" onClick={close}>Close</button></div>
      </form>
    </dialog>
  );
}
