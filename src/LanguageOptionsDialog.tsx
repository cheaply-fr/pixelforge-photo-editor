import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_TEXT_LANGUAGE,
  TEXT_DIRECTIONS,
  TEXT_LANGUAGES,
  type TextDirection,
  type TextLanguage,
  type TextLanguageSettings,
} from './textLanguage';

const LANGUAGE_LABELS: Record<TextLanguage, string> = {
  auto: 'Auto detect',
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  ar: 'Arabic',
  he: 'Hebrew',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
};

const DIRECTION_LABELS: Record<TextDirection, string> = {
  auto: 'Auto from language',
  ltr: 'Left to right',
  rtl: 'Right to left',
};

export default function LanguageOptionsDialog({
  initial,
  close,
  apply,
}: {
  initial?: Partial<TextLanguageSettings>;
  close: () => void;
  apply: (value: TextLanguageSettings) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState<TextLanguageSettings>(() => ({
    ...DEFAULT_TEXT_LANGUAGE,
    ...initial,
  }));
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className="editor-dialog language-options-dialog" aria-labelledby="language-options-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); apply(value); }}>
        <h2 id="language-options-title">Language Options</h2>
        <p>Store portable language intent for the selected editable text layer. Browser shaping is used locally; no fonts or text leave this device.</p>
        <label className="select-row"><span>Language</span><select aria-label="Text language" value={value.language} onChange={(event) => setValue({ ...value, language: event.target.value as TextLanguage })}>{TEXT_LANGUAGES.map((language) => <option key={language} value={language}>{LANGUAGE_LABELS[language]}</option>)}</select></label>
        <label className="select-row"><span>Writing direction</span><select aria-label="Text direction" value={value.direction} onChange={(event) => setValue({ ...value, direction: event.target.value as TextDirection })}>{TEXT_DIRECTIONS.map((direction) => <option key={direction} value={direction}>{DIRECTION_LABELS[direction]}</option>)}</select></label>
        <label className="resize-lock"><input aria-label="Text hyphenation" type="checkbox" checked={value.hyphenation} onChange={(event) => setValue({ ...value, hyphenation: event.target.checked })} /><span>Allow hyphenation metadata</span></label>
        <p className="adjust-note">Hyphenation is retained as author intent for future layout engines; the current canvas renderer keeps authored line breaks unchanged.</p>
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button><button type="submit">Apply language options</button></div>
      </form>
    </dialog>
  );
}

