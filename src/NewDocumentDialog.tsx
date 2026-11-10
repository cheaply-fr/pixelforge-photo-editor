import { useEffect, useRef, useState } from 'react';
import {
  NEW_DOCUMENT_BACKGROUNDS,
  NEW_DOCUMENT_PRESETS,
  MAX_DOCUMENT_SIDE,
  megapixels,
  newDocumentProblem,
  parseDimension,
  presetFor,
  type NewDocumentBackground,
  type NewDocumentRequest,
} from './newDocument';

type Props = {
  close: () => void;
  apply: (request: NewDocumentRequest) => void;
};

const problems = {
  width: `Width must be a whole number from 1 to ${MAX_DOCUMENT_SIDE.toLocaleString('en')} pixels.`,
  height: `Height must be a whole number from 1 to ${MAX_DOCUMENT_SIDE.toLocaleString('en')} pixels.`,
  pixels: 'Documents are limited to 16 megapixels.',
  name: 'Enter a name of up to 160 characters.',
};

export default function NewDocumentDialog({ close, apply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('untitled');
  const [w, setW] = useState('1200');
  const [h, setH] = useState('800');
  const [background, setBackground] = useState<NewDocumentBackground>('white');
  const width = parseDimension(w), height = parseDimension(h);
  const problem = newDocumentProblem(width, height, name);
  const preset = width !== undefined && height !== undefined ? presetFor(width, height) : undefined;
  useEffect(() => {
    const target = dialog.current;
    if (!target) return;
    target.showModal();
    const onCancel = (event: Event) => { event.preventDefault(); close(); };
    target.addEventListener('cancel', onCancel);
    return () => target.removeEventListener('cancel', onCancel);
  }, [close]);
  return (
    <dialog ref={dialog} className="editor-dialog new-document-dialog" aria-labelledby="new-document-title" onClose={close}>
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (!problem) apply({ name: name.trim(), width: width!, height: height!, background });
        }}
      >
        <h2 id="new-document-title">New document</h2>
        <label><span>Name</span><input aria-label="Document name for new document" className="text-input" maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>
          <span>Preset</span>
          <select
            aria-label="Document preset"
            value={preset?.id ?? 'custom'}
            onChange={(event) => {
              const next = NEW_DOCUMENT_PRESETS.find((item) => item.id === event.target.value);
              if (next) { setW(String(next.width)); setH(String(next.height)); }
            }}
          >
            {NEW_DOCUMENT_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            <option value="custom" disabled>Custom</option>
          </select>
        </label>
        <div className="new-document-size">
          <label><span>Width (px)</span><input aria-label="New document width (px)" type="number" min="1" max={MAX_DOCUMENT_SIDE} step="1" value={w} onChange={(event) => setW(event.target.value)} /></label>
          <button type="button" className="new-document-swap" aria-label="Swap width and height" onClick={() => { setW(h); setH(w); }}>⇄</button>
          <label><span>Height (px)</span><input aria-label="New document height (px)" type="number" min="1" max={MAX_DOCUMENT_SIDE} step="1" value={h} onChange={(event) => setH(event.target.value)} /></label>
        </div>
        <label>
          <span>Background contents</span>
          <select aria-label="Background contents" value={background} onChange={(event) => setBackground(event.target.value as NewDocumentBackground)}>
            {NEW_DOCUMENT_BACKGROUNDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <p data-testid="new-document-summary">
          {width !== undefined && height !== undefined ? `${width} × ${height} px · ${megapixels(width, height)}` : 'Enter whole pixel dimensions'}
        </p>
        {problem && <p role="alert" className="resize-error">{problems[problem]}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit" disabled={Boolean(problem)}>Create document</button>
        </div>
      </form>
    </dialog>
  );
}
