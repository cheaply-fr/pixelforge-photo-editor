import { useEffect, useMemo, useRef } from 'react';
import { checkFontAvailability } from './fontAvailability';

type Props = {
  families: readonly string[];
  close: () => void;
};

export default function MissingFontsDialog({ families, close }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const status = useMemo(() => {
    const check =
      typeof document !== 'undefined' && document.fonts
        ? (font: string) => document.fonts.check(font)
        : () => true;
    return Object.fromEntries(
      families.map((family) => [family, checkFontAvailability(family, check)]),
    );
  }, [families]);

  useEffect(() => {
    dialog.current?.showModal();
  }, [families]);

  const missing = families.filter((family) => status[family] === 'fallback');
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
          PixelForge checks the bounded local font list in this browser. Missing
          families remain editable, but the browser&apos;s fallback font is
          used; no font files or text are uploaded.
        </p>
        <ul className="missing-fonts-list" aria-label="Font availability">
          {families.map((family) => {
            const available = status[family] !== 'fallback';
            return (
              <li
                key={family}
                className={available ? undefined : 'missing'}
                data-testid={`font-status-${family.replaceAll(' ', '-')}`}
              >
                <span>{family}</span>
                <strong>{available ? 'Available' : 'Fallback active'}</strong>
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
