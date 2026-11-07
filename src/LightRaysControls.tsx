import type { FilterEffects } from './filterEffects';
import {
  DEFAULT_LIGHT_RAYS_SETTINGS,
  DEFAULT_STARBURST_PATCH,
  LIGHT_RAYS_LIMITS,
  normalizeLightRaysSettings,
  type LightRaysSettings,
} from './lightRays';

/**
 * Starting parameters for a new Render → Light Rays effect. Spread last into
 * a new filter record so it overrides the generic amount/radius defaults.
 */
export function lightRaysEffectDefaults(): Partial<FilterEffects> {
  return {
    amount: 100,
    radius: 1,
    angle: 0,
    centerX: 0.5,
    centerY: 0.5,
    lightRays: { ...DEFAULT_LIGHT_RAYS_SETTINGS },
  };
}

function Range({ label, value, min, max, step = 1, suffix = '', change }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  change: (value: number) => void;
}) {
  return (
    <label className="slider">
      <span>
        <b>{label}</b>
        <output>{value}{suffix}</output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => change(Number(event.target.value))}
      />
    </label>
  );
}

/** Editable Light Rays parameters for the Filter effects panel. */
export default function LightRaysControls({ effect, change }: {
  effect: FilterEffects;
  change: (patch: Partial<FilterEffects>) => void;
}) {
  const settings = normalizeLightRaysSettings(effect.lightRays);
  const update = (patch: Partial<LightRaysSettings>) =>
    change({ lightRays: normalizeLightRaysSettings({ ...settings, ...patch }) });
  const range = (key: keyof typeof LIGHT_RAYS_LIMITS, label: string, suffix = '', step = 1) => (
    <Range
      label={label}
      value={settings[key]}
      min={LIGHT_RAYS_LIMITS[key][0]}
      max={LIGHT_RAYS_LIMITS[key][1]}
      step={step}
      suffix={suffix}
      change={(value) => update({ [key]: value } as Partial<LightRaysSettings>)}
    />
  );
  const source = settings.mode === 'source';
  return (
    <fieldset className="light-rays-controls" data-testid="light-rays-controls">
      <legend>Light rays</legend>
      <label>
        Light source
        <select
          className="text-input"
          aria-label="Light source"
          value={settings.mode}
          onChange={(event) => update({ mode: event.target.value === 'source' ? 'source' : 'generate' })}
        >
          <option value="generate">Generate rays</option>
          <option value="source">Streak bright pixels</option>
        </select>
      </label>
      {!source && (
        <label>
          Ray shape
          <select
            className="text-input"
            aria-label="Ray shape"
            value={settings.shape}
            onChange={(event) =>
              update(event.target.value === 'starburst' ? DEFAULT_STARBURST_PATCH : { shape: 'rays' })}
          >
            <option value="rays">Rays</option>
            <option value="starburst">Starburst (sharp spikes)</option>
          </select>
        </label>
      )}
      {range('count', source ? 'Streak variation cells' : 'Ray count')}
      {range('length', source ? 'Streak length' : 'Ray length', '%')}
      {!source && range('width', 'Ray width', ' px', 0.5)}
      {!source && settings.shape === 'rays' && range('sharpness', 'Ray taper', '%')}
      {range('randomness', 'Ray randomness', '%')}
      {range('rotation', 'Ray rotation', '°')}
      {range('innerRadius', 'Inner radius', '%')}
      {range('falloff', 'Ray falloff', '%')}
      {range('intensity', 'Ray intensity', '%')}
      {source && range('threshold', 'Bright threshold')}
      <label>
        Ray colour
        <input
          type="color"
          aria-label="Ray colour"
          value={settings.color}
          onChange={(event) => update({ color: event.target.value })}
        />
      </label>
      <label>
        Ray blend
        <select
          className="text-input"
          aria-label="Ray blend"
          value={settings.blend}
          onChange={(event) => {
            const value = event.target.value;
            update({ blend: value === 'add' || value === 'transparent' ? value : 'screen' });
          }}
        >
          <option value="screen">Screen over the layer</option>
          <option value="add">Add over the layer</option>
          <option value="transparent">Render on transparent (fills empty pixels)</option>
        </select>
      </label>
      <label>
        Light rays seed
        <input
          className="number-input"
          type="number"
          min={0}
          max={0xffffffff}
          step={1}
          aria-label="Light rays seed"
          value={effect.seed}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (event.target.value !== '' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff)
              change({ seed: value });
          }}
        />
      </label>
      <p className="adjust-note">
        Lengths and the inner radius are percentages of half the layer&apos;s
        shorter side; width is in layer pixels. Rays start outside the inner
        radius, so a pupil or iris centre stays clear.
      </p>
    </fieldset>
  );
}
