import { useEffect, useMemo, useRef, useState } from 'react';

export type FilterGalleryItem = {
  label: string;
  command: string;
  description: string;
  first: string;
  second: string;
};

export default function FilterGalleryDialog({
  items,
  close,
  apply,
}: {
  items: FilterGalleryItem[];
  close: () => void;
  apply: (command: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus();
  }, []);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => !needle || `${item.label} ${item.description}`.toLocaleLowerCase().includes(needle));
  }, [items, query]);
  return (
    <dialog ref={dialog} className="editor-dialog filter-gallery-dialog" aria-labelledby="filter-gallery-title" onCancel={close}>
      <form onSubmit={(event) => event.preventDefault()}>
        <h2 id="filter-gallery-title">Filter Gallery</h2>
        <p>Choose a local, nondestructive quick filter. The selected layer remains editable and the source pixels are preserved.</p>
        <input
          aria-label="Filter gallery search"
          className="text-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search filters…"
          autoComplete="off"
        />
        <div className="filter-gallery-grid" aria-label="Filter gallery results">
          {filtered.length ? filtered.map((item) => (
            <button type="button" key={item.command} aria-label={`Apply ${item.label} filter`} onClick={() => apply(item.command)}>
              <i style={{ background: `linear-gradient(135deg, ${item.first}, ${item.second})` }} aria-hidden="true" />
              <span><b>{item.label}</b><small>{item.description}</small></span>
            </button>
          )) : <p className="command-search-empty">No matching filters</p>}
        </div>
        <div className="dialog-actions"><button type="button" onClick={close}>Close</button></div>
      </form>
    </dialog>
  );
}
