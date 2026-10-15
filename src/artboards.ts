import type { Group, Layer, Matrix } from './document.ts';

/**
 * A named viewport inside the document canvas.
 *
 * Artboards never duplicate raster assets. An omitted `layerIds` list keeps
 * legacy full-document rendering; an explicit membership list is rendered
 * through a cloned layer/group tree for isolated viewport export. This keeps
 * project files bounded while preserving source pixels and editable history.
 */
export type Artboard = {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
  locked: boolean;
  /** Optional layer membership for an isolated artboard render/export. */
  layerIds?: string[];
  /** Optional swatch shown by a future artboard viewport; no pixel asset. */
  background?: string;
};

export const MAX_ARTBOARDS = 8;
export const MAX_ARTBOARD_NAME = 120;
export const MAX_ARTBOARD_LAYERS = 32;
export const ARTBOARD_ID = 'artboard';

const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
// Match the document layer-id contract without constraining UUID version so
// imported drafts using v1/v4/v7 identifiers remain compatible.
const layerIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const colorPattern = /^#[a-f\d]{6}$/i;

/**
 * Remove layer membership references that no longer exist after a destructive
 * layer operation.  Omitted membership keeps the legacy full-canvas meaning;
 * an explicit empty list remains explicit so an artboard can intentionally be
 * transparent.  The returned records are cloned for history immutability.
 */
export function sanitizeArtboardLayerMembership(
  artboards: readonly Artboard[] | undefined,
  knownLayerIds: readonly string[],
): Artboard[] | undefined {
  if (artboards === undefined) return undefined;
  const known = new Set(knownLayerIds);
  return artboards.map((artboard) =>
    artboard.layerIds === undefined
      ? { ...artboard }
      : { ...artboard, layerIds: artboard.layerIds.filter((id) => known.has(id)) },
  );
}

/**
 * Update one artboard's visibility without mutating the draft history.
 * At least one viewport must remain visible so the active export target can
 * always resolve to a renderable artboard.
 */
export function setArtboardVisibility(
  artboards: readonly Artboard[],
  id: string,
  visible: boolean,
): Artboard[] {
  if (!artboards.some((artboard) => artboard.id === id))
    throw new Error('The requested artboard does not exist');
  if (!visible && artboards.filter((artboard) => artboard.visible).length <= 1)
    throw new Error('At least one artboard must remain visible');
  return artboards.map((artboard) =>
    artboard.id === id ? { ...artboard, visible } : { ...artboard },
  );
}

const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** Validate one artboard against its containing frame dimensions. */
export function validArtboard(
  value: unknown,
  frameWidth: number,
  frameHeight: number,
  knownLayerIds?: ReadonlySet<string> | readonly string[],
): value is Artboard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Partial<Artboard>;
  const known = knownLayerIds === undefined ? undefined : new Set(knownLayerIds);
  const layerIds = item.layerIds;
  const validMembership =
    layerIds === undefined ||
    (Array.isArray(layerIds) &&
      layerIds.length <= MAX_ARTBOARD_LAYERS &&
      new Set(layerIds).size === layerIds.length &&
      layerIds.every(
        (layerId) =>
          typeof layerId === 'string' &&
          layerIdPattern.test(layerId) &&
          (known === undefined || known.has(layerId)),
      ));
  return (
    typeof item.id === 'string' && idPattern.test(item.id) &&
    typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= MAX_ARTBOARD_NAME &&
    integer(item.x, 0, frameWidth - 1) && integer(item.y, 0, frameHeight - 1) &&
    integer(item.w, 1, frameWidth) && integer(item.h, 1, frameHeight) &&
    Number(item.x) + Number(item.w) <= frameWidth &&
    Number(item.y) + Number(item.h) <= frameHeight &&
    typeof item.visible === 'boolean' && typeof item.locked === 'boolean' &&
    validMembership &&
    (item.background === undefined || (typeof item.background === 'string' && colorPattern.test(item.background)))
  );
}

/** Validate the bounded named viewport collection and its active pointer. */
export function validArtboards(
  value: unknown,
  frameWidth: number,
  frameHeight: number,
  activeId?: unknown,
  knownLayerIds?: ReadonlySet<string> | readonly string[],
): value is Artboard[] {
  if (!Array.isArray(value) || value.length > MAX_ARTBOARDS) return false;
  const ids = new Set<string>();
  for (const item of value) {
    if (!validArtboard(item, frameWidth, frameHeight, knownLayerIds) || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return activeId === undefined || (typeof activeId === 'string' && ids.has(activeId));
}

/** Return a deterministic virtual canvas artboard for legacy frames. */
export function effectiveArtboards(
  frameWidth: number,
  frameHeight: number,
  artboards?: Artboard[],
): Artboard[] {
  if (artboards?.length)
    return artboards.map((item) => ({
      ...item,
      ...(item.layerIds ? { layerIds: [...item.layerIds] } : {}),
    }));
  return [{
    id: `${ARTBOARD_ID}-canvas`,
    name: 'Canvas',
    x: 0,
    y: 0,
    w: frameWidth,
    h: frameHeight,
    visible: true,
    locked: true,
  }];
}

export type ArtboardRequest = Partial<Pick<Artboard, 'id' | 'name' | 'x' | 'y' | 'w' | 'h' | 'visible' | 'locked' | 'background' | 'layerIds'>> &
  Pick<Artboard, 'name' | 'w' | 'h'>;

/** Build a validated viewport record without allocating any pixel buffer. */
export function createArtboard(
  request: ArtboardRequest,
  frameWidth: number,
  frameHeight: number,
): Artboard {
  const item: Artboard = {
    id: request.id || `${ARTBOARD_ID}-${Math.random().toString(36).slice(2, 10)}`,
    name: request.name,
    x: request.x ?? 0,
    y: request.y ?? 0,
    w: request.w,
    h: request.h,
    visible: request.visible ?? true,
    locked: request.locked ?? false,
    ...(request.layerIds ? { layerIds: [...request.layerIds] } : {}),
    ...(request.background ? { background: request.background } : {}),
  };
  if (!validArtboard(item, frameWidth, frameHeight))
    throw new Error('Artboard bounds or metadata are invalid');
  return item;
}

export type ArtboardLayerPlan = {
  layers: Layer[];
  groups: Group[];
};

/**
 * Return a deep-cloned layer tree for one artboard.
 *
 * Omitted membership is the legacy/full-canvas contract. An explicit empty
 * list intentionally produces a transparent artboard. Groups are retained
 * only when at least one selected member references them, preserving isolated
 * folder compositing without leaking unrelated siblings into the render.
 */
export function artboardLayers(
  frame: { layers: Layer[]; groups?: Group[] },
  artboard: Pick<Artboard, 'layerIds'>,
): ArtboardLayerPlan {
  const layerIds = artboard.layerIds;
  const selected =
    layerIds === undefined
      ? frame.layers
      : Array.isArray(layerIds)
        ? frame.layers.filter((layer) => layerIds.includes(layer.id))
        : [];
  const layers = structuredClone(selected);
  const groupIds = new Set(
    layers.flatMap((layer) => (layer.groupId ? [layer.groupId] : [])),
  );
  const groups = structuredClone(
    (frame.groups ?? []).filter((group) => groupIds.has(group.id)),
  );
  return { layers, groups };
}

/** Apply an affine frame transform to viewport bounds without touching assets. */
export function transformArtboard(
  artboard: Artboard,
  matrix: Matrix,
  frameWidth: number,
  frameHeight: number,
): Artboard {
  const points = [
    [artboard.x, artboard.y],
    [artboard.x + artboard.w, artboard.y],
    [artboard.x, artboard.y + artboard.h],
    [artboard.x + artboard.w, artboard.y + artboard.h],
  ].map(([x, y]) => ({
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5],
  }));
  const left = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const top = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const right = Math.min(frameWidth, Math.ceil(Math.max(...points.map((point) => point.x))));
  const bottom = Math.min(frameHeight, Math.ceil(Math.max(...points.map((point) => point.y))));
  if (right <= left || bottom <= top)
    throw new Error('Artboard is outside the transformed canvas');
  return { ...artboard, x: left, y: top, w: right - left, h: bottom - top };
}
