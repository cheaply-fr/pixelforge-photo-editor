import { useEffect, useRef } from 'react';
import type { SpellingHint } from './spellcheck';

export type SpellcheckLayer = { name: string; hints: SpellingHint[] };

export default function SpellcheckDialog({ layers, close }: { layers: SpellcheckLayer[]; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const total = layers.reduce((sum, layer) => sum + layer.hints.length, 0);
  return (
    <dialog ref={dialog} className="editor-dialog spellcheck-dialog" aria-labelledby="spellcheck-title" onCancel={close}>
      <form onSubmit={(event) => event.preventDefault()}>
        <h2 id="spellcheck-title">Check Spelling</h2>
        <p>This private local hint list uses a bounded English dictionary. It never uploads text and does not claim full language or grammar coverage.</p>
        <div className="spellcheck-results" aria-label="Spelling hints">
          {total ? layers.filter((layer) => layer.hints.length).map((layer) => (
            <section key={layer.name}><b>{layer.name}</b><ul>{layer.hints.map((hint) => <li key={hint.word}><code>{hint.word}</code>{hint.count > 1 ? ` · ${hint.count} occurrences` : ''}</li>)}</ul></section>
          )) : <p className="command-search-empty">No local spelling hints found</p>}
        </div>
        <div className="dialog-actions"><button type="button" onClick={close}>Close</button></div>
      </form>
    </dialog>
  );
}
