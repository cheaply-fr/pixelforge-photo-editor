import type { CustomBrushPreset } from './customBrushPresets.ts';
import type { BuiltInBrushPreset } from './brushPresetLibrary.ts';

/**
 * Brush preset library controls for the Brush/Pencil options: one select with
 * built-in space-art presets and the presets saved on this device, plus Save,
 * Rename and Delete buttons. Rename/Delete only apply to saved presets.
 */
export function BrushPresetLibraryControls({
  builtIns,
  saved,
  selectedId,
  onSelect,
  onSave,
  onRename,
  onDelete,
}: {
  builtIns: readonly BuiltInBrushPreset[];
  saved: readonly CustomBrushPreset[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSave: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const editable = saved.some((preset) => preset.id === selectedId);
  return (
    <fieldset className="brush-preset-library" aria-label="Brush preset library">
      <label className="select-row">
        <span>Saved brush preset</span>
        <select aria-label="Saved brush preset" value={selectedId} onChange={(event) => onSelect(event.target.value)}>
          <option value="">Choose preset</option>
          <optgroup label="Space art">
            {builtIns.map((preset) => (
              <option key={preset.id} value={preset.id} title={preset.description}>
                {preset.label}
              </option>
            ))}
          </optgroup>
          {saved.length > 0 && (
            <optgroup label="Saved on this device">
              {saved.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <div className="brush-preset-actions">
        <button type="button" className="secondary" onClick={onSave}>
          Save brush preset
        </button>
        <button type="button" className="secondary" disabled={!editable} onClick={onRename}>
          Rename brush preset
        </button>
        <button type="button" className="secondary" disabled={!editable} onClick={onDelete}>
          Delete brush preset
        </button>
      </div>
    </fieldset>
  );
}
