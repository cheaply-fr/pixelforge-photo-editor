import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  FONT_CATEGORIES,
  FONT_CATEGORY_LABELS,
  fontFileUrl,
  libraryFont,
  searchFonts,
  virtualWindow,
  type FontCategory,
  type FontListItem,
} from './fontLibrary';
import { sharedFontLoader } from './fontLoader';
import { useFontLoadState, useFontLoaderRevision, useFontPreferences } from './useFontLibrary';

const ROW_HEIGHT = 48;
const VIEWPORT = 288;
/** Rows must stay visible this long before their preview font is fetched. */
const PREVIEW_DELAY_MS = 300;

type Filter = FontCategory | 'all' | 'favourites' | 'recent';

function previewText(item: FontListItem): string {
  return libraryFont(item.family)?.sample ?? item.family;
}

function cssFamily(family: string, loaded: boolean): string {
  return loaded ? `"${family}", system-ui, sans-serif` : 'system-ui, sans-serif';
}

function FontRow({
  item,
  top,
  selected,
  active,
  favourite,
  onChoose,
  onFavourite,
  onFocus,
  onKeyDown,
}: {
  item: FontListItem;
  top: number;
  selected: boolean;
  active: boolean;
  favourite: boolean;
  onChoose: () => void;
  onFavourite: () => void;
  onFocus: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
}) {
  const state = useFontLoadState(item.family);
  const loaded = item.kind === 'system' || state === 'loaded';
  const font = libraryFont(item.family);
  return (
    <li className={`font-picker-row${active ? ' active' : ''}`} style={{ top }} data-family={item.family}>
      <button
        type="button"
        className="font-picker-choose"
        aria-label={`Use font ${item.family}`}
        aria-current={selected ? 'true' : undefined}
        tabIndex={active ? 0 : -1}
        data-active={active ? 'true' : undefined}
        onClick={onChoose}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      >
        <span className="font-picker-name">
          {item.family}
          <small>{item.kind === 'system' ? 'System' : FONT_CATEGORY_LABELS[font!.category]}</small>
        </span>
        <span
          className="font-picker-sample"
          aria-hidden="true"
          data-loaded={loaded ? 'true' : 'false'}
          style={{ fontFamily: cssFamily(item.family, loaded) }}
        >
          {loaded || !font?.sample ? previewText(item) : '…'}
        </span>
      </button>
      <button
        type="button"
        className="font-picker-favourite"
        aria-label={`Favourite ${item.family}`}
        aria-pressed={favourite}
        tabIndex={-1}
        onClick={onFavourite}
      >
        {favourite ? '★' : '☆'}
      </button>
    </li>
  );
}

/**
 * Searchable, virtualised font picker. Only rows that stay visible fetch
 * their preview face (low priority, Latin subset); choosing a family loads
 * it at high priority. Favourites and recents live in localStorage.
 */
export default function FontPicker({
  value,
  onChange,
  close,
  title = 'Choose font',
}: {
  value: string;
  onChange: (family: string) => void;
  close: () => void;
  title?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [scrollTop, setScrollTop] = useState(0);
  const [active, setActive] = useState(0);
  const { favourites, recent, toggleFavourite, markRecent } = useFontPreferences();
  useFontLoaderRevision();
  const items = useMemo(() => searchFonts({ query, category: filter, favourites, recent }), [query, filter, favourites, recent]);
  const range = virtualWindow(items.length, scrollTop, VIEWPORT, ROW_HEIGHT, 3);
  const visible = items.slice(range.start, range.end);
  const activeItem = items[Math.min(active, items.length - 1)];
  const activeFont = activeItem ? libraryFont(activeItem.family) : undefined;
  const activeState = useFontLoadState(activeItem?.family ?? '', activeItem ? { priority: 'low', text: activeFont?.sample } : false);

  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  }, []);

  const resetScroll = () => {
    setActive(0);
    setScrollTop(0);
    if (list.current) list.current.scrollTop = 0;
  };

  // Fetch previews only for rows that stay on screen (debounced), so opening
  // or scrolling through the list never downloads the whole library.
  const visibleKey = visible.map((item) => item.family).join('|');
  useEffect(() => {
    const timer = setTimeout(() => {
      const loader = sharedFontLoader();
      for (const family of visibleKey.split('|')) {
        const font = libraryFont(family);
        if (font) void loader.ensure(font.family, { priority: 'low', text: font.sample ?? font.family });
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [visibleKey]);

  const focusRow = (index: number) => {
    const next = Math.max(0, Math.min(items.length - 1, index));
    setActive(next);
    const container = list.current;
    if (!container) return;
    const top = next * ROW_HEIGHT;
    if (top < container.scrollTop) container.scrollTop = top;
    else if (top + ROW_HEIGHT > container.scrollTop + container.clientHeight) container.scrollTop = top + ROW_HEIGHT - container.clientHeight;
    setScrollTop(container.scrollTop);
    requestAnimationFrame(() => list.current?.querySelector<HTMLButtonElement>('[data-active="true"]')?.focus());
  };

  const choose = (family: string) => {
    markRecent(family);
    void sharedFontLoader().ensure(family, { priority: 'high' });
    onChange(family);
    close();
  };

  const onListKey = (event: KeyboardEvent) => {
    const page = Math.max(1, Math.floor(VIEWPORT / ROW_HEIGHT) - 1);
    const moves: Record<string, number> = { ArrowDown: active + 1, ArrowUp: active - 1, PageDown: active + page, PageUp: active - page, Home: 0, End: items.length - 1 };
    if (event.key in moves) {
      event.preventDefault();
      focusRow(moves[event.key]);
    } else if ((event.key === 'f' || event.key === 'F') && activeItem && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      toggleFavourite(activeItem.family);
    }
  };

  return (
    <dialog ref={dialog} className="editor-dialog font-picker-dialog" aria-labelledby="font-picker-title" onCancel={close}>
      <form onSubmit={(event) => event.preventDefault()}>
        <h2 id="font-picker-title">{title}</h2>
        <div className="font-picker-controls">
          <input
            type="search"
            aria-label="Search fonts"
            className="text-input"
            placeholder="Search by name, style or tag…"
            value={query}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              resetScroll();
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                focusRow(0);
              } else if (event.key === 'Enter' && items[0]) {
                event.preventDefault();
                choose(items[active]?.family ?? items[0].family);
              }
            }}
          />
          <select aria-label="Font category" className="text-input" value={filter}
            onChange={(event) => {
              setFilter(event.target.value as Filter);
              resetScroll();
            }}
          >
            <option value="all">All fonts</option>
            <option value="favourites">Favourites ({favourites.length})</option>
            <option value="recent">Recent</option>
            {FONT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {FONT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
        <output className="font-picker-count" aria-live="polite">
          {items.length} font{items.length === 1 ? '' : 's'}
        </output>
        <div
          ref={list}
          className="font-picker-list"
          style={{ height: VIEWPORT }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <ul aria-label="Fonts" style={{ height: items.length * ROW_HEIGHT }}>
            {visible.map((item, offset) => {
              const index = range.start + offset;
              return (
                <FontRow
                  key={item.family}
                  item={item}
                  top={index * ROW_HEIGHT}
                  selected={item.family === value}
                  active={index === active}
                  favourite={favourites.includes(item.family)}
                  onChoose={() => choose(item.family)}
                  onFavourite={() => toggleFavourite(item.family)}
                  onFocus={() => setActive(index)}
                  onKeyDown={onListKey}
                />
              );
            })}
          </ul>
          {!items.length && <p className="command-search-empty">No fonts match</p>}
        </div>
        {activeItem && (
          <section className="font-picker-details" aria-label="Font details">
            <p
              className="font-picker-preview"
              data-testid="font-picker-preview"
              style={{ fontFamily: cssFamily(activeItem.family, activeItem.kind === 'system' || activeState === 'loaded') }}
            >
              {activeFont?.sample ?? 'The quick brown fox jumps over the lazy dog'}
            </p>
            <small>
              {activeItem.family} ·{' '}
              {activeFont ? (
                <>
                  {activeFont.licence} ·{' '}
                  <a href={fontFileUrl(activeFont.licenceFile)} target="_blank" rel="noreferrer">
                    licence
                  </a>
                  {activeState === 'loaded' ? ' · loaded' : activeState === 'failed' ? ' · unavailable, fallback shown' : ' · loads on demand'}
                </>
              ) : (
                'system font'
              )}
            </small>
          </section>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={close}>
            Close
          </button>
        </div>
      </form>
    </dialog>
  );
}
