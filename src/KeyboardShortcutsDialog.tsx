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
  toolItems,
  toolBindings,
  applyToolBindings,
  commandBindings,
  applyCommandBindings,
}: {
  items: KeyboardShortcutItem[];
  close: () => void;
  toolItems?: { id: string; label: string; key: string }[];
  toolBindings?: Readonly<Record<string, string>>;
  applyToolBindings?: (bindings: Record<string, string>) => void;
  commandBindings?: Readonly<Record<string, string>>;
  applyCommandBindings?: (bindings: Record<string, string>) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [bindings, setBindings] = useState<Record<string, string>>(() => ({ ...toolBindings }));
  const [commandOverrides, setCommandOverrides] = useState<Record<string, string>>(() => ({ ...commandBindings }));
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
      <form onSubmit={(event) => { event.preventDefault(); applyToolBindings?.(bindings); applyCommandBindings?.(commandOverrides); close(); }}>
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
        {toolItems && applyToolBindings && (
          <fieldset className="tool-shortcut-settings">
            <legend>Custom tool bindings</legend>
            <p className="toolbar-category-help">Assign a letter or number, optionally with Shift, Ctrl, Alt, or Cmd (for example <code>shift+q</code>). Duplicate and invalid chords are ignored.</p>
            {toolItems.map((item) => (
              <label className="tool-shortcut-row" key={item.id}>
                <span><b>{item.label}</b><small>Default {item.key || '—'}</small></span>
                <input
                  aria-label={`${item.label} custom shortcut`}
                  value={bindings[item.id] ?? ''}
                  maxLength={24}
                  inputMode="text"
                  onChange={(event) => setBindings((current) => ({ ...current, [item.id]: event.target.value }))}
                />
                <button type="button" onClick={() => setBindings((current) => { const next = { ...current }; delete next[item.id]; return next; })}>Reset</button>
              </label>
            ))}
          </fieldset>
        )}
        {applyCommandBindings && (
          <fieldset className="tool-shortcut-settings command-shortcut-settings">
            <legend>Custom menu command bindings</legend>
            <p className="toolbar-category-help">Override a listed menu shortcut with a key, punctuation key, or function-key chord. Leave blank to keep the built-in shortcut. Duplicate and invalid chords are ignored.</p>
            {shortcuts.map((item) => (
              <label className="tool-shortcut-row" key={`command-${item.menu}-${item.command}`}>
                <span><b>{item.label}</b><small>{item.menu} · Default {item.shortcut}</small></span>
                <input
                  aria-label={`${item.label} custom command shortcut`}
                  value={commandOverrides[item.command] ?? ''}
                  maxLength={24}
                  inputMode="text"
                  onChange={(event) => setCommandOverrides((current) => ({ ...current, [item.command]: event.target.value }))}
                />
                <button type="button" onClick={() => setCommandOverrides((current) => { const next = { ...current }; delete next[item.command]; return next; })}>Reset</button>
              </label>
            ))}
          </fieldset>
        )}
        <div className="dialog-actions">{(toolItems && applyToolBindings) || applyCommandBindings ? <button type="button" onClick={() => { setBindings({}); setCommandOverrides({}); }}>Reset all</button> : null}<button type="button" onClick={close}>Close</button>{(toolItems && applyToolBindings) || applyCommandBindings ? <button type="submit">Apply</button> : null}</div>
      </form>
    </dialog>
  );
}
