import type { BlurPathPoint, FieldBlurPoint, FilterEffects, SpinBlurEllipse } from './filterEffects';

export const DEFAULT_BLUR_PATH: BlurPathPoint[] = [
  { x: 0.2, y: 0.6, speed: 100 },
  { x: 0.5, y: 0.35, speed: 100 },
  { x: 0.8, y: 0.6, speed: 100 },
];
export const DEFAULT_SPIN_ELLIPSE: SpinBlurEllipse = {
  radiusX: 0.8, radiusY: 0.8, rotation: 0, feather: 0.2,
};
export const DEFAULT_FIELD_POINTS: FieldBlurPoint[] = [
  { x: 0.5, y: 0.5, radius: 18 },
];

const copyPath = (path: BlurPathPoint[]) => path.map((point) => ({ ...point }));

function Range({ label, value, min = 0, max = 100, change }: {
  label: string; value: number; min?: number; max?: number; change: (value: number) => void;
}) {
  return <label className="blur-gallery-range"><span>{label}<output>{value}</output></span>
    <input type="range" aria-label={label} min={min} max={max} step={1}
      value={value} onChange={(event) => change(Number(event.target.value))} />
  </label>;
}

export default function BlurGalleryControls({ effect, change }: {
  effect: FilterEffects; change: (patch: Partial<FilterEffects>) => void;
}) {
  const path = effect.path ?? DEFAULT_BLUR_PATH;
  const pointPatch = (index: number, patch: Partial<BlurPathPoint>) => {
    change({ path: path.map((point, i) => i === index ? { ...point, ...patch } : { ...point }) });
  };
  if (effect.type === 'spin-blur') {
    const ellipse = effect.spinEllipse ?? DEFAULT_SPIN_ELLIPSE;
    const update = (patch: Partial<SpinBlurEllipse>) => change({ spinEllipse: { ...ellipse, ...patch } });
    return <fieldset className="blur-gallery-controls"><legend>Spin region</legend>
      <Range label="Spin horizontal radius" min={1} max={200} value={Math.round(ellipse.radiusX * 100)} change={(value) => update({ radiusX: value / 100 })} />
      <Range label="Spin vertical radius" min={1} max={200} value={Math.round(ellipse.radiusY * 100)} change={(value) => update({ radiusY: value / 100 })} />
      <Range label="Spin ellipse rotation" min={-180} max={180} value={Math.round(ellipse.rotation)} change={(value) => update({ rotation: value })} />
      <Range label="Spin feather" value={Math.round(ellipse.feather * 100)} change={(value) => update({ feather: value / 100 })} />
      <p>Radii are percentages of the image dimensions. Pixels outside the ellipse stay unchanged.</p>
    </fieldset>;
  }
  if (effect.type === 'field-blur') {
    const points = effect.fieldPoints?.length ? effect.fieldPoints : DEFAULT_FIELD_POINTS;
    const pointPatch = (index: number, patch: Partial<FieldBlurPoint>) => {
      change({ fieldPoints: points.map((point, i) => i === index ? { ...point, ...patch } : { ...point }) });
    };
    return <fieldset className="blur-gallery-controls"><legend>Field pins</legend>
      <p>Each pin sets a local blur radius. Pins are interpolated across the layer and remain editable in the project.</p>
      <svg className="blur-path-preview" viewBox="0 0 240 140" preserveAspectRatio="none" aria-label="Field blur pin preview">
        {points.map((point, index) => <g key={index}>
          <circle cx={point.x * 240} cy={point.y * 140} r="12" />
          <text x={point.x * 240} y={point.y * 140 + 4} textAnchor="middle">{index + 1}</text>
        </g>)}
      </svg>
      {points.map((point, index) => <div key={index} className="blur-path-point">
        <h4>Pin {index + 1}</h4>
        <Range label={`Field pin ${index + 1} X`} value={Math.round(point.x * 100)} change={(value) => pointPatch(index, { x: value / 100 })} />
        <Range label={`Field pin ${index + 1} Y`} value={Math.round(point.y * 100)} change={(value) => pointPatch(index, { y: value / 100 })} />
        <Range label={`Field pin ${index + 1} radius`} min={0} max={64} value={Math.round(point.radius)} change={(value) => pointPatch(index, { radius: value })} />
        <button type="button" disabled={points.length <= 1} aria-label={`Remove field pin ${index + 1}`}
          onClick={() => change({ fieldPoints: points.filter((_, i) => i !== index).map((item) => ({ ...item })) })}>Remove pin</button>
      </div>)}
      <button type="button" disabled={points.length >= 8} onClick={() => {
        const last = points.at(-1)!;
        change({ fieldPoints: [...points.map((point) => ({ ...point })), {
          x: Math.min(1, last.x + 0.12), y: last.y, radius: last.radius,
        }] });
      }}>Add field pin</button>
      <button type="button" onClick={() => change({ fieldPoints: DEFAULT_FIELD_POINTS.map((point) => ({ ...point })) })}>Reset field pins</button>
    </fieldset>;
  }
  if (effect.type !== 'path-blur') return null;
  return <fieldset className="blur-gallery-controls"><legend>Motion path</legend>
    <p>Shape the motion with the coordinate controls below. Each point controls local speed along the path.</p>
    <svg className="blur-path-preview" viewBox="0 0 240 140" preserveAspectRatio="none">
      <polyline points={path.map((point) => `${point.x * 240},${point.y * 140}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
      {path.map((point, index) => <g key={index}>
        <circle cx={point.x * 240} cy={point.y * 140} r="12" />
        <text x={point.x * 240} y={point.y * 140 + 4} textAnchor="middle">{index + 1}</text>
      </g>)}
    </svg>
    {path.map((point, index) => <div key={index} className="blur-path-point">
      <h4>Point {index + 1}</h4>
      <Range label={`Motion point ${index + 1} X`} value={Math.round(point.x * 100)} change={(value) => pointPatch(index, { x: value / 100 })} />
      <Range label={`Motion point ${index + 1} Y`} value={Math.round(point.y * 100)} change={(value) => pointPatch(index, { y: value / 100 })} />
      <Range label={`Motion point ${index + 1} speed`} value={Math.round(point.speed)} change={(value) => pointPatch(index, { speed: value })} />
      <button type="button" disabled={path.length <= 2} aria-label={`Remove motion point ${index + 1}`}
        onClick={() => change({ path: path.filter((_, i) => i !== index).map((point) => ({ ...point })) })}>Remove point</button>
    </div>)}
    <button type="button" disabled={path.length >= 8} onClick={() => {
      const previous = path.at(-2)!, last = path.at(-1)!;
      change({ path: [...path.slice(0, -1).map((point) => ({ ...point })), {
        x: (previous.x + last.x) / 2, y: (previous.y + last.y) / 2, speed: (previous.speed + last.speed) / 2,
      }, { ...last }] });
    }}>Add motion point</button>
    <button type="button" onClick={() => change({ path: copyPath(DEFAULT_BLUR_PATH) })}>Reset motion path</button>
  </fieldset>;
}
