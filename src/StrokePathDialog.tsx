import { useEffect, useRef, useState } from 'react';
import {
  STROKE_PATH_TOOLS,
  STROKE_PATH_TOOL_LABELS,
  normalizeStrokePathSettings,
  type StrokePathSettings,
} from './strokePath';

export type StrokePathDialogLayer = { id: string; name: string };
export type StrokePathRequest = StrokePathSettings & { pathLayerId?: string; targetLayerId: string };

const percentValid = (value: string) => /^\d{1,3}$/.test(value.trim()) && Number(value) <= 100;

/**
 * Stroke Path with Brush: choose the path (or every visible path), the
 * paint target and the simulated pressure. All painting happens in the
 * editor as one undoable step; this component only collects settings.
 */
export default function StrokePathDialog({
  paths,
  targets,
  initial,
  initialPathLayerId,
  initialTargetLayerId,
  close,
  apply,
}: {
  paths: StrokePathDialogLayer[];
  targets: StrokePathDialogLayer[];
  initial: StrokePathSettings;
  initialPathLayerId?: string;
  initialTargetLayerId?: string;
  close: () => void;
  apply: (request: StrokePathRequest) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tool, setTool] = useState(initial.tool);
  const [scope, setScope] = useState(initial.scope);
  const [pathLayerId, setPathLayerId] = useState(initialPathLayerId ?? paths[0]?.id ?? '');
  const [targetLayerId, setTargetLayerId] = useState(initialTargetLayerId ?? targets[0]?.id ?? '');
  const [simulatePressure, setSimulatePressure] = useState(initial.simulatePressure);
  const [taperStart, setTaperStart] = useState(String(initial.taperStart));
  const [taperEnd, setTaperEnd] = useState(String(initial.taperEnd));
  const [minSize, setMinSize] = useState(String(initial.minSize));
  const [pressureSize, setPressureSize] = useState(initial.pressureSize);
  const [pressureOpacity, setPressureOpacity] = useState(initial.pressureOpacity);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const numbersValid = !simulatePressure || [taperStart, taperEnd, minSize].every(percentValid);
  const valid = numbersValid && Boolean(targetLayerId) && (scope === 'all' || Boolean(pathLayerId)) && paths.length > 0;
  const submit = () => {
    if (!valid) return;
    const settings = normalizeStrokePathSettings({
      tool, scope, simulatePressure, pressureSize, pressureOpacity,
      taperStart: Number(taperStart), taperEnd: Number(taperEnd), minSize: Number(minSize),
    });
    apply({ ...settings, pathLayerId: scope === 'all' ? undefined : pathLayerId, targetLayerId });
  };
  const percentField = (label: string, value: string, set: (value: string) => void) => (
    <label>
      <span>{label} (%)</span>
      <input
        aria-label={`${label} (%)`}
        type="text"
        inputMode="numeric"
        value={value}
        disabled={!simulatePressure}
        aria-invalid={simulatePressure && !percentValid(value) ? true : undefined}
        onChange={(event) => set(event.target.value)}
      />
    </label>
  );
  return (
    <dialog ref={dialog} className="editor-dialog stroke-path-dialog" aria-labelledby="stroke-path-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <h2 id="stroke-path-title">Stroke Path with Brush</h2>
        <p>
          Paints the current brush settings along the path&apos;s curves onto a raster layer, inside any active
          selection, as one undoable step. Simulated pressure is a bounded local approximation of pen tapering.
        </p>
        <label>
          <span>Tool</span>
          <select aria-label="Stroke tool" value={tool} onChange={(event) => setTool(event.target.value as StrokePathSettings['tool'])}>
            {STROKE_PATH_TOOLS.map((item) => <option key={item} value={item}>{STROKE_PATH_TOOL_LABELS[item]}</option>)}
          </select>
        </label>
        <label>
          <span>Path</span>
          <select
            aria-label="Path to stroke"
            value={scope === 'all' ? '__all__' : pathLayerId}
            onChange={(event) => {
              if (event.target.value === '__all__') setScope('all');
              else { setScope('selected'); setPathLayerId(event.target.value); }
            }}
          >
            {paths.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            {paths.length > 1 && <option value="__all__">All visible path layers</option>}
          </select>
        </label>
        <label>
          <span>Paint onto</span>
          <select aria-label="Stroke target layer" value={targetLayerId} onChange={(event) => setTargetLayerId(event.target.value)}>
            {targets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="stroke-path-check">
          <input aria-label="Simulate pressure" type="checkbox" checked={simulatePressure} onChange={(event) => setSimulatePressure(event.target.checked)} />
          <span>Simulate pressure</span>
        </label>
        <div className="stroke-path-grid">
          {percentField('Taper start', taperStart, setTaperStart)}
          {percentField('Taper end', taperEnd, setTaperEnd)}
          {percentField('Minimum size', minSize, setMinSize)}
        </div>
        <fieldset className="stroke-path-affects" disabled={!simulatePressure}>
          <legend>Pressure controls</legend>
          <label className="stroke-path-check">
            <input aria-label="Pressure controls size" type="checkbox" checked={pressureSize} onChange={(event) => setPressureSize(event.target.checked)} />
            <span>Size</span>
          </label>
          <label className="stroke-path-check">
            <input aria-label="Pressure controls opacity" type="checkbox" checked={pressureOpacity} onChange={(event) => setPressureOpacity(event.target.checked)} />
            <span>{tool === 'smudge' ? 'Strength' : 'Opacity'}</span>
          </label>
        </fieldset>
        {!targets.length && <p role="alert" className="resize-error">Add or unlock a visible paint layer to stroke onto.</p>}
        {!numbersValid && <p role="alert" className="resize-error">Enter whole percentages from 0 to 100.</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit" disabled={!valid}>Stroke path</button>
        </div>
      </form>
    </dialog>
  );
}
