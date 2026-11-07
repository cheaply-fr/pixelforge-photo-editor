import { Eye, EyeOff, Lock, LockOpen, ScanEye } from 'lucide-react';
import {
  REFERENCE_DISCLOSURE,
  REFERENCE_FITS,
  type ReferenceFit,
  type ReferenceImage,
} from './referenceImage';

type Props = {
  reference?: ReferenceImage;
  /** Stored reference dimensions, shown as a hint. */
  size?: { w: number; h: number };
  disabled?: boolean;
  choose: () => void;
  update: (patch: Partial<ReferenceImage>) => void;
  remove: () => void;
};

const FIT_LABELS: Record<ReferenceFit, string> = {
  contain: 'Fit inside canvas',
  cover: 'Fill canvas (crop)',
  stretch: 'Stretch to canvas',
};

/**
 * Inspector panel for the document's reference / guide image. The reference
 * is a workspace overlay, not a layer, so it lives beside the Layers panel
 * with its own icon and an explicit "not exported" disclosure.
 */
export default function ReferencePanel({ reference, size, disabled, choose, update, remove }: Props) {
  const locked = Boolean(reference?.locked);
  return (
    <section className="panel reference-panel" aria-label="Reference image" data-testid="reference-panel">
      <div className="panel-title">
        <span>
          <ScanEye aria-hidden="true" />
          Reference image
        </span>
        {reference && (
          <span className="reference-badge" data-testid="reference-not-exported">
            Not exported
          </span>
        )}
      </div>
      {!reference ? (
        <>
          <p className="reference-note">
            Place a guide image over the canvas for tracing or colour matching.
            It is not a layer: it is never exported, flattened or merged and does
            not count toward the layer pixel budget.
          </p>
          <button type="button" className="apply" onClick={choose} disabled={disabled}>
            Place reference image…
          </button>
        </>
      ) : (
        <>
          <div className="reference-row">
            <button
              type="button"
              aria-label={reference.visible ? 'Hide reference image' : 'Show reference image'}
              aria-pressed={reference.visible}
              onClick={() => update({ visible: !reference.visible })}
              disabled={disabled}
            >
              {reference.visible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            </button>
            <b title={reference.name} data-testid="reference-name">
              {reference.name}
            </b>
            <button
              type="button"
              aria-label={locked ? 'Unlock reference image' : 'Lock reference image'}
              aria-pressed={locked}
              onClick={() => update({ locked: !locked })}
              disabled={disabled}
            >
              {locked ? <Lock aria-hidden="true" /> : <LockOpen aria-hidden="true" />}
            </button>
          </div>
          {size && (
            <small className="reference-note">
              Stored at {size.w} × {size.h} px
            </small>
          )}
          <label className="slider">
            <span>
              <b>Reference opacity</b>
              <output>{Math.round(reference.opacity * 100)}%</output>
            </span>
            <input
              aria-label="Reference opacity"
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(reference.opacity * 100)}
              disabled={disabled || locked}
              onChange={(event) => update({ opacity: Number(event.target.value) / 100 })}
            />
          </label>
          <label className="reference-field">
            Placement
            <select
              aria-label="Reference placement"
              value={reference.fit}
              disabled={disabled || locked}
              onChange={(event) => update({ fit: event.target.value as ReferenceFit })}
            >
              {REFERENCE_FITS.map((fit) => (
                <option key={fit} value={fit}>
                  {FIT_LABELS[fit]}
                </option>
              ))}
            </select>
          </label>
          <label className="reference-check">
            <input
              type="checkbox"
              checked={reference.sample}
              disabled={disabled}
              onChange={(event) => update({ sample: event.target.checked })}
            />
            Eyedropper samples the reference
          </label>
          <div className="reference-actions">
            <button type="button" onClick={choose} disabled={disabled || locked}>
              Replace…
            </button>
            <button type="button" onClick={remove} disabled={disabled || locked}>
              Remove reference
            </button>
          </div>
          <p className="reference-note" data-testid="reference-disclosure">
            {REFERENCE_DISCLOSURE}
          </p>
        </>
      )}
    </section>
  );
}
