import { useEffect, useMemo, useRef, useState } from 'react';
import { FONT_LIBRARY, fontFileUrl, fontMetaUrl, libraryFont, type LibraryFont } from './fontLibrary';
import { codepointLabel, glyphBlocks, parseGlyphMeta, restrictGlyphMeta, searchGlyphs, type GlyphMeta } from './glyphIndex';
import { useFontLoadState } from './useFontLibrary';

export type GlyphInsertMode = 'text' | 'shape';

const ICON_FONTS = FONT_LIBRARY.filter((font) => font.category === 'icons' || font.category === 'symbols');
const metaCache = new Map<string, Promise<GlyphMeta | undefined>>();

function loadMeta(font: LibraryFont): Promise<GlyphMeta | undefined> {
  let pending = metaCache.get(font.id);
  if (!pending) {
    pending = fetch(fontMetaUrl(font))
      .then((response) => (response.ok ? response.json() : undefined))
      .then(parseGlyphMeta)
      .then((meta) => {
        const ranges = font.faces.map((face) => face.unicodeRange);
        return meta && restrictGlyphMeta(meta, ranges.every(Boolean) ? (ranges as string[]) : undefined);
      })
      .catch(() => undefined);
    metaCache.set(font.id, pending);
    void pending.then((meta) => {
      if (!meta) metaCache.delete(font.id);
    });
  }
  return pending;
}

const RESULT_LIMIT = 240;

/**
 * Glyphs / Icons & Symbols panel: browse the current library font or any
 * bundled icon/symbol font, search icons by name/tag (Material Symbols, Font
 * Awesome, Weather Icons) or symbols by Unicode block/codepoint, and insert a
 * glyph into the active text layer (or as a new layer / shape).
 */
export default function GlyphsPanel({
  currentFamily,
  onInsert,
  close,
}: {
  currentFamily: string;
  onInsert: (char: string, family: string, mode: GlyphInsertMode) => void;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const current = libraryFont(currentFamily);
  const [family, setFamily] = useState(() => (current && (current.category === 'icons' || current.category === 'symbols') ? current.family : ICON_FONTS[0].family));
  const font = libraryFont(family);
  const [loadedMeta, setLoadedMeta] = useState<{ id: string; meta?: GlyphMeta }>({ id: '' });
  const [query, setQuery] = useState('');
  const [block, setBlock] = useState('');
  const [mode, setMode] = useState<GlyphInsertMode>('text');
  const loadState = useFontLoadState(family, font ? { priority: 'high', text: font.sample } : false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    let live = true;
    if (font)
      void loadMeta(font).then((value) => {
        if (live) setLoadedMeta({ id: font.id, meta: value });
      });
    return () => {
      live = false;
    };
  }, [font]);
  const meta = font && loadedMeta.id === font.id ? loadedMeta.meta : undefined;
  const status: 'loading' | 'ready' | 'error' = !font ? 'error' : loadedMeta.id !== font.id ? 'loading' : meta ? 'ready' : 'error';

  const blocks = useMemo(() => (meta && !meta.icons ? glyphBlocks(meta) : []), [meta]);
  const result = useMemo(() => (meta ? searchGlyphs(meta, { query, block: block || undefined, limit: RESULT_LIMIT }) : { items: [], total: 0 }), [meta, query, block]);
  const textFonts = current && current.category !== 'icons' && current.category !== 'symbols' ? [current] : [];
  const loaded = loadState === 'loaded';

  return (
    <dialog ref={dialog} className="editor-dialog glyphs-dialog" aria-labelledby="glyphs-title" onCancel={close}>
      <form onSubmit={(event) => event.preventDefault()}>
        <h2 id="glyphs-title">Glyphs, icons &amp; symbols</h2>
        <div className="glyphs-controls">
          <select
            aria-label="Glyph font"
            className="text-input"
            value={family}
            onChange={(event) => {
              setFamily(event.target.value);
              setBlock('');
            }}
          >
            {textFonts.map((item) => (
              <option key={item.family} value={item.family}>
                Current font: {item.family}
              </option>
            ))}
            <optgroup label="Icons">
              {ICON_FONTS.filter((item) => item.category === 'icons').map((item) => (
                <option key={item.family} value={item.family}>
                  {item.family} ({item.icons?.count ?? 0})
                </option>
              ))}
            </optgroup>
            <optgroup label="Symbols & signs">
              {ICON_FONTS.filter((item) => item.category === 'symbols').map((item) => (
                <option key={item.family} value={item.family}>
                  {item.family} ({item.icons?.count ?? 0})
                </option>
              ))}
            </optgroup>
          </select>
          <input
            type="search"
            aria-label="Search glyphs"
            className="text-input"
            placeholder={meta?.icons ? 'Search icons: home, arrow, star…' : 'Search: arrows, U+2605, ★…'}
            value={query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
          {blocks.length > 0 && (
            <select aria-label="Unicode block" className="text-input" value={block} onChange={(event) => setBlock(event.target.value)}>
              <option value="">All blocks</option>
              {blocks.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ({item.count})
                </option>
              ))}
            </select>
          )}
          <fieldset className="glyphs-mode">
            <legend>Insert as</legend>
            <label>
              <input type="radio" name="glyph-insert-mode" checked={mode === 'text'} onChange={() => setMode('text')} /> Text
            </label>
            <label>
              <input type="radio" name="glyph-insert-mode" checked={mode === 'shape'} onChange={() => setMode('shape')} /> Shape
            </label>
          </fieldset>
        </div>
        <output className="glyphs-count" aria-live="polite">
          {status === 'loading'
            ? 'Loading glyphs…'
            : status === 'error'
              ? 'Glyph list unavailable (offline before first use?)'
              : `${result.total} glyph${result.total === 1 ? '' : 's'}${result.total > result.items.length ? ` · showing first ${result.items.length}, refine the search` : ''}${loaded ? '' : ' · loading font…'}`}
        </output>
        <section className="glyphs-grid" aria-label="Glyphs">
          {result.items.map((item) => (
            <button
              key={item.cp}
              type="button"
              className="glyph-cell"
              aria-label={`Insert ${item.name}`}
              title={`${item.name} (${codepointLabel(item.cp)})`}
              data-codepoint={item.cp.toString(16)}
              style={{ fontFamily: `"${family}", system-ui` }}
              onClick={() => onInsert(item.char, family, mode)}
            >
              {item.char}
            </button>
          ))}
        </section>
        {font && (
          <p className="glyphs-attribution">
            {font.icons?.attribution ?? font.attribution} · {font.licence} ·{' '}
            <a href={fontFileUrl(font.licenceFile)} target="_blank" rel="noreferrer">
              licence
            </a>
          </p>
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
