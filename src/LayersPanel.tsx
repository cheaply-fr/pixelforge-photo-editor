import {
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Contrast,
  Copy,
  Ellipsis,
  FilePlus2,
  FolderPlus,
  GripVertical,
  Link2,
  SquareDashed,
  Trash2,
  Unlink2,
} from 'lucide-react';
import FontFamilySelect from './FontFamilySelect';
import {
  TEXT_ALIGNS,
  TEXT_ORIENTATIONS,
  formatMegapixels,
  isMaskableLayer,
  isVectorMaskableLayer,
  type Frame,
  type Group,
  type Layer,
  type SelectionOperation,
} from './document';
import { SELECTION_FEATHER_STEP, formatSelectionFeather } from './selectionFeather';
import { MAX_DOCUMENT_LAYERS, detectProjectLimits } from './projectLimits';
import { CORNER_RADIUS_MAX, type ParametricShapeVariant } from './vectorShapes';
import { shapeOutlineColor } from './shapeAppearance';
import type { AlignmentMode, DistributionAxis } from './layerAlignment';
import {
  planLayerArrange,
  type LayerArrangeMode,
} from './layerArrange';
import {
  effectiveLayerStyles,
  GLOW_MAX_SIZE,
  INNER_SHADOW_MAX_DISTANCE,
  STYLE_MAX_BLUR,
  STYLE_MAX_OFFSET,
  type GlowSource,
  type LayerStyles,
  type ShadowFalloff,
} from './layerStyles';
import { BLEND_MODE_GROUPS, type LayerBlendMode } from './blendModes';
import { PATTERN_IDS, type PatternId } from './patternStamp';
import { normalizeOpenType } from './openType';
import { normalizeTextLanguage, TEXT_DIRECTIONS, TEXT_LANGUAGES } from './textLanguage';
import { filterLayersBySearch, groupMatchesSearch } from './layerSearch';
import {
  clippingCandidateBase,
  clippingGroupBase,
  isClippingSourceLayer,
} from './layerClipping';
import {
  describeFileDrop,
  describeLayerDrop,
  describeLayerMove,
  dropPositionFromPointer,
  layerDeleteNotice,
  layerDeleteReason,
  layerStackDescription,
  planLayerDelete,
  planLayerDrop,
  type LayerDragSource,
  type LayerDropTarget,
} from './layerDragReorder';

export type LayersPanelProps = Props;
type Props = {
  frame: Frame;
  /** Raster pixels stored by top-level layers (see layerPixelUsage). */
  pixelUsage?: number;
  select: (
    id: string,
    intent?: { additive?: boolean; range?: boolean },
  ) => void;
  selectAll: () => void;
  deselectLayers: () => void;
  isolateLayers: () => void;
  edit: (patch: Partial<Layer>) => void;
  add: () => void;
  addAdjustment: () => void;
  addSmartObject: () => void;
  nestSelectedAsSmartObject: () => void;
  replaceSmartObject: () => void;
  duplicate: () => void;
  /** Delete the selected layers (returns false when refused). */
  remove: () => boolean | void;
  reorder: (direction: number) => void;
  arrange: (mode: LayerArrangeMode) => boolean | void;
  /** Commit one drag-and-drop move; returns the moved IDs or false. */
  moveLayers?: (source: LayerDragSource, target: LayerDropTarget) => string[] | false;
  /** Replace the layer selection without a history step. */
  setLayerSelection?: (ids: readonly string[], activeId?: string) => void;
  /** Files dropped on the panel at a drop line. */
  dropFiles?: (files: File[], target: LayerDropTarget) => void;
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
  createVectorMask: () => void;
  invertVectorMask: () => void;
  toggleVectorMask: () => void;
  clearVectorMask: () => void;
  createClipping: () => void;
  releaseClipping: () => void;
  clearSelection: () => void;
  invertSelection: () => void;
  selectionOperation: SelectionOperation;
  setSelectionOperation: (operation: SelectionOperation) => void;
  setSelectionFeather: (feather: number) => void;
  /**
   * Which slice of the panel to render (docs/contextual-sidebar-contract.md):
   * `layers` (default) is the always-visible list plus the active layer's
   * essentials; `alignment` and `selection` are Move / selection tool
   * options; `details` and `styles` are on-demand panels.
   */
  part?: LayersPanelPart;
};
export type LayersPanelPart = 'layers' | 'alignment' | 'selection' | 'details' | 'styles';
/** One pointer gesture on a row: pending until it moves (mouse) or long-presses (touch). */
type DragSession = {
  pointerId: number;
  source: LayerDragSource;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  target?: LayerDropTarget;
  ok: boolean;
  end: (drop: boolean) => void;
};
type DropState = {
  target: LayerDropTarget;
  label: string;
  /** ok: a valid drop; idle: nothing would change; refused: locked. */
  state: 'ok' | 'idle' | 'refused';
  x: number;
  y: number;
};
type MenuState = { id: string; x: number; y: number; trigger: HTMLElement | null };
type RowMenuAction =
  | 'duplicate'
  | 'delete'
  | LayerArrangeMode
  | 'clip'
  | 'release-clip'
  | 'group'
  | 'rename'
  | 'visibility'
  | 'lock';

export default function LayersPanel({
  frame,
  pixelUsage,
  select,
  selectAll,
  deselectLayers,
  isolateLayers,
  edit,
  add,
  addAdjustment,
  addSmartObject,
  nestSelectedAsSmartObject,
  replaceSmartObject,
  duplicate,
  remove,
  reorder,
  arrange,
  moveLayers,
  setLayerSelection,
  dropFiles,
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
  createVectorMask,
  invertVectorMask,
  toggleVectorMask,
  clearVectorMask,
  createClipping,
  releaseClipping,
  clearSelection,
  invertSelection,
  selectionOperation,
  setSelectionOperation,
  setSelectionFeather,
  part = 'layers',
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const main = part === 'layers';
  // Drag-and-drop, keyboard reorder, delete and row menu state. See
  // docs/layers-panel-interaction-contract.md.
  const listRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(frame);
  const dragSession = useRef<DragSession | null>(null);
  const pendingMove = useRef<{ ids: string[]; focusId?: string } | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const suppressClick = useRef(false);
  const suppressTimer = useRef<number | undefined>(undefined);
  /** Swallow the click that follows a drag or long press. */
  const suppressClicksFor = (ms: number) => {
    suppressClick.current = true;
    window.clearTimeout(suppressTimer.current);
    suppressTimer.current = window.setTimeout(() => {
      suppressClick.current = false;
    }, ms);
  };
  const [dropState, setDropState] = useState<DropState | null>(null);
  const [draggingIds, setDraggingIds] = useState<ReadonlySet<string> | null>(null);
  const [menuState, setMenuState] = useState<MenuState | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  useEffect(() => {
    frameRef.current = frame;
    const focusRow = (id: string | undefined) => {
      if (!id) return;
      const row = listRef.current?.querySelector<HTMLElement>(
        `[data-layer-row-id="${CSS.escape(id)}"]`,
      );
      row?.focus({ preventScroll: false });
    };
    const pending = pendingMove.current;
    if (pending) {
      pendingMove.current = null;
      const message = describeLayerMove(frame, pending.ids);
      if (message) setLiveMessage(message);
      focusRow(pending.focusId);
    }
    if (pendingFocus.current) {
      focusRow(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [frame]);
  useEffect(() => () => dragSession.current?.end(false), []);
  const layer = frame.layers.find((item) => item.id === frame.active)!;
  const groups = frame.groups || [];
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const hasSearchQuery = searchQuery.trim().length > 0;
  const filteredLayers = filterLayersBySearch(frame.layers, groups, searchQuery);
  const visibleLayerIds = new Set(filteredLayers.map((item) => item.id));
  const matchingGroupIds = new Set(
    (hasSearchQuery ? filteredLayers : frame.layers).flatMap((item) =>
      item.groupId ? [item.groupId] : [],
    ),
  );
  for (const group of groups)
    if (groupMatchesSearch(group, searchQuery)) matchingGroupIds.add(group.id);
  const activeGroup = layer.groupId ? groupById.get(layer.groupId) : undefined;
  const clippingMaskBase = clippingGroupBase(frame, layer);
  const clippingCandidate = clippingCandidateBase(frame, layer);
  const layerLocked = layer.locked || Boolean(activeGroup?.locked);
  const selectedIds = new Set(
    (frame.selectedLayerIds === undefined
      ? [frame.active]
      : frame.selectedLayerIds
    ).filter((id) => frame.layers.some((item) => item.id === id)),
  );
  const styles = effectiveLayerStyles(layer.styles);
  const arrangeDisabled = (mode: LayerArrangeMode) =>
    !planLayerArrange(frame, mode).ok;
  const updateStyles = (patch: Partial<LayerStyles>) =>
    edit({ styles: { ...styles, ...patch } });
  const updateDropShadow = (
    patch: Partial<LayerStyles['dropShadow']>,
  ) => updateStyles({ dropShadow: { ...styles.dropShadow, ...patch } });
  const updateInnerShadow = (
    patch: Partial<LayerStyles['innerShadow']>,
  ) => updateStyles({ innerShadow: { ...styles.innerShadow, ...patch } });
  const updateBevelEmboss = (
    patch: Partial<LayerStyles['bevelEmboss']>,
  ) => updateStyles({ bevelEmboss: { ...styles.bevelEmboss, ...patch } });
  const updateOutline = (patch: Partial<LayerStyles['outline']>) =>
    updateStyles({ outline: { ...styles.outline, ...patch } });
  const updateColorOverlay = (
    patch: Partial<LayerStyles['colorOverlay']>,
  ) => updateStyles({ colorOverlay: { ...styles.colorOverlay, ...patch } });
  const updateGradientOverlay = (
    patch: Partial<LayerStyles['gradientOverlay']>,
  ) => updateStyles({ gradientOverlay: { ...styles.gradientOverlay, ...patch } });
  const updateOuterGlow = (patch: Partial<LayerStyles['outerGlow']>) =>
    updateStyles({ outerGlow: { ...styles.outerGlow, ...patch } });
  const updateInnerGlow = (patch: Partial<LayerStyles['innerGlow']>) =>
    updateStyles({ innerGlow: { ...styles.innerGlow, ...patch } });
  const updatePatternOverlay = (
    patch: Partial<LayerStyles['patternOverlay']>,
  ) => updateStyles({ patternOverlay: { ...styles.patternOverlay, ...patch } });
  const selectedLayers = frame.layers.filter((item) => selectedIds.has(item.id));
  const selectedGroupIds = new Set(selectedLayers.flatMap((item) => item.groupId ? [item.groupId] : []));
  const distributionGroup = selectedGroupIds.size === 1
    ? groupById.get([...selectedGroupIds][0])
    : activeGroup;
  const distributionCandidates = selectedLayers.length >= 3
    ? selectedLayers
    : distributionGroup
      ? frame.layers.filter((item) => item.groupId === distributionGroup.id)
      : [];
  const distributableCount = distributionCandidates.filter((item) => item.visible && !item.locked).length;
  const canDistribute = distributionCandidates.length >= 3 &&
    (selectedGroupIds.size === 0 || selectedGroupIds.size === 1) &&
    !distributionCandidates.some((item) => item.groupId && item.groupId !== [...selectedGroupIds][0]) &&
    !distributionGroup?.locked && distributionGroup?.visible !== false &&
    distributableCount >= 3;
  // ---- Layers panel interactions -----------------------------------------
  /** The rows an action on `id` applies to: the selection when it includes the row. */
  const idsFor = (id: string) => (selectedIds.has(id) ? [...selectedIds] : [id]);
  /** Make `id` part of (and active in) the selection before a panel action. */
  const prepareRow = (id: string) => {
    if (!setLayerSelection) {
      if (!selectedIds.has(id)) select(id);
      return;
    }
    if (!selectedIds.has(id)) setLayerSelection([id], id);
    else if (frame.active !== id) setLayerSelection([...selectedIds], id);
  };
  const arrangeRow = (id: string, mode: LayerArrangeMode, focus: boolean) => {
    const ids = idsFor(id);
    prepareRow(id);
    pendingMove.current = { ids, ...(focus ? { focusId: id } : {}) };
    if (arrange(mode) === false) {
      pendingMove.current = null;
      const plan = planLayerArrange({ ...frame, active: id, selectedLayerIds: ids }, mode);
      if (!plan.ok)
        setLiveMessage(
          plan.reason === 'boundary'
            ? 'Already at that end of the stack'
            : plan.reason === 'locked-selection'
              ? 'Unlock the layers before moving them'
              : 'Those layers cannot be moved',
        );
    }
  };
  const deleteRow = (id: string) => {
    const ids = idsFor(id);
    const plan = planLayerDelete({ ...frame, active: id, selectedLayerIds: ids }, ids);
    prepareRow(id);
    const result = remove();
    if (!plan.ok) {
      setLiveMessage(layerDeleteReason(plan.reason));
      return;
    }
    if (result === false) return;
    setLiveMessage(layerDeleteNotice(plan));
    pendingFocus.current = plan.frame.active;
  };
  const openMenu = (id: string, x: number, y: number, trigger: HTMLElement | null) => {
    dragSession.current?.end(false);
    setMenuState({ id, x, y, trigger });
  };
  const rowButtons = () =>
    Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-layer-row-id]') || []);
  const onRowKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, item: Layer) => {
    const command = event.ctrlKey || event.metaKey;
    let mode: LayerArrangeMode | undefined;
    if (command && !event.altKey && (event.code === 'BracketRight' || event.code === 'BracketLeft'))
      mode =
        event.code === 'BracketRight'
          ? event.shiftKey ? 'front' : 'forward'
          : event.shiftKey ? 'back' : 'backward';
    else if (event.altKey && !command && (event.key === 'ArrowUp' || event.key === 'ArrowDown'))
      mode =
        event.key === 'ArrowUp'
          ? event.shiftKey ? 'front' : 'forward'
          : event.shiftKey ? 'back' : 'backward';
    if (mode) {
      event.preventDefault();
      event.stopPropagation();
      arrangeRow(item.id, mode, true);
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && !command && !event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      deleteRow(item.id);
      return;
    }
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      event.stopPropagation();
      const box = event.currentTarget.getBoundingClientRect();
      openMenu(item.id, box.left + 24, box.bottom, event.currentTarget);
      return;
    }
    if (
      !command &&
      !event.altKey &&
      !event.shiftKey &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      // Move focus between rows (top of the list = top of the stack).
      const buttons = rowButtons();
      const next = buttons[buttons.indexOf(event.currentTarget) + (event.key === 'ArrowUp' ? -1 : 1)];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    }
  };
  /** Resolve the row under a viewport point into a drop target. */
  const resolveTarget = (x: number, y: number): LayerDropTarget | undefined => {
    const list = listRef.current;
    if (!list) return undefined;
    const rect = list.getBoundingClientRect();
    const probeX = Math.min(rect.right - 6, Math.max(rect.left + 6, x));
    const probeY = Math.min(rect.bottom - 2, Math.max(rect.top + 2, y));
    const row = document.elementFromPoint(probeX, probeY)?.closest<HTMLElement>('[data-drop-row]');
    if (!row || !list.contains(row)) return undefined;
    const box = row.getBoundingClientRect();
    if (row.dataset.dropRow === 'group' && row.dataset.groupId) {
      const position = dropPositionFromPointer('group', box.top, box.height, y);
      return { kind: 'group', id: row.dataset.groupId, position: position === 'above' ? 'above' : 'into' };
    }
    if (!row.dataset.layerId) return undefined;
    const position = dropPositionFromPointer('layer', box.top, box.height, y);
    return { kind: 'layer', id: row.dataset.layerId, position: position === 'above' ? 'above' : 'below' };
  };
  const updateDrag = (session: DragSession) => {
    const target = resolveTarget(session.x, session.y) ?? session.target;
    if (!target) return;
    session.target = target;
    const plan = planLayerDrop(frameRef.current, session.source, target);
    session.ok = plan.ok;
    setDropState({
      target,
      label: describeLayerDrop(plan, frameRef.current),
      state: plan.ok
        ? 'ok'
        : plan.reason === 'no-change' || plan.reason === 'onto-self'
          ? 'idle'
          : 'refused',
      x: session.x,
      y: session.y,
    });
  };
  const beginPointer = (
    event: ReactPointerEvent<HTMLElement>,
    rowKind: 'layer' | 'group',
    rowId: string,
  ) => {
    if (event.button !== 0 || dragSession.current || !moveLayers) return;
    const origin = event.target as HTMLElement;
    if (origin.closest('.layer-row-action, input, select, textarea, label, [role="menu"]')) return;
    const handle = Boolean(origin.closest('[data-drag-handle]'));
    if (rowKind === 'group' && !handle && !origin.closest('.group-toggle')) return;
    const touch = event.pointerType === 'touch';
    const wasSelected = rowKind === 'layer' && selectedIds.has(rowId);
    const source: LayerDragSource =
      rowKind === 'group' ? { kind: 'group', id: rowId } : { kind: 'layers', ids: idsFor(rowId) };
    let scrollTimer: number | undefined;
    let pressTimer: number | undefined;
    const session: DragSession = {
      pointerId: event.pointerId,
      source,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
      ok: false,
      end: () => undefined,
    };
    const activate = () => {
      session.active = true;
      suppressClicksFor(10_000);
      setMenuState(null);
      const frameNow = frameRef.current;
      setDraggingIds(
        new Set(
          source.kind === 'group'
            ? frameNow.layers.filter((item) => item.groupId === source.id).map((item) => item.id)
            : source.ids,
        ),
      );
      setLiveMessage('Dragging. Release to drop, Escape to cancel');
      scrollTimer = window.setInterval(() => {
        const list = listRef.current;
        if (!list) return;
        const rect = list.getBoundingClientRect(),
          edge = 28,
          before = list.scrollTop;
        if (session.y < rect.top + edge)
          list.scrollTop -= Math.ceil((rect.top + edge - session.y) / 3) + 2;
        else if (session.y > rect.bottom - edge)
          list.scrollTop += Math.ceil((session.y - (rect.bottom - edge)) / 3) + 2;
        if (list.scrollTop !== before) updateDrag(session);
      }, 30);
      updateDrag(session);
    };
    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== session.pointerId) return;
      session.x = moveEvent.clientX;
      session.y = moveEvent.clientY;
      const distance = Math.hypot(session.x - session.startX, session.y - session.startY);
      if (!session.active) {
        if (touch) {
          if (distance > 10) session.end(false);
          return;
        }
        if (distance < 5) return;
        activate();
      }
      moveEvent.preventDefault();
      updateDrag(session);
    };
    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId === session.pointerId) session.end(session.active);
    };
    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== session.pointerId) return;
      if (session.active) setLiveMessage('Reorder cancelled');
      session.end(false);
    };
    const onKey = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      if (session.active) setLiveMessage('Reorder cancelled; the layer order is unchanged');
      session.end(false);
    };
    session.end = (drop: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      window.clearInterval(scrollTimer);
      window.clearTimeout(pressTimer);
      if (dragSession.current === session) dragSession.current = null;
      const wasActive = session.active;
      session.active = false;
      if (wasActive) {
        suppressClicksFor(400);
        setDropState(null);
        setDraggingIds(null);
      }
      if (!drop || !wasActive || !session.target) return;
      const moved = moveLayers(source, session.target);
      if (!moved) {
        if (!session.ok)
          setLiveMessage(
            describeLayerDrop(planLayerDrop(frameRef.current, source, session.target), frameRef.current),
          );
        return;
      }
      pendingMove.current = { ids: moved };
      if (rowKind === 'layer' && !wasSelected && setLayerSelection) setLayerSelection(moved, rowId);
    };
    dragSession.current = session;
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    if (touch)
      // Touch: a long press on the handle starts a drag; a long press
      // elsewhere on a layer row opens the row menu.
      pressTimer = window.setTimeout(
        () => {
          if (handle) activate();
          else {
            session.end(false);
            if (rowKind !== 'layer') return;
            suppressClicksFor(800);
            openMenu(rowId, session.x, session.y, null);
          }
        },
        handle ? 300 : 550,
      );
  };
  const fileDragOver = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!dropFiles || !Array.from(event.dataTransfer.types).includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const target = resolveTarget(event.clientX, event.clientY) ?? dropState?.target;
    if (!target) return;
    const label = describeFileDrop(frame, target);
    if (
      dropState?.label !== label ||
      dropState.target.kind !== target.kind ||
      dropState.target.id !== target.id ||
      dropState.target.position !== target.position
    )
      setDropState({
        target,
        label,
        state: label.startsWith('Locked') ? 'refused' : 'ok',
        x: event.clientX,
        y: event.clientY,
      });
  };
  const fileDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    if (!dropFiles || event.shiftKey) {
      // Shift-drop opens the file as a document (handled by the editor).
      setDropState(null);
      return;
    }
    const files = Array.from(event.dataTransfer.files);
    const target = resolveTarget(event.clientX, event.clientY) ?? dropState?.target;
    setDropState(null);
    if (!files.length || !target) return;
    event.preventDefault();
    dropFiles(files, target);
  };
  const dropClass = (kind: LayerDropTarget['kind'], id: string) => {
    const target = dropState?.target;
    if (!target || target.kind !== kind || target.id !== id) return '';
    return ` drop-${target.position}${dropState.state === 'refused' ? ' drop-refused' : ''}`;
  };
  const menuLayer = menuState ? frame.layers.find((item) => item.id === menuState.id) : undefined;
  const renderedGroups = new Set<string>();
  const rows: ReactNode[] = [];
  for (const item of [...frame.layers].reverse()) {
    if (!visibleLayerIds.has(item.id)) continue;
    const group = item.groupId ? groupById.get(item.groupId) : undefined;
    if (group && matchingGroupIds.has(group.id) && !renderedGroups.has(group.id)) {
      rows.push(
        <GroupRow
          key={'group-' + group.id}
          group={group}
          editGroup={editGroup}
          selected={activeGroup?.id === group.id}
          dropClass={dropClass('group', group.id)}
          dragging={Boolean(draggingIds && frame.layers.some((member) => member.groupId === group.id && draggingIds.has(member.id)))}
          onPointerDown={moveLayers ? (event) => beginPointer(event, 'group', group.id) : undefined}
          ignoreClick={() => suppressClick.current}
        />,
      );
      renderedGroups.add(group.id);
    }
    if (!group || !group.collapsed || hasSearchQuery) {
      // Clipped rows are indented under their clipping group's base with a
      // ↳ glyph; the base name and the stack position are the row's
      // accessible description, so its accessible name stays
      // "Select layer <name>".
      const clippedTo = item.clippingTo !== undefined ? clippingGroupBase(frame, item) : undefined;
      const descriptionId = `layer-desc-${item.id}`;
      const name = item.name || 'Untitled layer';
      const locked = item.locked || Boolean(group?.locked);
      rows.push(
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          key={item.id}
          className={
            'layer-row-item' +
            (clippedTo ? ' clipped' : '') +
            (draggingIds?.has(item.id) ? ' dragging' : '') +
            dropClass('layer', item.id)
          }
          data-drop-row="layer"
          data-layer-id={item.id}
          onPointerDown={(event) => beginPointer(event, 'layer', item.id)}
          onContextMenu={(event) => {
            if ((event.target as HTMLElement).closest('input, select, textarea')) return;
            event.preventDefault();
            openMenu(item.id, event.clientX, event.clientY, event.target as HTMLElement);
          }}
        >
          {moveLayers && (
            <span
              className="layer-drag-handle"
              data-drag-handle="true"
              aria-hidden="true"
              title="Drag to reorder (long-press on touch)"
            >
              <GripVertical size={14} />
            </span>
          )}
        <button
          className={
            (item.id === layer.id
              ? 'layer-row selected'
              : selectedIds.has(item.id)
                ? 'layer-row multi-selected'
                : 'layer-row') + (clippedTo ? ' clipped' : '')
          }
          data-clipped={clippedTo ? 'true' : undefined}
          data-layer-row-id={item.id}
          aria-describedby={descriptionId}
          onClick={(event) => {
            if (suppressClick.current) return;
            select(item.id, {
              additive: event.metaKey || event.ctrlKey,
              range: event.shiftKey,
            });
          }}
          onKeyDown={(event) => onRowKeyDown(event, item)}
          aria-pressed={selectedIds.has(item.id)}
          data-selected={selectedIds.has(item.id) ? 'true' : 'false'}
          aria-label={`Select layer ${item.name}`}
        >
          {clippedTo && (
            <span className="layer-clip-glyph" aria-hidden="true">↳</span>
          )}
          <span id={descriptionId} className="sr-only">
            {clippedTo ? `Clipped to ${clippedTo.name || 'Untitled layer'}; ` : ''}
            {layerStackDescription(frame, item.id)}
          </span>
          <span className="layer-type">
            {item.kind === 'text'
              ? 'T'
              : item.kind === 'raster'
                ? '▧'
                : item.kind === 'smart-object'
                  ? '◈'
                : item.kind === 'adjustment'
                  ? '◐'
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
        </button>
          <button
            type="button"
            className={'layer-row-action layer-row-delete' + (locked ? ' refused' : '')}
            aria-label={`Delete ${name}`}
            title={locked ? 'Locked: unlock to delete' : 'Delete layer'}
            onClick={() => deleteRow(item.id)}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="layer-row-action layer-row-more"
            aria-label={`Layer options for ${name}`}
            aria-haspopup="menu"
            aria-expanded={menuState?.id === item.id}
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              if (menuState?.id === item.id) setMenuState(null);
              else openMenu(item.id, box.right, box.bottom, event.currentTarget);
            }}
          >
            <Ellipsis size={14} aria-hidden="true" />
          </button>
        </div>,
      );
    }
  }
  for (const group of groups) {
    if (renderedGroups.has(group.id)) continue;
    if (hasSearchQuery && !matchingGroupIds.has(group.id)) continue;
    rows.unshift(
      <GroupRow
        key={'group-' + group.id}
        group={group}
        editGroup={editGroup}
        selected={activeGroup?.id === group.id}
        dropClass={dropClass('group', group.id)}
        dragging={false}
      />,
    );
  }
  const Root = main ? LayersRoot : PartRoot;
  return (
    <Root>
      {main && (<>
      <h3>
        Layers <small>{frame.layers.length} / {MAX_DOCUMENT_LAYERS}</small>
      </h3>
      {pixelUsage !== undefined && (
        <p
          className="layer-budget"
          data-testid="layer-pixel-budget"
          data-state={
            pixelUsage > detectProjectLimits().layerPixelBudget * 0.9
              ? "near"
              : "ok"
          }
          title="Raster layers share one pixel budget. Trim sparse paint layers (Layer > Trim Layer to Content) or merge layers to free space."
        >
          Pixel budget {formatMegapixels(pixelUsage)} / {formatMegapixels(detectProjectLimits().layerPixelBudget)} MP
        </p>
      )}
      <label className="layer-field layer-search-field">
        Find layers
        <input
          id="find-layers"
          aria-label="Find layers"
          type="search"
          maxLength={160}
          value={searchQuery}
          placeholder="Name, type, group, visible…"
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        {searchQuery.trim() && (
          <small aria-live="polite">
            {filteredLayers.length} of {frame.layers.length} layers match
          </small>
        )}
      </label>
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className={'layer-list' + (dropState ? ' drag-active' : '')}
        ref={listRef}
        data-file-drop-zone="layers"
        onDragOver={fileDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropState(null);
        }}
        onDrop={fileDrop}
      >
        {rows}
      </div>
      {/* Layers panel footer (Photoshop-style): the everyday layer actions sit
          right under the list. docs/contextual-sidebar-contract.md */}
      <div className="layer-footer" role="toolbar" aria-label="Layer actions" data-testid="layer-footer">
        <button
          type="button"
          aria-label="Add paint layer"
          title="New paint layer"
          onClick={add}
          disabled={frame.layers.length >= MAX_DOCUMENT_LAYERS}
        >
          <FilePlus2 aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Add adjustment layer"
          title="New adjustment layer"
          onClick={addAdjustment}
          disabled={frame.layers.length >= MAX_DOCUMENT_LAYERS}
        >
          <Contrast aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Group active layer"
          title="New folder from the selected layers"
          onClick={groupActive}
          disabled={
            [...selectedIds].some((id) =>
              frame.layers.find((item) => item.id === id)?.groupId,
            )
          }
        >
          <FolderPlus aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Mask from selection"
          title="Add a layer mask from the selection"
          onClick={createMask}
          disabled={
            !isMaskableLayer(layer) ||
            !frame.selection ||
            layerLocked ||
            !layer.visible
          }
        >
          <SquareDashed aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Create clipping mask"
          title="Clip to the layer below"
          onClick={createClipping}
          disabled={
            !isClippingSourceLayer(layer) ||
            Boolean(layer.clippingTo) ||
            !clippingCandidate ||
            layerLocked ||
            Boolean(
              clippingCandidate &&
                (clippingCandidate.locked || !clippingCandidate.visible),
            ) ||
            !layer.visible
          }
        >
          <Link2 aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Release clipping mask"
          title="Release clipping mask"
          onClick={releaseClipping}
          disabled={!layer.clippingTo || layerLocked}
        >
          <Unlink2 aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Raise layer"
          title="Raise layer"
          onClick={() => reorder(1)}
          disabled={layerLocked || frame.layers.at(-1)?.id === layer.id}
        >
          <ArrowUp aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Lower layer"
          title="Lower layer"
          onClick={() => reorder(-1)}
          disabled={layerLocked || frame.layers[0].id === layer.id}
        >
          <ArrowDown aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Duplicate layer"
          title="Duplicate layer"
          onClick={duplicate}
          disabled={frame.layers.length >= MAX_DOCUMENT_LAYERS}
        >
          <Copy aria-hidden="true" />
        </button>
        <button
          type="button"
          className="layer-footer-delete"
          aria-label="Delete layer"
          title="Delete layer (Delete key). Undo restores it."
          onClick={remove}
          disabled={layerLocked || frame.layers.length === 1}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>
      <div className="layer-actions">
        <button onClick={addSmartObject} disabled={frame.layers.length >= MAX_DOCUMENT_LAYERS}>
          Add smart object
        </button>
        <button
          onClick={nestSelectedAsSmartObject}
          disabled={selectedIds.size === 0 || frame.layers.some((item) => selectedIds.has(item.id) && item.groupId !== undefined)}
        >
          Nest selected layers
        </button>
        <button
          onClick={replaceSmartObject}
          disabled={layer.kind !== 'smart-object' || layerLocked}
        >
          Replace contents
        </button>
        <button onClick={importImage} disabled={frame.layers.length >= MAX_DOCUMENT_LAYERS}>
          Add image layer
        </button>
        <button
          onClick={ungroupActive}
          disabled={!layer.groupId || Boolean(activeGroup?.locked)}
        >
          Ungroup active layer
        </button>
      </div>
      <div className="layer-selection-toolbar" aria-label="Layer selection">
        <span aria-live="polite">
          {selectedIds.size} layer{selectedIds.size === 1 ? '' : 's'} selected
        </span>
        <div className="layer-actions">
          <button onClick={selectAll}>Select all layers</button>
          <button onClick={deselectLayers} disabled={selectedIds.size === 0}>
            Deselect layers
          </button>
          <button onClick={isolateLayers} disabled={selectedIds.size === 0}>
            Isolate layers
          </button>
        </div>
      </div>
      <p className="sr-only" aria-live="polite" data-testid="layers-live">
        {liveMessage}
      </p>
      {dropState && (
        <div
          className={'layer-drop-hint' + (dropState.state === 'refused' ? ' refused' : '')}
          data-testid="layer-drop-hint"
          data-state={dropState.state}
          aria-hidden="true"
          style={{
            left: Math.max(8, Math.min(dropState.x + 14, window.innerWidth - 220)),
            top: Math.max(8, Math.min(dropState.y + 14, window.innerHeight - 40)),
          }}
        >
          {dropState.label}
        </div>
      )}
      {menuState && menuLayer && (
        <LayerRowMenu
          frame={frame}
          layer={menuLayer}
          ids={idsFor(menuLayer.id)}
          x={menuState.x}
          y={menuState.y}
          close={(restoreFocus) => {
            const trigger = menuState.trigger;
            setMenuState(null);
            if (restoreFocus && trigger?.isConnected) trigger.focus();
          }}
          run={(action) => {
            const id = menuLayer.id;
            setMenuState(null);
            switch (action) {
              case 'duplicate':
                prepareRow(id);
                duplicate();
                break;
              case 'delete':
                deleteRow(id);
                break;
              case 'front':
              case 'forward':
              case 'backward':
              case 'back':
                arrangeRow(id, action, true);
                break;
              case 'clip':
                prepareRow(id);
                createClipping();
                break;
              case 'release-clip':
                prepareRow(id);
                releaseClipping();
                break;
              case 'group':
                prepareRow(id);
                groupActive();
                break;
              case 'rename': {
                const next = window.prompt('Layer name', menuLayer.name);
                if (next === null) break;
                prepareRow(id);
                edit({ name: next.slice(0, 160) });
                pendingFocus.current = id;
                break;
              }
              case 'visibility':
                prepareRow(id);
                edit({ visible: !menuLayer.visible });
                pendingFocus.current = id;
                break;
              case 'lock':
                prepareRow(id);
                edit({ locked: !menuLayer.locked });
                pendingFocus.current = id;
                break;
            }
          }}
        />
      )}
      {searchQuery.trim() && filteredLayers.length === 0 && (
        <p className="layer-search-empty">No layers match this search.</p>
      )}
      </>)}
      {part === 'alignment' && (<>
      <fieldset className="layer-alignment" disabled={layerLocked} data-sidebar-section="layer-alignment">
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
        disabled={!canDistribute}
      >
        <legend>{selectedLayers.length >= 3 && selectedGroupIds.size === 0 ? 'Distribute selected layers' : 'Distribute folder layers'}</legend>
        <div className="layer-actions">
          <button onClick={() => distribute('horizontal')}>Distribute horizontally</button>
          <button onClick={() => distribute('vertical')}>Distribute vertically</button>
        </div>
        <p>Evenly space the centers of visible unlocked layers; outer layers stay fixed.</p>
      </fieldset>
      </>)}
      {main && (<>
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
      <div className="layer-actions layer-mask-actions">
        <button
          onClick={clearMask}
          disabled={
            !isMaskableLayer(layer) ||
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
            !isMaskableLayer(layer) ||
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
            !isMaskableLayer(layer) ||
            !layer.mask ||
            layerLocked ||
            !layer.visible
          }
        >
          {layer.maskEnabled === false ? 'Enable mask' : 'Disable mask'}
        </button>
        <button
          onClick={createVectorMask}
          disabled={
            !isVectorMaskableLayer(layer) ||
            Boolean(layer.vectorMask) ||
            layerLocked ||
            !layer.visible
          }
        >
          Create vector mask
        </button>
        <button
          onClick={invertVectorMask}
          disabled={
            !isVectorMaskableLayer(layer) ||
            !layer.vectorMask ||
            layerLocked ||
            !layer.visible
          }
        >
          {layer.vectorMask?.inverted ? 'Uninvert vector mask' : 'Invert vector mask'}
        </button>
        <button
          onClick={toggleVectorMask}
          disabled={
            !isVectorMaskableLayer(layer) ||
            !layer.vectorMask ||
            layerLocked ||
            !layer.visible
          }
        >
          {layer.vectorMask?.enabled === false
            ? 'Enable vector mask'
            : 'Disable vector mask'}
        </button>
        <button
          onClick={clearVectorMask}
          disabled={
            !isVectorMaskableLayer(layer) ||
            !layer.vectorMask ||
            layerLocked ||
            !layer.visible
          }
        >
          Remove vector mask
        </button>
      </div>
      {isMaskableLayer(layer) && layer.mask && (
        <p className="mask-status">Nondestructive mask active</p>
      )}
      {isVectorMaskableLayer(layer) && layer.vectorMask && (
        <p className="mask-status">
          Vector mask {layer.vectorMask.enabled === false ? 'disabled' : 'active'}
          {layer.vectorMask.inverted ? ' · inverted' : ''}
          {' · path preserved in project data'}
        </p>
      )}
      {layer.clippingTo && (
        <p className="mask-status">
          Clipped to {clippingMaskBase?.name || 'lower layer'}
        </p>
      )}
      {layer.kind === 'smart-object' && (
        <p className="mask-status">
          Embedded source · {layer.sourceName || 'untitled image'} · replaceable without changing transforms
        </p>
      )}
      {layer.kind === 'raster' && layer.background === true && (
        <p className="mask-status" data-testid="background-layer-status">
          Background · position locked, Eraser paints the background colour · Layer &gt; Layer from Background or rename to unlock
        </p>
      )}
      <div className="layer-properties" data-sidebar-section="layer-properties">
      <label className="layer-field">
        Layer name
        <input
          id="layer-name"
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
      {layer.kind === 'raster' && layer.fillColor && (
        <label className="layer-field">
          Fill colour
          <input
            aria-label="Fill layer colour"
            type="color"
            value={layer.fillColor}
            disabled={layerLocked}
            onChange={(e) => edit({ fillColor: e.target.value })}
          />
        </label>
      )}
      <label className="layer-field">
        Blend mode
        <select
          aria-label="Blend mode"
          value={layer.blend}
          disabled={layerLocked}
          onChange={(e) => edit({ blend: e.target.value as Layer['blend'] })}
        >
          <BlendModeOptions />
        </select>
      </label>
      </div>
      </>)}
      {part === 'selection' && (
      <div className="layer-actions" data-sidebar-section="selection-options">
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
        {frame.selection && (
          <label className="layer-field">
            Current selection feather {formatSelectionFeather(frame.selection.feather)} px
            <input
              aria-label="Selection feather"
              type="range"
              min="0"
              max="100"
              step={SELECTION_FEATHER_STEP}
              value={frame.selection.feather}
              onChange={(e) => setSelectionFeather(Number(e.target.value))}
            />
          </label>
        )}
        <button onClick={invertSelection} disabled={!frame.selection}>
          Invert selection
        </button>
        <button onClick={clearSelection} disabled={!frame.selection}>
          Clear selection
        </button>
      </div>
      )}
      {part === 'styles' && (
      <fieldset className="layer-alignment" disabled={layerLocked} data-sidebar-section="layer-styles">
        <legend>Layer styles</legend>
        <div className="layer-style-block" data-sidebar-section="layer-style-drop-shadow">
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
            min={-STYLE_MAX_OFFSET}
            max={STYLE_MAX_OFFSET}
            disabled={layerLocked}
            apply={(value) => updateDropShadow({ offsetX: value })}
          />
          <NumberField
            label="Shadow Y"
            value={styles.dropShadow.offsetY}
            min={-STYLE_MAX_OFFSET}
            max={STYLE_MAX_OFFSET}
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
            max={STYLE_MAX_BLUR}
            value={Math.round(styles.dropShadow.blur)}
            onChange={(event) =>
              updateDropShadow({ blur: Number(event.target.value) })
            }
          />
        </label>
        <div className="layer-position">
          <label className="layer-field">
            Shadow mode
            <select
              aria-label="Drop shadow blend mode"
              value={styles.dropShadow.blend}
              onChange={(event) => updateDropShadow({ blend: event.target.value as LayerBlendMode })}
            >
              <BlendModeOptions />
            </select>
          </label>
          <ShadowFalloffSelect
            label="Drop shadow falloff"
            value={styles.dropShadow.falloff}
            update={(falloff) => updateDropShadow({ falloff })}
          />
        </div>
        </div>
        <div className="layer-style-block" data-sidebar-section="layer-style-outer-glow">
        <label>
          <input
            type="checkbox"
            aria-label="Enable outer glow"
            checked={styles.outerGlow.enabled}
            onChange={(event) => updateOuterGlow({ enabled: event.target.checked })}
          />
          Outer glow
        </label>
        {styles.outerGlow.enabled && (
          <GlowControls
            name="Outer glow"
            color={styles.outerGlow.color}
            opacity={styles.outerGlow.opacity}
            size={styles.outerGlow.size}
            amount={styles.outerGlow.spread}
            amountLabel="spread"
            blend={styles.outerGlow.blend}
            update={(patch) =>
              updateOuterGlow({
                ...(patch.color !== undefined ? { color: patch.color } : {}),
                ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
                ...(patch.size !== undefined ? { size: patch.size } : {}),
                ...(patch.amount !== undefined ? { spread: patch.amount } : {}),
                ...(patch.blend !== undefined ? { blend: patch.blend } : {}),
              })
            }
          />
        )}
        </div>
        <div className="layer-style-block" data-sidebar-section="layer-style-inner-shadow">
        <label>
          <input
            type="checkbox"
            aria-label="Enable inner shadow"
            checked={styles.innerShadow.enabled}
            onChange={(event) =>
              updateInnerShadow({ enabled: event.target.checked })
            }
          />
          Inner shadow
        </label>
        <label className="layer-field">
          Inner shadow color
          <input
            aria-label="Inner shadow color"
            type="color"
            value={styles.innerShadow.color}
            onChange={(event) => updateInnerShadow({ color: event.target.value })}
          />
        </label>
        <label className="layer-field">
          Inner shadow opacity {Math.round(styles.innerShadow.opacity * 100)}%
          <input
            aria-label="Inner shadow opacity"
            type="range"
            min="0"
            max="100"
            value={Math.round(styles.innerShadow.opacity * 100)}
            onChange={(event) =>
              updateInnerShadow({ opacity: Number(event.target.value) / 100 })
            }
          />
        </label>
        <div className="layer-position">
          <NumberField
            label="Inner shadow X"
            value={styles.innerShadow.offsetX}
            min={-STYLE_MAX_OFFSET}
            max={STYLE_MAX_OFFSET}
            disabled={layerLocked}
            apply={(value) => updateInnerShadow({ offsetX: value })}
          />
          <NumberField
            label="Inner shadow Y"
            value={styles.innerShadow.offsetY}
            min={-STYLE_MAX_OFFSET}
            max={STYLE_MAX_OFFSET}
            disabled={layerLocked}
            apply={(value) => updateInnerShadow({ offsetY: value })}
          />
        </div>
        <label className="layer-field">
          Inner shadow blur {Math.round(styles.innerShadow.blur)} px
          <input
            aria-label="Inner shadow blur"
            type="range"
            min="0"
            max={STYLE_MAX_BLUR}
            value={Math.round(styles.innerShadow.blur)}
            onChange={(event) =>
              updateInnerShadow({ blur: Number(event.target.value) })
            }
          />
        </label>
        <ShadowFalloffSelect
          label="Inner shadow falloff"
          value={styles.innerShadow.falloff}
          update={(falloff) => updateInnerShadow({ falloff })}
        />
        <label className="layer-field">
          Inner shadow distance {Math.round(styles.innerShadow.distance)} px
          <input
            aria-label="Inner shadow distance"
            type="range"
            min="1"
            max={INNER_SHADOW_MAX_DISTANCE}
            value={Math.round(styles.innerShadow.distance)}
            onChange={(event) =>
              updateInnerShadow({ distance: Number(event.target.value) })
            }
          />
        </label>
        </div>
        <div className="layer-style-block" data-sidebar-section="layer-style-inner-glow">
        <label>
          <input
            type="checkbox"
            aria-label="Enable inner glow"
            checked={styles.innerGlow.enabled}
            onChange={(event) => updateInnerGlow({ enabled: event.target.checked })}
          />
          Inner glow
        </label>
        {styles.innerGlow.enabled && (
          <GlowControls
            name="Inner glow"
            color={styles.innerGlow.color}
            opacity={styles.innerGlow.opacity}
            size={styles.innerGlow.size}
            amount={styles.innerGlow.choke}
            amountLabel="choke"
            blend={styles.innerGlow.blend}
            source={styles.innerGlow.source}
            update={(patch) =>
              updateInnerGlow({
                ...(patch.color !== undefined ? { color: patch.color } : {}),
                ...(patch.opacity !== undefined ? { opacity: patch.opacity } : {}),
                ...(patch.size !== undefined ? { size: patch.size } : {}),
                ...(patch.amount !== undefined ? { choke: patch.amount } : {}),
                ...(patch.blend !== undefined ? { blend: patch.blend } : {}),
                ...(patch.source !== undefined ? { source: patch.source } : {}),
              })
            }
          />
        )}
        </div>
        <div className="layer-style-block" data-sidebar-section="layer-style-bevel-emboss">
        <label>
          <input
            type="checkbox"
            aria-label="Enable bevel emboss"
            checked={styles.bevelEmboss.enabled}
            onChange={(event) =>
              updateBevelEmboss({ enabled: event.target.checked })
            }
          />
          Bevel &amp; emboss
        </label>
        <div className="layer-position">
          <label className="layer-field">
            Bevel highlight
            <input
              aria-label="Bevel highlight color"
              type="color"
              value={styles.bevelEmboss.highlightColor}
              onChange={(event) =>
                updateBevelEmboss({ highlightColor: event.target.value })
              }
            />
          </label>
          <label className="layer-field">
            Bevel shadow
            <input
              aria-label="Bevel shadow color"
              type="color"
              value={styles.bevelEmboss.shadowColor}
              onChange={(event) =>
                updateBevelEmboss({ shadowColor: event.target.value })
              }
            />
          </label>
        </div>
        <label className="layer-field">
          Bevel opacity {Math.round(styles.bevelEmboss.opacity * 100)}%
          <input
            aria-label="Bevel opacity"
            type="range"
            min="0"
            max="100"
            value={Math.round(styles.bevelEmboss.opacity * 100)}
            onChange={(event) =>
              updateBevelEmboss({ opacity: Number(event.target.value) / 100 })
            }
          />
        </label>
        <div className="layer-position">
          <NumberField
            label="Bevel angle"
            value={styles.bevelEmboss.angle}
            min={-180}
            max={180}
            disabled={layerLocked}
            apply={(value) => updateBevelEmboss({ angle: value })}
          />
          <NumberField
            label="Bevel depth"
            value={styles.bevelEmboss.depth}
            min={1}
            max={32}
            disabled={layerLocked}
            apply={(value) => updateBevelEmboss({ depth: value })}
          />
        </div>
        <label className="layer-field">
          Bevel blur {Math.round(styles.bevelEmboss.blur)} px
          <input
            aria-label="Bevel blur"
            type="range"
            min="0"
            max="32"
            value={Math.round(styles.bevelEmboss.blur)}
            onChange={(event) =>
              updateBevelEmboss({ blur: Number(event.target.value) })
            }
          />
        </label>
        </div>
        <div className="layer-style-block" data-sidebar-section="layer-style-outline">
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
        </div>
        <div className="layer-style-block" data-sidebar-section="layer-style-color-overlay">
        <label>
          <input
            type="checkbox"
            aria-label="Enable color overlay"
            checked={styles.colorOverlay.enabled}
            onChange={(event) =>
              updateColorOverlay({ enabled: event.target.checked })
            }
          />
          Color overlay
        </label>
        <label className="layer-field">
          Overlay color
          <input
            aria-label="Color overlay color"
            type="color"
            value={styles.colorOverlay.color}
            onChange={(event) => updateColorOverlay({ color: event.target.value })}
          />
        </label>
        <label className="layer-field">
          Overlay opacity {Math.round(styles.colorOverlay.opacity * 100)}%
          <input
            aria-label="Color overlay opacity"
            type="range"
            min="0"
            max="100"
            value={Math.round(styles.colorOverlay.opacity * 100)}
            onChange={(event) =>
              updateColorOverlay({ opacity: Number(event.target.value) / 100 })
            }
          />
        </label>
        </div>
        <div className="layer-style-block" data-sidebar-section="layer-style-gradient-overlay">
        <label>
          <input
            type="checkbox"
            aria-label="Enable gradient overlay"
            checked={styles.gradientOverlay.enabled}
            onChange={(event) =>
              updateGradientOverlay({ enabled: event.target.checked })
            }
          />
          Gradient overlay
        </label>
        <div className="layer-position">
          <label className="layer-field">
            Gradient start
            <input
              aria-label="Gradient overlay start color"
              type="color"
              value={styles.gradientOverlay.startColor}
              onChange={(event) =>
                updateGradientOverlay({ startColor: event.target.value })
              }
            />
          </label>
          <label className="layer-field">
            Gradient end
            <input
              aria-label="Gradient overlay end color"
              type="color"
              value={styles.gradientOverlay.endColor}
              onChange={(event) =>
                updateGradientOverlay({ endColor: event.target.value })
              }
            />
          </label>
        </div>
        <label className="layer-field">
          Gradient opacity {Math.round(styles.gradientOverlay.opacity * 100)}%
          <input
            aria-label="Gradient overlay opacity"
            type="range"
            min="0"
            max="100"
            value={Math.round(styles.gradientOverlay.opacity * 100)}
            onChange={(event) =>
              updateGradientOverlay({ opacity: Number(event.target.value) / 100 })
            }
          />
        </label>
        <div className="layer-position">
          <NumberField
            label="Gradient angle"
            value={styles.gradientOverlay.angle}
            min={-180}
            max={180}
            disabled={layerLocked}
            apply={(value) => updateGradientOverlay({ angle: value })}
          />
          <label>
            <input
              type="checkbox"
              aria-label="Reverse gradient overlay"
              checked={styles.gradientOverlay.reverse}
              onChange={(event) =>
                updateGradientOverlay({ reverse: event.target.checked })
              }
            />
            Reverse
          </label>
        </div>
        </div>
        <div className="layer-style-block" data-sidebar-section="layer-style-pattern-overlay">
        <label>
          <input
            type="checkbox"
            aria-label="Enable pattern overlay"
            checked={styles.patternOverlay.enabled}
            onChange={(event) =>
              updatePatternOverlay({ enabled: event.target.checked })
            }
          />
          Pattern overlay
        </label>
        <label className="layer-field">
          Pattern
          <select
            aria-label="Pattern overlay pattern"
            value={styles.patternOverlay.pattern}
            onChange={(event) =>
              updatePatternOverlay({ pattern: event.target.value as PatternId })
            }
          >
            {PATTERN_IDS.map((pattern) => (
              <option key={pattern} value={pattern}>
                {pattern[0].toUpperCase() + pattern.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <div className="layer-position">
          <label className="layer-field">
            Pattern foreground
            <input
              aria-label="Pattern overlay foreground"
              type="color"
              value={styles.patternOverlay.foregroundColor}
              onChange={(event) =>
                updatePatternOverlay({ foregroundColor: event.target.value })
              }
            />
          </label>
          <label className="layer-field">
            Pattern background
            <input
              aria-label="Pattern overlay background"
              type="color"
              value={styles.patternOverlay.backgroundColor}
              onChange={(event) =>
                updatePatternOverlay({ backgroundColor: event.target.value })
              }
            />
          </label>
        </div>
        <label className="layer-field">
          Pattern opacity {Math.round(styles.patternOverlay.opacity * 100)}%
          <input
            aria-label="Pattern overlay opacity"
            type="range"
            min="0"
            max="100"
            value={Math.round(styles.patternOverlay.opacity * 100)}
            onChange={(event) =>
              updatePatternOverlay({ opacity: Number(event.target.value) / 100 })
            }
          />
        </label>
        <label className="layer-field">
          Pattern tile size {Math.round(styles.patternOverlay.tileSize)} px
          <input
            aria-label="Pattern overlay tile size"
            type="range"
            min="4"
            max="128"
            value={Math.round(styles.patternOverlay.tileSize)}
            onChange={(event) =>
              updatePatternOverlay({ tileSize: Number(event.target.value) })
            }
          />
        </label>
        </div>
      </fieldset>
      )}
      {part === 'details' && (
      <div className="layer-details" data-sidebar-section="layer-details">
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
      <div className="layer-actions layer-arrange-actions">
        <button
          onClick={() => arrange('front')}
          disabled={arrangeDisabled('front')}
        >
          Bring to front
        </button>
        <button
          onClick={() => arrange('forward')}
          disabled={arrangeDisabled('forward')}
        >
          Bring forward
        </button>
        <button
          onClick={() => arrange('backward')}
          disabled={arrangeDisabled('backward')}
        >
          Send backward
        </button>
        <button
          onClick={() => arrange('back')}
          disabled={arrangeDisabled('back')}
        >
          Send to back
        </button>
      </div>
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
      </div>
      )}
      {main && (<>
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
          <div className="layer-field" title="Applies to the whole layer. The Text section Font also restyles the selected type and sets the font for new type.">
            Layer font (whole layer)
            <FontFamilySelect
              label="Layer font"
              className=""
              value={layer.fontFamily}
              disabled={layerLocked}
              onChange={(fontFamily) => edit({ fontFamily })}
            />
          </div>
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
          <fieldset className="layer-fieldset">
            <legend>OpenType</legend>
            {(() => {
              const openType = normalizeOpenType(layer.openType);
              return (
                <>
                  <label>
                    <input
                      type="checkbox"
                      aria-label="OpenType ligatures"
                      checked={openType.ligatures}
                      disabled={layerLocked}
                      onChange={(e) => edit({ openType: { ...openType, ligatures: e.target.checked } })}
                    />
                    Standard ligatures
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      aria-label="OpenType discretionary ligatures"
                      checked={openType.discretionaryLigatures}
                      disabled={layerLocked}
                      onChange={(e) => edit({ openType: { ...openType, discretionaryLigatures: e.target.checked } })}
                    />
                    Discretionary ligatures
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      aria-label="OpenType contextual alternates"
                      checked={openType.contextualAlternates}
                      disabled={layerLocked}
                      onChange={(e) => edit({ openType: { ...openType, contextualAlternates: e.target.checked } })}
                    />
                    Contextual alternates
                  </label>
                  <label className="layer-field">
                    Kerning
                    <select
                      aria-label="OpenType kerning"
                      value={openType.kerning}
                      disabled={layerLocked}
                      onChange={(e) => edit({ openType: { ...openType, kerning: e.target.value as 'auto' | 'normal' | 'none' } })}
                    >
                      <option value="auto">Auto</option>
                      <option value="normal">Normal</option>
                      <option value="none">None</option>
                    </select>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      aria-label="OpenType small caps"
                      checked={openType.smallCaps}
                      disabled={layerLocked}
                      onChange={(e) => edit({ openType: { ...openType, smallCaps: e.target.checked } })}
                    />
                    Small caps
                  </label>
                  <label className="layer-field">
                    Variable weight ({Math.round(openType.variableAxes.wght)})
                    <input aria-label="Variable font weight" type="range" min="100" max="900" step="1" value={openType.variableAxes.wght} disabled={layerLocked} onChange={(e) => edit({ openType: { ...openType, variableAxes: { ...openType.variableAxes, wght: Number(e.target.value) } } })} />
                  </label>
                  <label className="layer-field">
                    Variable width ({Math.round(openType.variableAxes.wdth)}%)
                    <input aria-label="Variable font width" type="range" min="50" max="200" step="1" value={openType.variableAxes.wdth} disabled={layerLocked} onChange={(e) => edit({ openType: { ...openType, variableAxes: { ...openType.variableAxes, wdth: Number(e.target.value) } } })} />
                  </label>
                  <label className="layer-field">
                    Optical size ({Math.round(openType.variableAxes.opsz)}pt)
                    <input aria-label="Variable optical size" type="range" min="8" max="144" step="1" value={openType.variableAxes.opsz} disabled={layerLocked} onChange={(e) => edit({ openType: { ...openType, variableAxes: { ...openType.variableAxes, opsz: Number(e.target.value) } } })} />
                  </label>
                </>
              );
            })()}
            <p className="adjust-note">Browser font shaping applies these portable flags when supported; no font files leave the device.</p>
          </fieldset>
          <fieldset className="layer-fieldset">
            <legend>Language Options</legend>
            {(() => {
              const language = normalizeTextLanguage(layer.languageOptions);
              return (
                <>
                  <label className="layer-field">
                    Language
                    <select aria-label="Text language" value={language.language} disabled={layerLocked} onChange={(e) => edit({ languageOptions: { ...language, language: e.target.value as typeof language.language } })}>
                      {TEXT_LANGUAGES.map((value) => <option key={value} value={value}>{value === 'auto' ? 'Auto detect' : value.toUpperCase()}</option>)}
                    </select>
                  </label>
                  <label className="layer-field">
                    Direction
                    <select aria-label="Text direction" value={language.direction} disabled={layerLocked} onChange={(e) => edit({ languageOptions: { ...language, direction: e.target.value as typeof language.direction } })}>
                      {TEXT_DIRECTIONS.map((value) => <option key={value} value={value}>{value === 'auto' ? 'Auto' : value.toUpperCase()}</option>)}
                    </select>
                  </label>
                  <label>
                    <input type="checkbox" aria-label="Text hyphenation" checked={language.hyphenation} disabled={layerLocked} onChange={(e) => edit({ languageOptions: { ...language, hyphenation: e.target.checked } })} />
                    Hyphenation intent
                  </label>
                </>
              );
            })()}
            <p className="adjust-note">Language and direction stay local and preserve authored line breaks.</p>
          </fieldset>
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
          {layer.kind === 'rectangle' && (
            <NumberField
              key={layer.id + 'radius' + (layer.cornerRadius ?? 0)}
              label="Corner radius"
              value={layer.cornerRadius ?? 0}
              min={0}
              max={CORNER_RADIUS_MAX}
              disabled={layerLocked}
              apply={(cornerRadius) => edit({ cornerRadius })}
            />
          )}
          <input
            type="color"
            aria-label="Shape color"
            value={layer.color}
            disabled={layerLocked}
            onChange={(e) => edit({ color: e.target.value })}
          />
          <label title={layer.fill ? undefined : 'An unfilled shape always draws its outline'}>
            <input
              type="checkbox"
              checked={Boolean(shapeOutlineColor(layer))}
              disabled={layerLocked || !layer.fill}
              onChange={(e) => edit({ strokeColor: e.target.checked ? layer.strokeColor ?? '#000000' : undefined })}
            />
            Layer stroke
          </label>
          {shapeOutlineColor(layer) && (
            <>
              <input
                type="color"
                aria-label="Layer stroke color"
                value={shapeOutlineColor(layer)}
                disabled={layerLocked}
                onChange={(e) => edit({ strokeColor: e.target.value })}
              />
              <NumberField
                key={layer.id + 'stroke' + layer.stroke}
                label="Layer stroke width"
                value={layer.stroke}
                min={1}
                max={100}
                disabled={layerLocked}
                apply={(stroke) => edit({ stroke })}
              />
            </>
          )}
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
      </>)}
      {main && (<>
      {layer.kind !== 'raster' && layer.kind !== 'adjustment' && (
        <div className="layer-actions">
          <button onClick={rasterize} disabled={layerLocked}>
            Rasterize layer
          </button>
        </div>
      )}
      </>)}
    </Root>
  );
}
function LayersRoot({ children }: { children: ReactNode }) {
  return (
    <section className="panel layers-panel" aria-label="Layers" data-sidebar-section="layers">
      {children}
    </section>
  );
}
function PartRoot({ children }: { children: ReactNode }) {
  return <div className="layers-panel layers-panel-part">{children}</div>;
}
/**
 * Row menu (right-click, long-press on touch, the row's "⋯" button, or the
 * ContextMenu key / Shift+F10). Actions apply to the selection when it
 * includes the row, otherwise to the row alone.
 */
function LayerRowMenu({
  frame,
  layer,
  ids,
  x,
  y,
  close,
  run,
}: {
  frame: Frame;
  layer: Layer;
  ids: string[];
  x: number;
  y: number;
  close: (restoreFocus: boolean) => void;
  run: (action: RowMenuAction) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const scoped: Frame = { ...frame, active: layer.id, selectedLayerIds: ids };
  const group = layer.groupId ? frame.groups?.find((item) => item.id === layer.groupId) : undefined;
  const locked = layer.locked || Boolean(group?.locked);
  const candidate = clippingCandidateBase(frame, layer);
  const selected = frame.layers.filter((item) => ids.includes(item.id));
  const anyLocked = selected.some(
    (item) => item.locked || Boolean(item.groupId && frame.groups?.find((g) => g.id === item.groupId)?.locked),
  );
  const items: Array<{ action: RowMenuAction; label: string; disabled: boolean; separator?: boolean }> = [
    { action: 'duplicate', label: 'Duplicate', disabled: frame.layers.length + ids.length > MAX_DOCUMENT_LAYERS },
    { action: 'delete', label: ids.length > 1 ? `Delete ${ids.length} layers` : 'Delete', disabled: !planLayerDelete(scoped, ids).ok },
    { action: 'front', label: 'Bring to Front', disabled: !planLayerArrange(scoped, 'front').ok, separator: true },
    { action: 'forward', label: 'Bring Forward', disabled: !planLayerArrange(scoped, 'forward').ok },
    { action: 'backward', label: 'Send Backward', disabled: !planLayerArrange(scoped, 'backward').ok },
    { action: 'back', label: 'Send to Back', disabled: !planLayerArrange(scoped, 'back').ok },
    layer.clippingTo
      ? { action: 'release-clip', label: 'Release Clipping Mask', disabled: locked, separator: true }
      : {
          action: 'clip',
          label: 'Create Clipping Mask',
          disabled:
            !isClippingSourceLayer(layer) ||
            !candidate ||
            locked ||
            !layer.visible ||
            Boolean(candidate && (candidate.locked || !candidate.visible)),
          separator: true,
        },
    {
      action: 'group',
      label: 'Group into Folder',
      disabled: anyLocked || selected.some((item) => item.groupId !== undefined),
    },
    { action: 'rename', label: 'Rename…', disabled: locked, separator: true },
    { action: 'visibility', label: layer.visible ? 'Hide' : 'Show', disabled: Boolean(group?.locked) },
    { action: 'lock', label: layer.locked ? 'Unlock' : 'Lock', disabled: Boolean(group?.locked) },
  ];
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    // Focus the first item once on open; a pointer press outside closes.
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeRef.current(false);
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, []);
  const width = 216,
    height = items.length * 32 + 16;
  const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
  const top = y + height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - height - 8) : y;
  return (
    <div
      ref={menuRef}
      className="layer-row-menu"
      role="menu"
      tabIndex={-1}
      aria-label={`Layer options for ${layer.name || 'Untitled layer'}`}
      style={{ left, top }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close(true);
          return;
        }
        if (event.key === 'Tab') {
          close(false);
          return;
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          event.stopPropagation();
          const buttons = Array.from(
            menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || [],
          );
          if (!buttons.length) return;
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next].focus();
        }
      }}
    >
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className={item.separator ? 'separated' : undefined}
          disabled={item.disabled}
          onClick={() => run(item.action)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
function GroupRow({
  group,
  editGroup,
  selected,
  dropClass = '',
  dragging = false,
  onPointerDown,
  ignoreClick,
}: {
  group: Group;
  editGroup: (id: string, patch: Partial<Group>) => void;
  selected: boolean;
  dropClass?: string;
  dragging?: boolean;
  onPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  ignoreClick?: () => boolean;
}) {
  const action = group.collapsed ? 'Expand' : 'Collapse';
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={(selected ? 'group-row selected' : 'group-row') + (dragging ? ' dragging' : '') + dropClass}
      data-drop-row="group"
      data-group-id={group.id}
      onPointerDown={onPointerDown}
    >
      <button
        className="group-toggle"
        aria-label={`${action} group ${group.name}`}
        aria-expanded={!group.collapsed}
        onClick={() => {
          if (ignoreClick?.()) return;
          editGroup(group.id, { collapsed: !group.collapsed });
        }}
      >
        {onPointerDown && (
          <span
            className="layer-drag-handle"
            data-drag-handle="true"
            aria-hidden="true"
            title="Drag to move the folder (long-press on touch)"
          >
            <GripVertical size={14} />
          </span>
        )}
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
          <BlendModeOptions />
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

/** Blend menu grouped like common editors; values stay stable document ids. */
function BlendModeOptions() {
  return (
    <>
      {BLEND_MODE_GROUPS.map((group) =>
        group.modes.length === 1 ? (
          <option key={group.modes[0].value} value={group.modes[0].value}>
            {group.modes[0].label}
          </option>
        ) : (
          <optgroup key={group.label} label={group.label}>
            {group.modes.map((mode) => (
              <option key={mode.value} value={mode.value}>
                {mode.label}
              </option>
            ))}
          </optgroup>
        ),
      )}
    </>
  );
}

type GlowPatch = {
  color?: string;
  opacity?: number;
  size?: number;
  amount?: number;
  blend?: LayerBlendMode;
  source?: GlowSource;
};

/** Compact shared controls for Outer Glow and Inner Glow. */
function GlowControls({
  name,
  color,
  opacity,
  size,
  amount,
  amountLabel,
  blend,
  source,
  update,
}: {
  name: string;
  color: string;
  opacity: number;
  size: number;
  amount: number;
  amountLabel: 'spread' | 'choke';
  blend: LayerBlendMode;
  source?: GlowSource;
  update: (patch: GlowPatch) => void;
}) {
  return (
    <>
      <div className="layer-position">
        <label className="layer-field">
          Color
          <input
            aria-label={`${name} color`}
            type="color"
            value={color}
            onChange={(event) => update({ color: event.target.value })}
          />
        </label>
        <label className="layer-field">
          Mode
          <select
            aria-label={`${name} blend mode`}
            value={blend}
            onChange={(event) => update({ blend: event.target.value as LayerBlendMode })}
          >
            <BlendModeOptions />
          </select>
        </label>
      </div>
      <label className="layer-field">
        {name} opacity {Math.round(opacity * 100)}%
        <input
          aria-label={`${name} opacity`}
          type="range"
          min="0"
          max="100"
          value={Math.round(opacity * 100)}
          onChange={(event) => update({ opacity: Number(event.target.value) / 100 })}
        />
      </label>
      <label className="layer-field">
        {name} size {Math.round(size)} px
        <input
          aria-label={`${name} size`}
          type="range"
          min="0"
          max={GLOW_MAX_SIZE}
          value={Math.round(size)}
          onChange={(event) => update({ size: Number(event.target.value) })}
        />
      </label>
      <label className="layer-field">
        {name} {amountLabel} {Math.round(amount)}%
        <input
          aria-label={`${name} ${amountLabel}`}
          type="range"
          min="0"
          max="100"
          value={Math.round(amount)}
          onChange={(event) => update({ amount: Number(event.target.value) })}
        />
      </label>
      {source !== undefined && (
        <label className="layer-field">
          Source
          <select
            aria-label={`${name} source`}
            value={source}
            onChange={(event) => update({ source: event.target.value as GlowSource })}
          >
            <option value="edge">Edge</option>
            <option value="center">Center</option>
          </select>
        </label>
      )}
    </>
  );
}

/**
 * Shadow blur falloff. Gaussian is the default for new layers; shadows saved
 * before the option load as Linear (the historical single box pass) so their
 * look is unchanged until the user picks Gaussian.
 */
function ShadowFalloffSelect({
  label,
  value,
  update,
}: {
  label: string;
  value: ShadowFalloff;
  update: (falloff: ShadowFalloff) => void;
}) {
  return (
    <label className="layer-field">
      Falloff
      <select
        aria-label={label}
        value={value}
        onChange={(event) => update(event.target.value as ShadowFalloff)}
      >
        <option value="gaussian">Gaussian</option>
        <option value="box">Linear (legacy)</option>
      </select>
    </label>
  );
}
