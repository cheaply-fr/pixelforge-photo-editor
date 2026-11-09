import { useEffect, useRef } from 'react';
import { checkFontAvailability } from './fontAvailability';
import { fontFamilyKind } from './fontLibrary';
import { sharedFontLoader } from './fontLoader';
import { useFontLoaderRevision } from './useFontLibrary';

type Props = {
  families: readonly string[];
  close: () => void;
};

type Status = 'available' | 'fallback' | 'library-loaded' | 'library-on-demand' | 'missing';

const LABELS: Record<Status, string> = {
  available: 'Available',
  fallback: 'Fallback active',
  'library-loaded': 'Library font · loaded',
  'library-on-demand': 'Library font · loads on demand',
  missing: 'Missing · fallback active',
};

export default function MissingFontsDialog({ families, close }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Re-render when a library family finishes loading.
  useFontLoaderRevision();
  const status = (() => {
    const check =
      typeof document !== 'undefined' && document.fonts
        ? (font: string) => document.fonts.check(font)
        : () => true;
    const loader = sharedFontLoader();
    return Object.fromEntries(
      families.map((family): [string, Status] => {
        const kind = fontFamilyKind(family);
        if (kind === 'system') return [family, checkFontAvailability(family, check)];
        if (kind === 'unknown') return [family, 'missing'];
        const state = loader.state(family);
        return [family, state === 'loaded' ? 'library-loaded' : state === 'failed' ? 'fallback' : 'library-on-demand'];
      }),
    );
  })();

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const missing = families.filter((family) => status[family] === 'fallback' || status[family] === 'missing');
  return (
    <dialog
      ref={dialog}
      className="editor-dialog missing-fonts-dialog"
      aria-labelledby="missing-fonts-title"
      onCancel={close}
    >
      <form onSubmit={(event) => event.preventDefault()}>
        <h2 id="missing-fonts-title">Manage Missing Fonts</h2>
        <p>
          PixelForge checks the built-in system fonts in this browser and the
          fonts used by this document. Library fonts are self-hosted and load on
          demand. Missing families remain editable, but the browser&apos;s
          fallback font is used; no font files or text are uploaded.
        </p>
        <ul className="missing-fonts-list" aria-label="Font availability">
          {families.map((family) => {
            const value = status[family];
            const problem = value === 'fallback' || value === 'missing';
            return (
              <li
                key={family}
                className={problem ? 'missing' : undefined}
                data-testid={`font-status-${family.replaceAll(' ', '-')}`}
              >
                <span>{family}</span>
                <strong>{LABELS[value]}</strong>
              </li>
            );
          })}
        </ul>
        {!missing.length && (
          <output className="command-search-empty">
            No missing fonts detected in this browser.
          </output>
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
