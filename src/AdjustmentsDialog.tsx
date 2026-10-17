import { useEffect, useRef } from 'react';

export type AdjustmentCommand =
  | 'levels'
  | 'curves'
  | 'hue-saturation'
  | 'color-balance'
  | 'sharpen-noise';

const OPTIONS: { command: AdjustmentCommand; label: string; detail: string }[] = [
  { command: 'levels', label: 'Levels…', detail: 'Set black point, white point and gamma.' },
  { command: 'curves', label: 'Curves…', detail: 'Shape a bounded RGB or channel curve.' },
  { command: 'hue-saturation', label: 'Hue/Saturation…', detail: 'Adjust hue, saturation and lightness.' },
  { command: 'color-balance', label: 'Color Balance…', detail: 'Tune shadows, midtones and highlights.' },
  { command: 'sharpen-noise', label: 'Sharpen and Noise…', detail: 'Open the nondestructive detail controls.' },
];

export default function AdjustmentsDialog({
  close,
  choose,
}: {
  close: () => void;
  choose: (command: AdjustmentCommand) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} className="editor-dialog adjustments-dialog" aria-labelledby="adjustments-title" onCancel={close}>
      <form onSubmit={(event) => event.preventDefault()}>
        <h2 id="adjustments-title">Adjustments</h2>
        <p>Choose a nondestructive adjustment for the selected layer. The source asset remains editable.</p>
        <div className="adjustments-options">
          {OPTIONS.map((option) => (
            <button key={option.command} type="button" onClick={() => choose(option.command)}>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </button>
          ))}
        </div>
        <div className="dialog-actions"><button type="button" onClick={close}>Cancel</button></div>
      </form>
    </dialog>
  );
}
