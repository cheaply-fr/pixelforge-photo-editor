import type { ComponentType } from 'react';
import {
  SMUDGE_MODES,
  SMUDGE_MODE_LABELS,
  SMUDGE_STRENGTH_MAX,
  SMUDGE_STRENGTH_MIN,
  normalizeSmudgeSettings,
  type SmudgeSettings,
} from './smudge';
import {
  BRUSH_COUNT_MAX,
  BRUSH_COUNT_MIN,
  BRUSH_SCATTER_MAX,
  normalizeBrushDynamics,
  type BrushDynamics,
} from './brushDynamics';

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  set: (value: number) => void;
  suffix?: string;
};

/**
 * Smudge tool options: Strength, Mode, Sample All Layers (optionally without
 * adjustment layers), Finger Painting, pressure mapping, and the shared tip
 * shape (angle, roundness), Scatter/Count/jitter, bristle and texture. Size
 * and Hardness are the shared brush controls rendered by the editor.
 */
export function SmudgeToolOptions({
  Slider,
  value,
  onChange,
  pressureSize,
  setPressureSize,
  angle,
  setAngle,
  roundness,
  setRoundness,
  scatter,
  setScatter,
  dynamics,
  setDynamics,
  bristle,
  setBristle,
  texture,
  setTexture,
}: {
  Slider: ComponentType<SliderProps>;
  value: SmudgeSettings;
  onChange: (next: SmudgeSettings) => void;
  pressureSize: boolean;
  setPressureSize: (value: boolean) => void;
  angle: number;
  setAngle: (value: number) => void;
  roundness: number;
  setRoundness: (value: number) => void;
  scatter: number;
  setScatter: (value: number) => void;
  dynamics: BrushDynamics;
  setDynamics: (update: (current: BrushDynamics) => BrushDynamics) => void;
  bristle: number;
  setBristle: (value: number) => void;
  texture: number;
  setTexture: (value: number) => void;
}) {
  const update = (patch: Partial<SmudgeSettings>) => onChange(normalizeSmudgeSettings({ ...value, ...patch }));
  const dynamic = (key: keyof BrushDynamics) => (next: number) =>
    setDynamics((current) => normalizeBrushDynamics({ ...current, [key]: next }));
  return (
    <fieldset className="smudge-options" data-testid="smudge-options" aria-label="Smudge options">
      <Slider
        label="Strength"
        value={value.strength}
        min={SMUDGE_STRENGTH_MIN}
        max={SMUDGE_STRENGTH_MAX}
        set={(strength) => update({ strength })}
        suffix="%"
      />
      <label className="select-row">
        <span>Mode</span>
        <select
          aria-label="Smudge mode"
          title="How the smudged colour is written over the existing pixels"
          value={value.mode}
          onChange={(event) => update({ mode: event.target.value as SmudgeSettings['mode'] })}
        >
          {SMUDGE_MODES.map((mode) => (
            <option key={mode} value={mode}>{SMUDGE_MODE_LABELS[mode]}</option>
          ))}
        </select>
      </label>
      <label className="check-row">
        <input
          aria-label="Sample all layers"
          type="checkbox"
          checked={value.sampleAllLayers}
          onChange={(event) => update({ sampleAllLayers: event.target.checked })}
        />
        Sample all layers
      </label>
      <label className="check-row">
        <input
          aria-label="Ignore adjustment layers"
          type="checkbox"
          disabled={!value.sampleAllLayers}
          checked={value.ignoreAdjustments}
          onChange={(event) => update({ ignoreAdjustments: event.target.checked })}
        />
        Ignore adjustment layers
      </label>
      <label className="check-row">
        <input
          aria-label="Finger painting"
          type="checkbox"
          checked={value.fingerPainting}
          onChange={(event) => update({ fingerPainting: event.target.checked })}
        />
        Finger painting
      </label>
      <label className="check-row">
        <input
          aria-label="Pressure affects size"
          type="checkbox"
          checked={pressureSize}
          onChange={(event) => setPressureSize(event.target.checked)}
        />
        Pressure affects size
      </label>
      <label className="check-row">
        <input
          aria-label="Pressure affects strength"
          type="checkbox"
          checked={value.pressureStrength}
          onChange={(event) => update({ pressureStrength: event.target.checked })}
        />
        Pressure affects strength
      </label>
      <Slider label="Angle" value={angle} min={-180} max={180} set={setAngle} suffix="°" />
      <Slider label="Roundness" value={roundness} min={1} max={100} set={setRoundness} suffix="%" />
      <Slider label="Scatter" value={scatter} min={0} max={BRUSH_SCATTER_MAX} set={setScatter} suffix="%" />
      <label className="check-row">
        <input
          aria-label="Scatter both axes"
          type="checkbox"
          checked={dynamics.scatterBothAxes}
          onChange={(event) => {
            const scatterBothAxes = event.target.checked;
            setDynamics((current) => ({ ...current, scatterBothAxes }));
          }}
        />
        Scatter both axes
      </label>
      <Slider label="Count" value={dynamics.count} min={BRUSH_COUNT_MIN} max={BRUSH_COUNT_MAX} set={dynamic('count')} suffix="" />
      <Slider label="Count jitter" value={dynamics.countJitter} min={0} max={100} set={dynamic('countJitter')} />
      <Slider label="Size jitter" value={dynamics.sizeJitter} min={0} max={100} set={dynamic('sizeJitter')} />
      <Slider label="Angle jitter" value={dynamics.angleJitter} min={0} max={100} set={dynamic('angleJitter')} />
      <Slider label="Strength jitter" value={dynamics.opacityJitter} min={0} max={100} set={dynamic('opacityJitter')} />
      <Slider label="Bristle" value={bristle} min={0} max={100} set={setBristle} suffix="%" />
      <Slider label="Texture" value={texture} min={0} max={100} set={setTexture} suffix="%" />
      <p className="adjust-note">
        Smudge picks up the pixels under the start of the stroke (or the
        foreground colour with Finger painting) and drags them; lower Strength
        fades the paint sooner, 100% drags it almost unchanged. Angle and
        Roundness shape non-round tips; Scatter, Count and jitter are
        deterministic, so a replayed stroke gives the same pixels. Sample all
        layers reads the visible image captured when the stroke starts and
        writes to the active layer. A bounded local approximation.
      </p>
    </fieldset>
  );
}
