import { useEffect, useRef, useState } from 'react';
import type { ToolCategory } from './toolPalette';

export type ToolbarColumns = 'auto' | '2' | '3';
export type ToolbarDensity = 'compact' | 'comfortable';

const displayToolLabel = (id: string) => id.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ');

export default function ToolbarSettingsDialog({ value, density, categories, hiddenCategories, categoryOrder, toolOrder, close, apply }: {
  value: ToolbarColumns;
  density: ToolbarDensity;
  categories: readonly ToolCategory[];
  hiddenCategories: readonly string[];
  categoryOrder: readonly string[];
  toolOrder: Readonly<Record<string, readonly string[]>>;
  close: () => void;
  apply: (value: { columns: ToolbarColumns; density: ToolbarDensity; hiddenCategories: string[]; categoryOrder: string[]; toolOrder: Record<string, string[]> }) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [columns, setColumns] = useState<ToolbarColumns>(value);
  const [toolbarDensity, setToolbarDensity] = useState<ToolbarDensity>(density);
  const [hidden, setHidden] = useState(() => new Set(hiddenCategories));
  const [order, setOrder] = useState(() => {
    const known = new Set(categories.map((category) => category.id));
    const stored = categoryOrder.filter((id) => known.has(id));
    return [...stored, ...categories.map((category) => category.id).filter((id) => !stored.includes(id))];
  });
  const [toolOrders, setToolOrders] = useState<Record<string, string[]>>(() => Object.fromEntries(
    categories.map((category) => [category.id, [...(toolOrder[category.id] ?? category.tools)]]),
  ));
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
  const moveTool = (categoryId: string, toolId: string, direction: -1 | 1) => setToolOrders((current) => {
    const tools = current[categoryId] ?? [];
    const index = tools.indexOf(toolId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= tools.length) return current;
    const next = [...tools];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    return { ...current, [categoryId]: next };
  });
  const resetDefaults = () => {
    setColumns('auto');
    setToolbarDensity('compact');
    setHidden(new Set());
    setOrder(categories.map((category) => category.id));
    setToolOrders(Object.fromEntries(categories.map((category) => [category.id, [...category.tools]])));
  };
  return (
    <dialog ref={dialog} className="editor-dialog toolbar-settings-dialog" aria-labelledby="toolbar-settings-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); apply({ columns, density: toolbarDensity, hiddenCategories: [...hidden], categoryOrder: order, toolOrder: toolOrders }); }}>
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
        <label className="select-row">
          <span>Category spacing</span>
          <select aria-label="Category spacing" value={toolbarDensity} onChange={(event) => setToolbarDensity(event.target.value as ToolbarDensity)}>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
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
        <fieldset className="toolbar-tool-settings">
          <legend>Tool order</legend>
          <p className="toolbar-category-help">Reorder tool slots within each category. Family variants stay grouped in their press-and-hold menu.</p>
          {order.map((categoryId) => {
            const category = categories.find((candidate) => candidate.id === categoryId);
            if (!category) return null;
            const tools = toolOrders[category.id] ?? [...category.tools];
            return (
              <details key={category.id} className="toolbar-tool-group">
                <summary>{category.label}</summary>
                <div className="toolbar-tool-list">
                  {tools.map((toolId, index) => {
                    const label = displayToolLabel(toolId);
                    return (
                      <div className="toolbar-tool-option" key={toolId}>
                        <span>{label}</span>
                        <button type="button" onClick={() => moveTool(category.id, toolId, -1)} disabled={index === 0} aria-label={`Move ${label} tool up`}>↑</button>
                        <button type="button" onClick={() => moveTool(category.id, toolId, 1)} disabled={index === tools.length - 1} aria-label={`Move ${label} tool down`}>↓</button>
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </fieldset>
        <div className="dialog-actions"><button type="button" onClick={resetDefaults}>Reset defaults</button><button type="button" onClick={close}>Cancel</button><button type="submit">Apply</button></div>
      </form>
    </dialog>
  );
}
