import { useEffect, useRef, useState } from 'react';
import type { ToolCategory } from './toolPalette';

export type ToolbarColumns = 'auto' | '2' | '3';

export default function ToolbarSettingsDialog({ value, categories, hiddenCategories, categoryOrder, close, apply }: {
  value: ToolbarColumns;
  categories: readonly ToolCategory[];
  hiddenCategories: readonly string[];
  categoryOrder: readonly string[];
  close: () => void;
  apply: (value: { columns: ToolbarColumns; hiddenCategories: string[]; categoryOrder: string[] }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [columns, setColumns] = useState<ToolbarColumns>(value);
  const [hidden, setHidden] = useState(() => new Set(hiddenCategories));
  const [order, setOrder] = useState(() => {
    const known = new Set(categories.map((category) => category.id));
    const stored = categoryOrder.filter((id) => known.has(id));
    return [...stored, ...categories.map((category) => category.id).filter((id) => !stored.includes(id))];
  });
  useEffect(() => { dialog.current?.showModal(); }, []);
  const toggleCategory = (id: string) => setHidden((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else if (next.size < categories.length - 1) next.add(id);
    return next;
  });
  const moveCategory = (id: string, direction: -1 | 1) => setOrder((current) => {
    const index = current.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
    const next = [...current];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return next;
  });
  return (
    <dialog ref={dialog} className="editor-dialog toolbar-settings-dialog" aria-labelledby="toolbar-settings-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); apply({ columns, hiddenCategories: [...hidden], categoryOrder: order }); }}>
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
          {order.map((id, index) => {
            const category = categories.find((candidate) => candidate.id === id);
            if (!category) return null;
            return (
            <label className="toolbar-category-option" key={category.id}>
              <input
                type="checkbox"
                checked={!hidden.has(category.id)}
                onChange={() => toggleCategory(category.id)}
                aria-label={`${category.label} category`}
              />
              <span>{category.label}</span>
              <button type="button" onClick={() => moveCategory(category.id, -1)} disabled={index === 0} aria-label={`Move ${category.label} category up`}>↑</button>
              <button type="button" onClick={() => moveCategory(category.id, 1)} disabled={index === order.length - 1} aria-label={`Move ${category.label} category down`}>↓</button>
            </label>
            );
          })}
        </fieldset>
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Apply</button></div>
      </form>
    </dialog>
  );
}
