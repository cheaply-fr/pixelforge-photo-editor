import { useEffect, useRef, useState } from 'react';
import type { PhotoAdjustments } from './photoAdjustments';

type CameraRawDialogProps = {
  initial: PhotoAdjustments;
  close: () => void;
  apply: (patch: Partial<PhotoAdjustments>) => void;
};

function number(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function Control({
  label,
  value,
  set,
  min,
  max,
  step = 1,
  suffix = '',
}: {
  label: string;
  value: number;
  set: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <label className="camera-raw-control">
      <span>{label}<small>{value}{suffix}</small></span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => set(number(event.target.value))}
      />
    </label>
  );
}

export default function CameraRawDialog({ initial, close, apply }: CameraRawDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState({
    highlights: initial.highlights,
    shadows: initial.shadows,
    temperature: initial.temperature,
    tint: initial.tint,
    clarity: initial.clarity,
  });
  useEffect(() => { dialog.current?.showModal(); }, []);
  const update = (key: keyof typeof values) => (value: number) =>
    setValues((current) => ({ ...current, [key]: value }));
  return (
    <dialog ref={dialog} className="editor-dialog camera-raw-dialog" aria-labelledby="camera-raw-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); apply(values); }}>
        <h2 id="camera-raw-title">Camera Raw Filter</h2>
        <p>
          Apply bounded local raw-style tonal controls without uploading the source. Camera profiles,
          demosaicing and linear-light RAW processing are outside this contract.
        </p>
        <Control label="Highlights" value={values.highlights} set={update('highlights')} min={-100} max={100} />
        <Control label="Shadows" value={values.shadows} set={update('shadows')} min={-100} max={100} />
        <Control label="Temperature" value={values.temperature} set={update('temperature')} min={-100} max={100} />
        <Control label="Tint" value={values.tint} set={update('tint')} min={-100} max={100} />
        <Control label="Clarity" value={values.clarity} set={update('clarity')} min={-100} max={100} />
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit">Apply Camera Raw</button>
        </div>
      </form>
    </dialog>
  );
}
