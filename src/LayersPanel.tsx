import { useState, type ReactNode } from 'react';
import {
  BLENDS,
  FONTS,
  TEXT_ALIGNS,
  TEXT_ORIENTATIONS,
  type Frame,
  type Group,
  type Layer,
  type SelectionOperation,
} from './document';
import type { ParametricShapeVariant } from './vectorShapes';
import type { AlignmentMode, DistributionAxis } from './layerAlignment';
import { effectiveLayerStyles, type LayerStyles } from './layerStyles';

type Props = {
  frame: Frame;
  select: (id: string) => void;
  edit: (patch: Partial<Layer>) => void;
  add: () => void;
  duplicate: () => void;
  remove: () => void;
  reorder: (direction: number) => void;
  groupActive: () => void;
  ungroupActive: () => void;
  editGroup: (id: string, patch: Partial<Group>) => void;
  align: (mode: AlignmentMode) => void;
  distribute: (axis: DistributionAxis) => void;
  rasterize: () => void;
  importImage: () => void;
  createMask: () => void;
  invertMask: () => void;
  toggleMask: () => void;
  clearMask: () => void;
  clearSelection: () => void;
  invertSelection: () => void;
  selectionOperation: SelectionOperation;
  setSelectionOperation: (operation: SelectionOperation) => void;
  setSelectionFeather: (feather: number) => void;
};
export default function LayersPanel({
  frame,
  select,
  edit,
  add,
  duplicate,
  remove,
  reorder,
  groupActive,
  ungroupActive,
  editGroup,
  align,
  distribute,
  rasterize,
  importImage,
  createMask,
  invertMask,
  toggleMask,
  clearMask,
  clearSelection,
  invertSelection,
  selectionOperation,
  setSelectionOperation,
  setSelectionFeather,
}: Props) {
  const layer = frame.layers.find((item) => item.id === frame.active)!;
  const groups = frame.groups || [];
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const activeGroup = layer.groupId ? groupById.get(layer.groupId) : undefined;
  const layerLocked = layer.locked || Boolean(activeGroup?.locked);
  const styles = effectiveLayerStyles(layer.styles);
  const updateStyles = (patch: Partial<LayerStyles>) =>
    edit({ styles: { ...styles, ...patch } });
  const updateDropShadow = (
    patch: Partial<LayerStyles['dropShadow']>,
  ) => updateStyles({ dropShadow: { ...styles.dropShadow, ...patch } });
  const updateOutline = (patch: Partial<LayerStyles['outline']>) =>
    updateStyles({ outline: { ...styles.outline, ...patch } });
  const distributableCount = activeGroup
    ? frame.layers.filter((item) => item.groupId === activeGroup.id && item.visible && !item.locked).length
    : 0;
  const renderedGroups = new Set<string>();
  const rows: ReactNode[] = [];
  for (const item of [...frame.layers].reverse()) {
    const group = item.groupId ? groupById.get(item.groupId) : undefined;
    if (group && !renderedGroups.has(group.id)) {
      rows.push(
        <GroupRow
          key={'group-' + group.id}
          group={group}
          editGroup={editGroup}
          selected={activeGroup?.id === group.id}
        />,
      );
      renderedGroups.add(group.id);
    }
    if (!group || !group.collapsed) {
      rows.push(
        <button
          key={item.id}
          className={item.id === layer.id ? 'layer-row selected' : 'layer-row'}
          onClick={() => select(item.id)}
          aria-pressed={item.id === layer.id}
          aria-label={`Select layer ${item.name}`}
        >
          <span className="layer-type">
            {item.kind === 'text'
              ? 'T'
              : item.kind === 'raster'
                ? '▧'
                : item.kind === 'line'
                  ? '╱'
                  : item.kind === 'polygon'
                    ? '⬠'
                    : item.kind === 'path'
                      ? '⌁'
                      : '□'}
          </span>
          <span>
            <b>{item.name || 'Untitled layer'}</b>
            <small>
              {item.kind} {item.locked || group?.locked ? '· locked' : ''}{' '}
              {!item.visible || group?.visible === false ? '· hidden' : ''}
              {group ? ` · ${group.name}` : ''}
            </small>
          </span>
        </button>,
      );
    }
  }
  for (const group of groups) {
    if (renderedGroups.has(group.id)) continue;
    rows.unshift(
      <GroupRow
        key={'group-' + group.id}
        group={group}
        editGroup={editGroup}
        selected={activeGroup?.id === group.id}
      />,
    );
  }
  return (
    <section className="panel layers-panel" aria-label="Layers">
      <h3>
        Layers <small>{frame.layers.length} / 32</small>
      </h3>
      <div className="layer-actions">
        <button onClick={add} disabled={frame.layers.length >= 32}>
          Add paint layer
        </button>
        <button onClick={importImage} disabled={frame.layers.length >= 32}>
          Add image layer
        </button>
        <button onClick={groupActive} disabled={Boolean(layer.groupId)}>
          Group active layer
        </button>
        <button
          onClick={ungroupActive}
          disabled={!layer.groupId || Boolean(activeGroup?.locked)}
        >
          Ungroup active layer
        </button>
      </div>
      <div className="layer-list">{rows}</div>
      <label className="layer-field">
        Layer folder
        <select
          aria-label="Layer folder"
          value={layer.groupId || ''}
          disabled={layerLocked}
          onChange={(event) => edit({ groupId: event.target.value || undefined })}
        >
          <option value="">No folder</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id} disabled={group.locked}>
              {group.name || 'Untitled group'}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="layer-alignment" disabled={layerLocked}>
        <legend>Align to canvas</legend>
        <div className="layer-actions">
          <button onClick={() => align('left')}>Align left</button>
          <button onClick={() => align('center-horizontal')}>Align horizontal center</button>
          <button onClick={() => align('right')}>Align right</button>
          <button onClick={() => align('top')}>Align top</button>
          <button onClick={() => align('center-vertical')}>Align vertical center</button>
          <button onClick={() => align('bottom')}>Align bottom</button>
        </div>
      </fieldset>
      <fieldset
        className="layer-alignment"
        disabled={!activeGroup || activeGroup.locked || !activeGroup.visible || distributableCount < 3}
      >
        <legend>Distribute folder layers</legend>
        <div className="layer-actions">
          <button onClick={() => distribute('horizontal')}>Distribute horizontally</button>
          <button onClick={() => distribute('vertical')}>Distribute vertically</button>
        </div>
        <p>Evenly space the centers of visible unlocked layers; outer layers stay fixed.</p>
      </fieldset>
      <div className="layer-toggles">
        <label>
          <input
            type="checkbox"
            checked={layer.visible}
            disabled={Boolean(activeGroup?.locked)}
            onChange={(e) => edit({ visible: e.target.checked })}
          />
          Visible
        </label>
        {frame.selection && (
          <label className="layer-field">
            Feather {Math.round(frame.selection.feather)} px
            <input
              aria-label="Selection feather"
              type="range"
              min="0"
              max="100"
              value={frame.selection.feather}
              onChange={(e) => setSelectionFeather(Number(e.target.value))}
            />
          </label>
        )}
        <label>
          <input
            type="checkbox"
            checked={layer.locked}
            disabled={Boolean(activeGroup?.locked)}
            onChange={(e) => edit({ locked: e.target.checked })}
          />
          Lock layer
        </label>
      </div>
      <div className="layer-actions">
        <label className="layer-field">
          Selection mode
          <select
            aria-label="Selection mode"
            value={selectionOperation}
            onChange={(e) =>
              setSelectionOperation(e.target.value as SelectionOperation)
            }
          >
            <option value="replace">Replace</option>
            <option value="add">Add</option>
            <option value="subtract">Subtract</option>
            <option value="intersect">Intersect</option>
          </select>
        </label>
        <button
          onClick={createMask}
          disabled={
            layer.kind !== 'raster' ||
            !frame.selection ||
            layerLocked ||
            !layer.visible
          }
        >
          Mask from selection
        </button>
        <button
          onClick={clearMask}
          disabled={
            layer.kind !== 'raster' ||
            !layer.mask ||
            layerLocked ||
            !layer.visible
          }
        >
          Remove mask
        </button>
        <button
          onClick={invertMask}
          disabled={
            layer.kind !== 'raster' ||
            !layer.mask ||
            layerLocked ||
            !layer.visible
          }
        >
          {layer.maskInverted ? 'Uninvert mask' : 'Invert mask'}
        </button>
        <button
          onClick={toggleMask}
          disabled={
            layer.kind !== 'raster' ||
            !layer.mask ||
            layerLocked ||
            !layer.visible
          }
        >
          {layer.maskEnabled === false ? 'Enable mask' : 'Disable mask'}
        </button>
        <button onClick={invertSelection} disabled={!frame.selection}>
          Invert selection
        </button>
        <button onClick={clearSelection} disabled={!frame.selection}>
          Clear selection
        </button>
      </div>
      {layer.kind === 'raster' && layer.mask && (
        <p className="mask-status">Nondestructive mask active</p>
      )}
      <label className="layer-field">
        Layer name
        <input
          aria-label="Layer name"
          maxLength={160}
          value={layer.name}
          disabled={layerLocked}
          onChange={(e) => edit({ name: e.target.value })}
        />
      </label>
      <label className="layer-field">
        Opacity {Math.round(layer.opacity * 100)}%
        <input
          aria-label="Layer opacity"
          type="range"
          min="0"
          max="100"
          value={Math.round(layer.opacity * 100)}
          disabled={layerLocked}
          onChange={(e) => edit({ opacity: Number(e.target.value) / 100 })}
        />
      </label>
      <label className="layer-field">
        Blend mode
        <select
          aria-label="Blend mode"
          value={layer.blend}
          disabled={layerLocked}
          onChange={(e) => edit({ blend: e.target.value as Layer['blend'] })}
        >
          {BLENDS.map((blend) => (
            <option key={blend} value={blend}>
              {blend === 'source-over'
                ? 'Normal'
                : blend[0].toUpperCase() + blend.slice(1)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="layer-alignment" disabled={layerLocked}>
        <legend>Layer styles</legend>
        <label>
          <input
            type="checkbox"
            aria-label="Enable drop shadow"
            checked={styles.dropShadow.enabled}
            onChange={(event) =>
              updateDropShadow({ enabled: event.target.checked })
            }
          />
          Drop shadow
        </label>
        <label className="layer-field">
          Shadow color
          <input
            aria-label="Drop shadow color"
            type="color"
            value={styles.dropShadow.color}
            onChange={(event) => updateDropShadow({ color: event.target.value })}
          />
        </label>
        <label className="layer-field">
          Shadow opacity {Math.round(styles.dropShadow.opacity * 100)}%
          <input
            aria-label="Drop shadow opacity"
            type="range"
            min="0"
            max="100"
            value={Math.round(styles.dropShadow.opacity * 100)}
            onChange={(event) =>
              updateDropShadow({ opacity: Number(event.target.value) / 100 })
            }
          />
        </label>
        <div className="layer-position">
          <NumberField
            label="Shadow X"
            value={styles.dropShadow.offsetX}
            min={-256}
            max={256}
            disabled={layerLocked}
            apply={(value) => updateDropShadow({ offsetX: value })}
          />
          <NumberField
            label="Shadow Y"
            value={styles.dropShadow.offsetY}
            min={-256}
            max={256}
            disabled={layerLocked}
            apply={(value) => updateDropShadow({ offsetY: value })}
          />
        </div>
        <label className="layer-field">
          Shadow blur {Math.round(styles.dropShadow.blur)} px
          <input
            aria-label="Drop shadow blur"
            type="range"
            min="0"
            max="64"
            value={Math.round(styles.dropShadow.blur)}
            onChange={(event) =>
              updateDropShadow({ blur: Number(event.target.value) })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            aria-label="Enable outline"
            checked={styles.outline.enabled}
            onChange={(event) =>
              updateOutline({ enabled: event.target.checked })
            }
          />
          Outline
        </label>
        <label className="layer-field">
          Outline color
          <input
            aria-label="Outline color"
            type="color"
            value={styles.outline.color}
            onChange={(event) => updateOutline({ color: event.target.value })}
          />
        </label>
        <label className="layer-field">
          Outline opacity {Math.round(styles.outline.opacity * 100)}%
          <input
            aria-label="Outline opacity"
            type="range"
            min="0"
            max="100"
            value={Math.round(styles.outline.opacity * 100)}
            onChange={(event) =>
              updateOutline({ opacity: Number(event.target.value) / 100 })
            }
          />
        </label>
        <label className="layer-field">
          Outline width {Math.round(styles.outline.width)} px
          <input
            aria-label="Outline width"
            type="range"
            min="1"
            max="32"
            value={Math.round(styles.outline.width)}
            onChange={(event) =>
              updateOutline({ width: Number(event.target.value) })
            }
          />
        </label>
      </fieldset>
      <div className="layer-position">
        <NumberField
          key={layer.id + 'x' + layer.matrix[4]}
          label="Layer X"
          value={layer.matrix[4]}
          min={-32000}
          max={32000}
          disabled={layerLocked}
          apply={(x) =>
            edit({
              matrix: [
                ...layer.matrix.slice(0, 4),
                x,
                layer.matrix[5],
              ] as Layer['matrix'],
            })
          }
        />
        <NumberField
          key={layer.id + 'y' + layer.matrix[5]}
          label="Layer Y"
          value={layer.matrix[5]}
          min={-32000}
          max={32000}
          disabled={layerLocked}
          apply={(y) =>
            edit({
              matrix: [...layer.matrix.slice(0, 5), y] as Layer['matrix'],
            })
          }
        />
      </div>
      {layer.kind === 'text' && (
        <div className="layer-typography">
          <label className="layer-field">
            Editable text
            <textarea
              aria-label="Edit layer text"
              maxLength={10000}
              value={layer.text}
              disabled={layerLocked}
              onChange={(e) => edit({ text: e.target.value })}
            />
          </label>
          <label className="layer-field">
            Typeface
            <select
              aria-label="Layer font"
              value={layer.fontFamily}
              disabled={layerLocked}
              onChange={(e) =>
                edit({ fontFamily: e.target.value as (typeof FONTS)[number] })
              }
            >
              {FONTS.map((font) => (
                <option key={font}>{font}</option>
              ))}
            </select>
          </label>
          <label className="layer-field">
            Text orientation
            <select
              aria-label="Text orientation"
              value={layer.orientation ?? 'horizontal'}
              disabled={layerLocked}
              onChange={(e) =>
                edit({
                  orientation: e.target.value as (typeof TEXT_ORIENTATIONS)[number],
                })
              }
            >
              {TEXT_ORIENTATIONS.map((orientation) => (
                <option key={orientation} value={orientation}>
                  {orientation[0].toUpperCase() + orientation.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            key={layer.id + layer.fontSize}
            label="Layer font size"
            value={layer.fontSize}
            min={1}
            max={1000}
            disabled={layerLocked}
            apply={(fontSize) => edit({ fontSize })}
          />
          <label className="layer-field">
            Text alignment
            <select
              aria-label="Text alignment"
              value={layer.textAlign ?? 'left'}
              disabled={layerLocked}
              onChange={(e) =>
                edit({
                  textAlign: e.target.value as (typeof TEXT_ALIGNS)[number],
                })
              }
            >
              {TEXT_ALIGNS.map((align) => (
                <option key={align} value={align}>
                  {align[0].toUpperCase() + align.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            key={layer.id + 'box' + layer.boxWidth}
            label="Text box width"
            value={layer.boxWidth ?? frame.w}
            min={1}
            max={16000}
            disabled={layerLocked}
            apply={(boxWidth) => edit({ boxWidth })}
          />
          <NumberField
            key={layer.id + 'line-height' + layer.lineHeight}
            label="Line height"
            value={layer.lineHeight ?? 1.2}
            min={0.5}
            max={4}
            disabled={layerLocked}
            apply={(lineHeight) => edit({ lineHeight })}
          />
          <NumberField
            key={layer.id + 'letter-spacing' + layer.letterSpacing}
            label="Letter spacing"
            value={layer.letterSpacing ?? 0}
            min={-100}
            max={100}
            disabled={layerLocked}
            apply={(letterSpacing) => edit({ letterSpacing })}
          />
          <label>
            <input
              type="checkbox"
              checked={layer.bold}
              disabled={layerLocked}
              onChange={(e) => edit({ bold: e.target.checked })}
            />
            Bold
          </label>
          <label className="layer-field">
            Text color
            <input
              type="color"
              aria-label="Layer text color"
              value={layer.color}
              disabled={layerLocked}
              onChange={(e) => edit({ color: e.target.value })}
            />
          </label>
        </div>
      )}
      {(layer.kind === 'rectangle' ||
        layer.kind === 'ellipse' ||
        layer.kind === 'polygon') && (
        <div className="layer-position">
          <NumberField
            key={layer.id + layer.width}
            label="Shape width"
            value={layer.width}
            min={1}
            max={16000}
            disabled={layerLocked}
            apply={(width) => edit({ width })}
          />
          <NumberField
            key={layer.id + layer.height}
            label="Shape height"
            value={layer.height}
            min={1}
            max={16000}
            disabled={layerLocked}
            apply={(height) => edit({ height })}
          />
          <label>
            <input
              type="checkbox"
              checked={layer.fill}
              disabled={layerLocked}
              onChange={(e) => edit({ fill: e.target.checked })}
            />
            Filled shape
          </label>
          <input
            type="color"
            aria-label="Shape color"
            value={layer.color}
            disabled={layerLocked}
            onChange={(e) => edit({ color: e.target.value })}
          />
          {layer.kind === 'polygon' && (
            <>
              <label className="layer-field">
                Shape type
                <select
                  aria-label="Shape type"
                  value={layer.variant ?? 'polygon'}
                  disabled={layerLocked}
                  onChange={(event) =>
                    edit({ variant: event.target.value as ParametricShapeVariant })
                  }
                >
                  <option value="polygon">Polygon</option>
                  <option value="triangle">Triangle</option>
                  <option value="star">Star</option>
                </select>
              </label>
              <NumberField
                key={layer.id + layer.sides}
                label="Polygon sides"
                value={layer.sides}
                min={3}
                max={32}
                disabled={layerLocked}
                apply={(sides) => edit({ sides })}
              />
            </>
          )}
        </div>
      )}
      {layer.kind === 'line' && (
        <div className="layer-position">
          <NumberField
            key={layer.id + layer.width}
            label="Line length"
            value={layer.width}
            min={1}
            max={16000}
            disabled={layerLocked}
            apply={(width) => edit({ width })}
          />
          <NumberField
            key={layer.id + layer.height}
            label="Line rise"
            value={layer.height}
            min={1}
            max={16000}
            disabled={layerLocked}
            apply={(height) => edit({ height })}
          />
          <input
            type="color"
            aria-label="Line color"
            value={layer.color}
            disabled={layerLocked}
            onChange={(e) => edit({ color: e.target.value })}
          />
        </div>
      )}
      {layer.kind === 'path' && (
        <div className="layer-position path-fields">
          <label>
            <input
              type="checkbox"
              checked={layer.path.closed}
              disabled={layerLocked}
              onChange={(e) =>
                edit({ path: { ...layer.path, closed: e.target.checked } })
              }
            />
            Closed path
          </label>
          <label>
            <input
              type="checkbox"
              checked={layer.path.fill}
              disabled={layerLocked}
              onChange={(e) =>
                edit({ path: { ...layer.path, fill: e.target.checked } })
              }
            />
            Fill
          </label>
          <label>
            <input
              type="checkbox"
              checked={layer.path.stroke}
              disabled={layerLocked}
              onChange={(e) =>
                edit({ path: { ...layer.path, stroke: e.target.checked } })
              }
            />
            Stroke
          </label>
          <NumberField
            key={layer.id + '-path-stroke-' + layer.path.strokeWidth}
            label="Path stroke width"
            value={layer.path.strokeWidth}
            min={0}
            max={10000}
            disabled={layerLocked}
            apply={(strokeWidth) =>
              edit({ path: { ...layer.path, strokeWidth } })
            }
          />
          <label className="layer-field">
            Fill color
            <input
              type="color"
              aria-label="Path fill color"
              value={layer.path.fillColor.slice(0, 7)}
              disabled={layerLocked}
              onChange={(e) =>
                edit({ path: { ...layer.path, fillColor: e.target.value } })
              }
            />
          </label>
          <label className="layer-field">
            Stroke color
            <input
              type="color"
              aria-label="Path stroke color"
              value={layer.path.strokeColor.slice(0, 7)}
              disabled={layerLocked}
              onChange={(e) =>
                edit({ path: { ...layer.path, strokeColor: e.target.value } })
              }
            />
          </label>
          <small>
            {layer.path.nodes.length} node
            {layer.path.nodes.length === 1 ? '' : 's'} · direct-select to move
            nodes
          </small>
        </div>
      )}
      <div className="layer-actions">
        <button
          onClick={() => reorder(1)}
          disabled={layerLocked || frame.layers.at(-1)?.id === layer.id}
        >
          Raise layer
        </button>
        <button
          onClick={() => reorder(-1)}
          disabled={layerLocked || frame.layers[0].id === layer.id}
        >
          Lower layer
        </button>
        <button onClick={duplicate} disabled={frame.layers.length >= 32}>
          Duplicate layer
        </button>
        <button
          onClick={remove}
          disabled={layerLocked || frame.layers.length === 1}
        >
          Delete layer
        </button>
        {layer.kind !== 'raster' && (
          <button onClick={rasterize} disabled={layerLocked}>
            Rasterize layer
          </button>
        )}
      </div>
      <p>
        Edits affect the selected layer. Deleting and rasterizing can be undone.
      </p>
    </section>
  );
}
function GroupRow({
  group,
  editGroup,
  selected,
}: {
  group: Group;
  editGroup: (id: string, patch: Partial<Group>) => void;
  selected: boolean;
}) {
  const action = group.collapsed ? 'Expand' : 'Collapse';
  return (
    <div className={selected ? 'group-row selected' : 'group-row'}>
      <button
        className="group-toggle"
        aria-label={`${action} group ${group.name}`}
        aria-expanded={!group.collapsed}
        onClick={() => editGroup(group.id, { collapsed: !group.collapsed })}
      >
        <span aria-hidden="true">{group.collapsed ? '▸' : '▾'}</span>
        <b>{group.name || 'Untitled group'}</b>
      </button>
      <label className="group-visibility">
        <input
          type="checkbox"
          aria-label={`Visible group ${group.name}`}
          checked={group.visible}
          onChange={(event) =>
            editGroup(group.id, { visible: event.target.checked })
          }
        />
        <span className="sr-only">Visible</span>
      </label>
      <label className="group-visibility">
        <input
          type="checkbox"
          aria-label={`Lock group ${group.name}`}
          checked={group.locked}
          onChange={(event) =>
            editGroup(group.id, { locked: event.target.checked })
          }
        />
        <span className="sr-only">Locked</span>
      </label>
      <label className="group-field">
        <span className="sr-only">Group name</span>
        <input
          aria-label={`Group name ${group.name}`}
          maxLength={160}
          value={group.name}
          disabled={group.locked}
          onChange={(event) =>
            editGroup(group.id, { name: event.target.value })
          }
        />
      </label>
      <label className="group-opacity">
        <span className="sr-only">Group opacity</span>
        <input
          type="range"
          aria-label={`Group opacity ${group.name}`}
          min="0"
          max="100"
          value={Math.round(group.opacity * 100)}
          disabled={group.locked}
          onChange={(event) =>
            editGroup(group.id, { opacity: Number(event.target.value) / 100 })
          }
        />
      </label>
      <label className="group-blend">
        Group blend
        <select
          aria-label={`Group blend mode ${group.name}`}
          value={group.blend}
          disabled={group.locked}
          onChange={(event) =>
            editGroup(group.id, { blend: event.target.value as Group['blend'] })
          }
        >
          {BLENDS.map((blend) => (
            <option key={blend} value={blend}>
              {blend === 'source-over'
                ? 'Normal'
                : blend[0].toUpperCase() + blend.slice(1)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
function NumberField({
  label,
  value,
  min,
  max,
  disabled,
  apply,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  apply: (v: number) => void;
}) {
  const [input, setInput] = useState(String(Math.round(value * 100) / 100));
  const commit = () => {
    const n = Number(input);
    if (input.trim() && Number.isFinite(n) && n >= min && n <= max) apply(n);
    else setInput(String(value));
  };
  return (
    <label className="layer-field">
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step="any"
        value={input}
        disabled={disabled}
        onChange={(e) => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    </label>
  );
}
