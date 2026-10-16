import { useEffect, useRef, useState } from 'react';
import {
  GENERATIVE_FILL_MAX_PROMPT,
  GENERATIVE_FILL_MAX_RADIUS,
} from './contentAwareCleanup';

export type GenerativeFillRequest = {
  prompt: string;
  radius: number;
  opacity: number;
  seed: number;
};

export default function GenerativeFillDialog({
  close,
  apply,
}: {
  close: () => void;
  apply: (request: GenerativeFillRequest) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState('');
  const [radius, setRadius] = useState(32);
  const [opacity, setOpacity] = useState(100);
  const [seed, setSeed] = useState(1);
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="editor-dialog generative-fill-dialog"
      aria-labelledby="generative-fill-title"
      onCancel={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply({ prompt: prompt.trim(), radius, opacity, seed });
        }}
      >
        <h2 id="generative-fill-title">Generative Fill</h2>
        <p>
          Local texture synthesis fills the active selection from nearby pixels.
          The prompt is retained only in this draft; no image, prompt or
          account data is uploaded and no remote model is called.
        </p>
        <label>
          Description (optional)
          <textarea
            aria-label="Generative Fill description"
            value={prompt}
            maxLength={GENERATIVE_FILL_MAX_PROMPT}
            rows={3}
            placeholder="Describe the intended local texture…"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <label>
          Radius
          <input
            aria-label="Generative Fill radius"
            type="range"
            min={1}
            max={GENERATIVE_FILL_MAX_RADIUS}
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
          />
          <output>{radius}px</output>
        </label>
        <label>
          Amount
          <input
            aria-label="Generative Fill amount"
            type="range"
            min={1}
            max={100}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
          />
          <output>{opacity}%</output>
        </label>
        <label>
          Deterministic seed
          <input
            aria-label="Generative Fill seed"
            type="number"
            min={0}
            max={4294967295}
            step={1}
            value={seed}
            onChange={(event) => setSeed(Math.max(0, Math.min(4294967295, Number(event.target.value) || 0)))}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit">Apply local fill</button>
        </div>
      </form>
    </dialog>
  );
}
