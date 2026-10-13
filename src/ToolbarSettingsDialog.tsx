import { useEffect, useRef, useState } from 'react';
import type { ToolCategory } from './toolPalette';

export type ToolbarColumns = 'auto' | '2' | '3';

export default function ToolbarSettingsDialog({ value, categories, hiddenCategories, close, apply }: {
  value: ToolbarColumns;
  categories: readonly ToolCategory[];
  hiddenCategories: readonly string[];
  close: () => void;
  apply: (value: { columns: ToolbarColumns; hiddenCategories: string[] }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [columns, setColumns] = useState<ToolbarColumns>(value);
  const [hidden, setHidden] = useState(() => new Set(hiddenCategories));
  useEffect(() => { dialog.current?.showModal(); }, []);
  const toggleCategory = (id: string) => setHidden((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else if (next.size < categories.length - 1) next.add(id);
    return next;
  });
  return (
    <dialog ref={dialog} className="editor-dialog toolbar-settings-dialog" aria-labelledby="toolbar-settings-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); apply({ columns, hiddenCategories: [...hidden] }); }}>
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
        <fieldset className="toolbar-category-settings">
          <legend>Visible categories</legend>
          <p className="toolbar-category-help">Hide categories you do not use to keep the palette compact. At least one category stays visible.</p>
          {categories.map((category) => (
            <label className="toolbar-category-option" key={category.id}>
              <input
                type="checkbox"
                checked={!hidden.has(category.id)}
                onChange={() => toggleCategory(category.id)}
                aria-label={`${category.label} category`}
              />
              <span>{category.label}</span>
            </label>
          ))}
        </fieldset>
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Apply</button></div>
      </form>
    </dialog>
  );
}
