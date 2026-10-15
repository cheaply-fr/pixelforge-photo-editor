import { useEffect, useRef, useState } from 'react';
import {
  GENERATIVE_UPSCALE_FACTORS,
  planGenerativeUpscale,
  type GenerativeUpscaleFactor,
  type GenerativeUpscaleRequest,
} from './generativeUpscale';
import { RESAMPLE_METHODS, type ResampleMethod } from './imageSize';

type Props = {
  width: number;
  height: number;
  close: () => void;
  apply: (request: GenerativeUpscaleRequest) => void;
};

export default function GenerativeUpscaleDialog({ width, height, close, apply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [factor, setFactor] = useState<GenerativeUpscaleFactor>(2);
  const [method, setMethod] = useState<ResampleMethod>('automatic');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const request = { factor, method } satisfies GenerativeUpscaleRequest;
  let error = '';
  try {
    planGenerativeUpscale(width, height, request);
  } catch (reason) {
    error = reason instanceof Error ? reason.message : 'Upscale values are invalid';
  }
  const preview = (() => {
    try {
      const plan = planGenerativeUpscale(width, height, request);
      return `${plan.width} × ${plan.height} px · ${(plan.width * plan.height / 1_000_000).toFixed(2)} MP`;
    } catch {
      return 'This factor exceeds the local document budget';
    }
  })();
  return (
    <dialog ref={dialog} className="editor-dialog generative-upscale-dialog" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); if (!error) apply(request); }}>
        <h2>Generative Upscale</h2>
        <p>
          Create a larger editable document with the local detail-preserving resampler. This
          offline approximation does not call an AI service or invent semantic content.
        </p>
        <label>
          Scale
          <select aria-label="Upscale factor" value={factor} onChange={(event) => setFactor(Number(event.target.value) as GenerativeUpscaleFactor)}>
            {GENERATIVE_UPSCALE_FACTORS.map((value) => {
              let disabled = false;
              try { planGenerativeUpscale(width, height, { factor: value, method }); } catch { disabled = true; }
              return <option key={value} value={value} disabled={disabled}>{value}×</option>;
            })}
          </select>
        </label>
        <label>
          Resample method
          <select aria-label="Upscale method" value={method} onChange={(event) => setMethod(event.target.value as ResampleMethod)}>
            {RESAMPLE_METHODS.filter((value) => value !== 'nearest').map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
          </select>
        </label>
        <output aria-live="polite">Preview: {preview}</output>
        {error && <p role="alert" className="resize-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit" disabled={Boolean(error)}>Apply upscale</button>
        </div>
      </form>
    </dialog>
  );
}
