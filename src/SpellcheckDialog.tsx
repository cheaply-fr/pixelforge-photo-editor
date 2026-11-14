import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILT_IN_SPELLING_DICTIONARY, findSpellingHints, loadSpellingDictionary, type SpellingDictionary } from './spellcheck';

export type SpellcheckLayer = { name: string; text: string };

export default function SpellcheckDialog({ layers, close }: { layers: SpellcheckLayer[]; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [dictionary, setDictionary] = useState<SpellingDictionary | undefined>();
  const [failed, setFailed] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let live = true;
    loadSpellingDictionary()
      .then((loaded) => { if (live) setDictionary(loaded); })
      .catch(() => { if (live) { setFailed(true); setDictionary(BUILT_IN_SPELLING_DICTIONARY); } });
    return () => { live = false; };
  }, []);
  const results = useMemo(
    () => dictionary ? layers.map((layer) => ({ name: layer.name, hints: findSpellingHints(layer.text, dictionary) })) : [],
    [dictionary, layers],
  );
  const total = results.reduce((sum, layer) => sum + layer.hints.length, 0);
  return (
    <dialog ref={dialog} className="editor-dialog spellcheck-dialog" aria-labelledby="spellcheck-title" onCancel={close}>
      <form onSubmit={(event) => event.preventDefault()}>
        <h2 id="spellcheck-title">Check Spelling</h2>
        <p>
          Lists words that are not in PixelForge’s built-in list of about 3,700 common English words and their
          regular forms (plurals, -ed, -ing, -er, -ly…). Names, technical terms and rarer words can appear here even
          when they are spelled correctly. The check runs on this device and never uploads text.
        </p>
        {failed && <output className="adjust-note">The common-word list could not be loaded, so only a minimal list was used.</output>}
        <div className="spellcheck-results" aria-label="Spelling hints" aria-busy={!dictionary}>
          {!dictionary ? <p className="command-search-empty">Loading word list…</p>
            : total ? results.filter((layer) => layer.hints.length).map((layer, index) => (
              <section key={`${layer.name}-${index}`}><b>{layer.name}</b><ul>{layer.hints.map((hint) => <li key={hint.word}><code>{hint.word}</code>{hint.count > 1 ? ` · ${hint.count} occurrences` : ''}</li>)}</ul></section>
            )) : <p className="command-search-empty">No unknown words found</p>}
        </div>
        <div className="dialog-actions"><button type="button" onClick={close}>Close</button></div>
      </form>
    </dialog>
  );
}
