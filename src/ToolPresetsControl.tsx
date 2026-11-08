import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Bookmark, ChevronDown, Copy, Download, Pencil, RefreshCw, RotateCcw, Trash2, Upload } from 'lucide-react';
import {
  filterToolPresets,
  PRESET_TOOL_LABELS,
  toolHasCategory,
  TOOL_PRESET_LABEL_MAX,
  TOOL_PRESET_LIMIT,
  type PresetTool,
  type ToolPreset,
  type ToolPresetInclude,
} from './toolPresets.ts';

export type ToolPresetsControlProps = {
  tool: PresetTool;
  presets: readonly ToolPreset[];
  /** Id of the preset last applied to the current tool, if any. */
  appliedId?: string;
  /** True when the current options differ from the applied preset. */
  modified: boolean;
  onApply: (preset: ToolPreset) => void;
  onSave: (label: string, include: ToolPresetInclude) => void;
  onRename: (id: string, label: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string) => void;
  onMove: (id: string, direction: -1 | 1, visibleIds: string[]) => void;
  onMoveTo: (id: string, targetId: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onResetTool: () => void;
  onResetAll: () => void;
};

/**
 * Tool presets control for the tool options area: a disclosure button that
 * opens an inline panel (so it fits narrow mobile inspectors) with search,
 * a per-tool / all-tools list, save, rename, duplicate, update, reorder
 * (drag, buttons or Alt+Arrow keys), import/export and the reset commands.
 */
export function ToolPresetsControl(props: ToolPresetsControlProps) {
  const { tool, presets, appliedId, modified } = props;
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [chosenId, setSelectedId] = useState<string>();
  const [renamingId, setRenamingId] = useState<string>();
  const [renameValue, setRenameValue] = useState('');
  const [name, setName] = useState('');
  const [includeColor, setIncludeColor] = useState(false);
  const [includeSize, setIncludeSize] = useState(true);
  const [dragId, setDragId] = useState<string>();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLFieldSetElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const toolLabel = PRESET_TOOL_LABELS[tool];
  const visible = filterToolPresets(presets, { tool: showAll ? null : tool, query });
  const visibleIds = visible.map((preset) => preset.id);
  // The focused/clicked preset, falling back to the applied one.
  const selected =
    presets.find((preset) => preset.id === chosenId) ?? presets.find((preset) => preset.id === appliedId);
  const selectedId = selected?.id;
  const renaming = renamingId && visibleIds.includes(renamingId) ? renamingId : undefined;
  const applied = presets.find((preset) => preset.id === appliedId);
  const hasColor = toolHasCategory(tool, 'color');
  const hasSize = toolHasCategory(tool, 'size');

  const close = () => {
    setOpen(false);
    setRenamingId(undefined);
    trigger.current?.focus();
  };

  // Escape cancels a rename, then closes the panel (native listener so the
  // editor's global Escape handling never sees it).
  useEffect(() => {
    const node = panel.current;
    if (!open || !node) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (renaming) setRenamingId(undefined);
      else {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, [open, renaming]);

  const onRowKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, preset: ToolPreset) => {
    if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') event.stopPropagation();
    const index = visibleIds.indexOf(preset.id);
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      props.onMove(preset.id, event.key === 'ArrowUp' ? -1 : 1, visibleIds);
      setSelectedId(preset.id);
      requestAnimationFrame(() =>
        panel.current?.querySelector<HTMLButtonElement>(`[data-preset-apply="${preset.id}"]`)?.focus(),
      );
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home' ? 0 : event.key === 'End' ? visibleIds.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1);
      const target = visibleIds[Math.max(0, Math.min(visibleIds.length - 1, next))];
      panel.current?.querySelector<HTMLButtonElement>(`[data-preset-apply="${target}"]`)?.focus();
      setSelectedId(target);
    }
  };

  const save = () => {
    const label = name.trim();
    if (!label) return;
    props.onSave(label, { includeColor: hasColor && includeColor, includeSize: hasSize && includeSize });
    setName('');
  };

  const commitRename = () => {
    if (!renaming) return;
    if (renameValue.trim()) props.onRename(renaming, renameValue);
    setRenamingId(undefined);
  };

  const status = applied
    ? `${applied.label}${modified ? ' (modified)' : ''}`
    : 'No preset applied';

  return (
    <section className="panel tool-presets-panel" data-testid="tool-presets" aria-label="Tool presets">
      <div className="tool-presets-bar">
        <button
          ref={trigger}
          type="button"
          className="tool-presets-trigger"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <Bookmark aria-hidden="true" />
          <span className="tool-presets-trigger-text">
            <b>Tool presets</b>
            <small data-testid="tool-preset-status">
              {toolLabel}: {status}
            </small>
          </span>
          {modified && (
            <span className="tool-presets-modified" data-testid="tool-preset-modified" title="Current options differ from the applied preset">
              Modified
            </span>
          )}
          <ChevronDown aria-hidden="true" className="tool-presets-chevron" />
        </button>
      </div>
      {open && (
        <fieldset ref={panel} id={panelId} className="tool-presets-popover" aria-label={`${toolLabel} tool presets`}>
          <div className="tool-presets-filters">
            <input
              type="search"
              className="text-input"
              aria-label="Search tool presets"
              placeholder="Search presets"
              value={query}
              maxLength={80}
              onChange={(event) => setQuery(event.target.value)}
            />
            <label className="check-row">
              <input
                type="checkbox"
                aria-label="Show presets for all tools"
                checked={showAll}
                onChange={(event) => setShowAll(event.target.checked)}
              />
              All tools
            </label>
          </div>
          {visible.length === 0 ? (
            <p className="tool-presets-empty" data-testid="tool-presets-empty">
              {presets.length === 0
                ? `No presets yet. Save the current ${toolLabel} options below.`
                : query.trim()
                  ? 'No presets match the search.'
                  : `No ${toolLabel} presets. Tick “All tools” to see the rest.`}
            </p>
          ) : (
            <ol className="tool-presets-list" aria-label="Saved tool presets">
              {visible.map((preset) => {
                const isApplied = preset.id === appliedId;
                const isSelected = preset.id === selectedId;
                return (
                  <li
                    key={preset.id}
                    data-preset-id={preset.id}
                    data-selected={isSelected || undefined}
                    data-dragging={dragId === preset.id || undefined}
                  >
                    {renaming === preset.id ? (
                      <form
                        className="tool-presets-rename"
                        onSubmit={(event) => {
                          event.preventDefault();
                          commitRename();
                        }}
                      >
                        <input
                          className="text-input"
                          aria-label="New preset name"
                          value={renameValue}
                          maxLength={TOOL_PRESET_LABEL_MAX}
                          ref={(node) => node?.focus()}
                          onChange={(event) => setRenameValue(event.target.value)}
                        />
                        <button type="submit" className="secondary" disabled={!renameValue.trim()}>
                          Save name
                        </button>
                        <button type="button" className="secondary" onClick={() => setRenamingId(undefined)}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="tool-presets-apply"
                        data-preset-apply={preset.id}
                        aria-current={isApplied ? 'true' : undefined}
                        aria-label={`Apply ${preset.label} (${PRESET_TOOL_LABELS[preset.tool]})${isApplied ? (modified ? ', applied, modified' : ', applied') : ''}`}
                        onFocus={() => setSelectedId(preset.id)}
                        onClick={() => {
                          setSelectedId(preset.id);
                          props.onApply(preset);
                        }}
                        onKeyDown={(event) => onRowKeyDown(event, preset)}
                        draggable
                        onDragStart={(event) => {
                          setDragId(preset.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', preset.id);
                        }}
                        onDragEnd={() => setDragId(undefined)}
                        onDragOver={(event) => {
                          if (dragId && dragId !== preset.id) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const source = dragId ?? event.dataTransfer.getData('text/plain');
                          if (source && source !== preset.id) props.onMoveTo(source, preset.id);
                          setDragId(undefined);
                        }}
                      >
                        <span className="tool-presets-name">{preset.label}</span>
                        <small>
                          {PRESET_TOOL_LABELS[preset.tool]}
                          {preset.includeColor ? ' · colour' : ''}
                          {preset.includeSize ? ' · size' : ''}
                          {isApplied ? (modified ? ' · modified' : ' · applied') : ''}
                        </small>
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div className="tool-presets-actions" role="toolbar" aria-label="Selected preset actions">
            <button
              type="button"
              aria-label="Update preset from current options"
              title="Update preset from current options"
              disabled={!selected || selected.tool !== tool}
              onClick={() => selected && props.onUpdate(selected.id)}
            >
              <RefreshCw aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Rename preset"
              title="Rename preset"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                setRenameValue(selected.label);
                setRenamingId(selected.id);
              }}
            >
              <Pencil aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Duplicate preset"
              title="Duplicate preset"
              disabled={!selected || presets.length >= TOOL_PRESET_LIMIT}
              onClick={() => selected && props.onDuplicate(selected.id)}
            >
              <Copy aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Move preset up"
              title="Move preset up (Alt+Up)"
              disabled={!selected || visibleIds.indexOf(selected.id) <= 0}
              onClick={() => selected && props.onMove(selected.id, -1, visibleIds)}
            >
              <ArrowUp aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Move preset down"
              title="Move preset down (Alt+Down)"
              disabled={!selected || visibleIds.indexOf(selected.id) < 0 || visibleIds.indexOf(selected.id) >= visibleIds.length - 1}
              onClick={() => selected && props.onMove(selected.id, 1, visibleIds)}
            >
              <ArrowDown aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Delete preset"
              title="Delete preset"
              disabled={!selected}
              onClick={() => selected && props.onDelete(selected.id)}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>
          <form
            className="tool-presets-save"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <label className="layer-field">
              Save current {toolLabel} options as
              <input
                className="text-input"
                aria-label="New tool preset name"
                placeholder={`${toolLabel} preset`}
                value={name}
                maxLength={TOOL_PRESET_LABEL_MAX}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="tool-presets-includes">
              <label className="check-row">
                <input
                  type="checkbox"
                  aria-label="Include colour"
                  checked={hasColor && includeColor}
                  disabled={!hasColor}
                  onChange={(event) => setIncludeColor(event.target.checked)}
                />
                Include colour
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  aria-label="Include brush size"
                  checked={hasSize && includeSize}
                  disabled={!hasSize}
                  onChange={(event) => setIncludeSize(event.target.checked)}
                />
                Include size
              </label>
            </div>
            <button type="submit" className="secondary" disabled={!name.trim() || presets.length >= TOOL_PRESET_LIMIT}>
              Save preset
            </button>
          </form>
          <div className="tool-presets-footer">
            <button type="button" className="secondary" onClick={() => importInput.current?.click()}>
              <Upload aria-hidden="true" /> Import…
            </button>
            <button type="button" className="secondary" disabled={presets.length === 0} onClick={props.onExport}>
              <Download aria-hidden="true" /> Export
            </button>
            <button type="button" className="secondary" onClick={props.onResetTool}>
              <RotateCcw aria-hidden="true" /> Reset Tool
            </button>
            <button type="button" className="secondary" onClick={props.onResetAll}>
              <RotateCcw aria-hidden="true" /> Reset All Tools
            </button>
            <input
              ref={importInput}
              type="file"
              accept="application/json,.json"
              aria-label="Import tool presets file"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) props.onImport(file);
              }}
            />
          </div>
          <p className="tool-presets-note">
            {presets.length}/{TOOL_PRESET_LIMIT} presets saved on this device. Options shared by related tools (size,
            hardness, opacity…) change for those tools too.
          </p>
        </fieldset>
      )}
    </section>
  );
}
