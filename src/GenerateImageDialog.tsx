import { useEffect, useRef, useState } from 'react';
import {
  GENERATE_IMAGE_MAX_HEIGHT,
  GENERATE_IMAGE_MAX_PROMPT,
  GENERATE_IMAGE_MAX_WIDTH,
  GENERATE_IMAGE_MIN_HEIGHT,
  GENERATE_IMAGE_MIN_WIDTH,
  type GenerateImageRequest,
} from './generateImage';

export default function GenerateImageDialog({
  close,
  apply,
}: {
  close: () => void;
  apply: (request: GenerateImageRequest) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState('abstract blue gradient');
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [seed, setSeed] = useState(1);
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }, []);
  return (
    <dialog ref={dialog} className="editor-dialog generate-image-dialog" aria-labelledby="generate-image-title" onCancel={close}>
      <form onSubmit={(event) => {
        event.preventDefault();
        apply({ prompt, width, height, seed });
      }}>
        <h2 id="generate-image-title">Generate Image</h2>
        <p>
          Creates a new abstract raster layer with a deterministic local renderer. No model,
          provider, upload or semantic image generation is used.
        </p>
        <label>
          Local description
          <textarea
            aria-label="Generate Image description"
            value={prompt}
            maxLength={GENERATE_IMAGE_MAX_PROMPT}
            rows={3}
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <label>
          Width
          <input aria-label="Generate Image width" type="number" min={GENERATE_IMAGE_MIN_WIDTH} max={GENERATE_IMAGE_MAX_WIDTH} value={width} onChange={(event) => setWidth(Number(event.target.value))} />
        </label>
        <label>
          Height
          <input aria-label="Generate Image height" type="number" min={GENERATE_IMAGE_MIN_HEIGHT} max={GENERATE_IMAGE_MAX_HEIGHT} value={height} onChange={(event) => setHeight(Number(event.target.value))} />
        </label>
        <label>
          Deterministic seed
          <input aria-label="Generate Image seed" type="number" min={0} max={4294967295} step={1} value={seed} onChange={(event) => setSeed(Math.max(0, Math.min(4294967295, Number(event.target.value) || 0)))} />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit">Generate local image</button>
        </div>
      </form>
    </dialog>
  );
}
