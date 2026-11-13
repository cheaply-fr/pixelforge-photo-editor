// A saved draft shaped like a real large painting, written straight into the
// editor's own draft store (format 4: tiled assets, docs/draft-storage-contract.md)
// so reopen benchmarks and tests do not spend minutes building it through the
// UI. Layers are tiled like layers painted in the editor (empty tiles are
// omitted), and carry the expensive local stages a night-sky painting uses:
// Clouds layers, Smart Filter stacks under Emboss / Motion Blur, Light Rays,
// Wave, Gaussian blurs, an Outer Glow, masks, clipping and blend modes.
import { expect, type Page } from '@playwright/test';

export type PaintingLayerSpec = {
  name: string;
  /** What the layer's pixels look like. */
  content: 'empty' | 'sky' | 'band' | 'stars' | 'blobs';
  filter?: string;
  smart?: string[];
  blend?: string;
  opacity?: number;
  outerGlow?: boolean;
  mask?: boolean;
  maskInverted?: boolean;
  /** Clip to the layer directly below. */
  clip?: boolean;
  /** Frame-space adjustments (CSS blur, levels, …) merged over neutral. */
  adjust?: Record<string, unknown>;
};

/** Filter effect objects as the editor's Filter menu creates them. */
export const PAINTING_FILTERS: Record<string, Record<string, unknown>> = {
  clouds: { type: 'clouds', amount: 85, radius: 16, angle: 0, centerX: 0.5, centerY: 0.5, seed: 0, cloudRender: { foreground: '#3b4c8f', background: '#ffffff', scale: 662, fill: true } },
  'motion-blur': { type: 'motion-blur', amount: 70, radius: 6, angle: 0, centerX: 0.5, centerY: 0.5, seed: 0 },
  emboss: { type: 'emboss', amount: 70, radius: 6, angle: 0, centerX: 0.5, centerY: 0.5, seed: 0 },
  wave: { type: 'wave', amount: 70, radius: 12, angle: 0, centerX: 0.5, centerY: 0.5, seed: 0 },
  'light-rays': {
    type: 'light-rays', amount: 100, radius: 1, angle: 0, centerX: 0.5, centerY: 0.5, seed: 0,
    lightRays: { mode: 'generate', shape: 'rays', count: 48, length: 80, width: 3, sharpness: 60, randomness: 45, rotation: 0, innerRadius: 0, falloff: 50, color: '#ffe3a3', intensity: 100, blend: 'transparent', threshold: 170 },
  },
  'gaussian-blur': { type: 'gaussian-blur', amount: 85, radius: 6, angle: 0, centerX: 0.5, centerY: 0.5, seed: 0 },
};

/**
 * The layer stack of the reported 89-layer night-sky painting (bottom first):
 * the slow layers sit at the same indices, the rest are star-field strokes,
 * glows and blurred washes with screen/multiply/overlay blends, masks and
 * clipping.
 */
export function nightSkyPainting(count = 89): PaintingLayerSpec[] {
  const fixed: Record<number, PaintingLayerSpec> = {
    0: { name: 'Sky', content: 'sky' },
    1: { name: 'Sky glow', content: 'blobs', filter: 'gaussian-blur', blend: 'screen' },
    2: { name: 'Horizon haze', content: 'band', filter: 'gaussian-blur', blend: 'overlay', opacity: 0.8 },
    3: { name: 'Milky Way', content: 'empty', filter: 'clouds', blend: 'screen', opacity: 0.6 },
    4: { name: 'Milky Way dust', content: 'empty', filter: 'clouds', blend: 'multiply', opacity: 0.5 },
    5: { name: 'Dust lanes', content: 'empty', filter: 'clouds', blend: 'overlay', opacity: 0.5, mask: true },
    6: { name: 'Milky Way grain', content: 'stars', filter: 'motion-blur', smart: ['clouds'], blend: 'screen' },
    39: { name: 'Mountains far', content: 'band', filter: 'emboss', smart: ['clouds'] },
    40: { name: 'Mountains near L', content: 'band', filter: 'emboss', smart: ['clouds'], mask: true },
    41: { name: 'Mountains near R', content: 'band', filter: 'emboss', smart: ['clouds'] },
    46: { name: 'Plain', content: 'band', filter: 'motion-blur', smart: ['clouds'] },
    48: { name: 'Plain sand', content: 'band', filter: 'emboss', smart: ['clouds', 'motion-blur'], blend: 'multiply' },
    49: { name: 'Foreground rock', content: 'blobs', filter: 'emboss', smart: ['clouds'] },
    51: { name: 'Lid flare', content: 'empty', filter: 'light-rays', blend: 'screen' },
    52: { name: 'Smoke wisps', content: 'blobs', filter: 'wave', smart: ['gaussian-blur'], blend: 'screen', opacity: 0.7 },
    53: { name: 'Ground lights', content: 'stars', outerGlow: true },
  };
  const blends = ['source-over', 'screen', 'source-over', 'multiply', 'overlay', 'source-over'];
  return Array.from({ length: count }, (_, index) => fixed[index] ?? {
    name: `Stars ${index}`,
    content: index % 7 === 3 ? 'blobs' : 'stars',
    filter: index % 4 === 1 ? 'gaussian-blur' : undefined,
    blend: blends[index % blends.length],
    opacity: index % 5 === 0 ? 0.75 : 1,
    mask: index % 11 === 8 || index % 17 === 5,
    maskInverted: index % 17 === 5,
    clip: index % 13 === 10 && !fixed[index - 1],
    // Soft CSS blurs and tonal corrections, as on a painted glow or haze.
    adjust: index % 9 === 2 ? { blur: 3 } : index % 10 === 7 ? { levelsGamma: 1.3, levelsWhite: 230 } : undefined,
  });
}

const canvas = (page: Page) => page.getByTestId('editor-canvas');

/**
 * Replace the current (saved) draft of `page` with a generated painting and
 * return its id. The page must be on /editor with a saved draft.
 */
export async function seedPainting(page: Page, w: number, h: number, layers: PaintingLayerSpec[]): Promise<string> {
  await expect(page.getByRole('status', { name: 'Draft save status' })).toHaveText('Saved on this device', { timeout: 120_000 });
  const id = new URL(page.url()).hash.match(/^#draft=([a-f0-9-]{36})$/)?.[1];
  expect(id).toBeTruthy();
  await expect(canvas(page)).toHaveAttribute('data-rendering', 'false', { timeout: 120_000 });
  await page.evaluate(async ({ draftId, w, h, layers, filters }) => {
    const open = () => new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('pixelforge-documents');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    const database = await open();
    const pointer = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const read = database.transaction('drafts').objectStore('drafts').get(draftId);
      read.onsuccess = () => resolve(read.result);
      read.onerror = () => reject(read.error);
    });
    const template = (pointer.history as Array<{ layers: Array<Record<string, unknown>> }>)[pointer.index as number].layers[0];
    const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
    const tileRecords = new Map<string, Blob>();
    const tileRefs: Record<string, string> = {};
    const assetRefs: Record<string, unknown> = {};
    const T = 256, cols = Math.ceil(w / T), rows = Math.ceil(h / T);
    const work = new OffscreenCanvas(w, h), context = work.getContext('2d', { willReadFrequently: true })!;
    const tileCanvas = new OffscreenCanvas(T, T), tileContext = tileCanvas.getContext('2d')!;
    /** Store the work canvas as a tiled asset (transparent tiles omitted). */
    const addTiled = async (assetId: string) => {
      const pixels = context.getImageData(0, 0, w, h).data;
      const tiles: (string | null)[] = [];
      for (let r = 0; r < rows; r += 1)
        for (let c = 0; c < cols; c += 1) {
          const tw = Math.min(T, w - c * T), th = Math.min(T, h - r * T);
          let empty = true;
          for (let y = r * T; y < r * T + th && empty; y += 1)
            for (let x = c * T; x < c * T + tw; x += 1)
              if (pixels[(y * w + x) * 4 + 3] !== 0) { empty = false; break; }
          if (empty) { tiles.push(null); continue; }
          tileCanvas.width = tw;
          tileCanvas.height = th;
          tileContext.clearRect(0, 0, tw, th);
          tileContext.drawImage(work, c * T, r * T, tw, th, 0, 0, tw, th);
          const blob = await tileCanvas.convertToBlob({ type: 'image/png' });
          const hash = hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
          const key = hash.slice(0, 32);
          tileRecords.set(hash, blob);
          tileRefs[key] = hash;
          tiles.push(key);
        }
      assetRefs[assetId] = { w, h, tileSize: 256, tiles };
    };
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const paint = (content: string, index: number) => {
      context.clearRect(0, 0, w, h);
      seed = index * 7919 + 17;
      if (content === 'sky') {
        const gradient = context.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, '#05081a');
        gradient.addColorStop(0.6, '#1d2a5a');
        gradient.addColorStop(1, '#6b4a6e');
        context.fillStyle = gradient;
        context.fillRect(0, 0, w, h);
      } else if (content === 'band') {
        const top = h * (0.55 + 0.3 * rnd());
        context.fillStyle = `hsl(${Math.floor(rnd() * 360)},35%,${20 + Math.floor(rnd() * 30)}%)`;
        context.beginPath();
        context.moveTo(0, h);
        for (let x = 0; x <= w; x += w / 24) context.lineTo(x, top + (rnd() - 0.5) * h * 0.12);
        context.lineTo(w, h);
        context.fill();
      } else if (content === 'stars') {
        // Brush-stroke stars in one region, like a star-field brush pass.
        const cx = rnd() * w, cy = rnd() * h * 0.6, spread = w * (0.08 + rnd() * 0.12);
        for (let k = 0; k < 140; k += 1) {
          context.fillStyle = `hsla(${200 + Math.floor(rnd() * 60)},80%,${70 + Math.floor(rnd() * 30)}%,${0.5 + rnd() * 0.5})`;
          context.beginPath();
          context.arc(cx + (rnd() - 0.5) * spread * 2, cy + (rnd() - 0.5) * spread * 2, 1 + rnd() * 5, 0, Math.PI * 2);
          context.fill();
        }
      } else if (content === 'blobs') {
        for (let k = 0; k < 3; k += 1) {
          context.fillStyle = `hsla(${Math.floor(rnd() * 360)},70%,55%,0.5)`;
          context.beginPath();
          context.arc(rnd() * w, rnd() * h, 40 + rnd() * w * 0.12, 0, Math.PI * 2);
          context.fill();
        }
      }
    };
    // Draft ids are UUID-shaped (validId); deterministic ones keep keys stable.
    const uuid = (kind: number, index: number) => `${kind}0000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
    const frameLayers: Array<Record<string, unknown>> = [];
    for (const [index, spec] of layers.entries()) {
      const assetId = uuid(1, index);
      paint(spec.content, index);
      await addTiled(assetId);
      const layer: Record<string, unknown> = structuredClone(template);
      delete layer.background;
      layer.id = uuid(2, index);
      layer.name = spec.name;
      layer.asset = assetId;
      layer.blend = spec.blend ?? 'source-over';
      layer.opacity = spec.opacity ?? 1;
      if (index === 0) layer.background = true;
      const adjustments = layer.adjustments as Record<string, unknown>;
      if (spec.adjust) Object.assign(adjustments, spec.adjust);
      if (spec.filter) adjustments.filterEffects = structuredClone(filters[spec.filter]);
      if (spec.smart?.length) layer.smartFilters = spec.smart.map((type) => structuredClone(filters[type]));
      if (spec.outerGlow) {
        const styles = layer.styles as Record<string, Record<string, unknown>>;
        styles.outerGlow = { ...styles.outerGlow, enabled: true, size: 24, color: '#ffd27a' };
      }
      if (spec.mask) {
        const maskId = uuid(3, index);
        context.clearRect(0, 0, w, h);
        const gradient = context.createLinearGradient(0, 0, w, h);
        gradient.addColorStop(0, 'rgba(0,0,0,1)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.15)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, w, h);
        await addTiled(maskId);
        layer.mask = maskId;
        layer.maskEnabled = true;
        if (spec.maskInverted) layer.maskInverted = true;
      }
      if (spec.clip && index > 0) layer.clippingTo = uuid(2, index - 1);
      frameLayers.push(layer);
    }
    const top = frameLayers[frameLayers.length - 1].id as string;
    const frame = { w, h, layers: frameLayers, active: top, selectedLayerIds: [top], imageSize: { resolution: 72, resolutionUnit: 'ppi' } };
    const revision = (pointer.localRevision as number) + 1;
    const next = {
      ...pointer,
      history: [frame],
      index: 0,
      localRevision: revision,
      format: 4,
      assetRefs,
      tileRefs,
      savedAt: new Date().toISOString(),
    };
    await new Promise<void>((resolve, reject) => {
      const write = database.transaction(['drafts', 'draftBlobs'], 'readwrite');
      const blobs = write.objectStore('draftBlobs');
      blobs.delete(IDBKeyRange.bound(`asset:${draftId}:`, `asset:${draftId}:￿`));
      for (const [hash, blob] of tileRecords)
        blobs.put({ kind: 'pixelforge-draft-tile', hash, blob }, `asset:${draftId}:${hash}`);
      write.objectStore('drafts').put(next, draftId);
      write.oncomplete = () => resolve();
      write.onerror = () => reject(write.error);
      write.onabort = () => reject(write.error);
    });
    database.close();
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('pixelforge:pending-draft:')) sessionStorage.removeItem(key);
  }, { draftId: id!, w, h, layers, filters: PAINTING_FILTERS });
  return id!;
}

/** Diagnostics marks recorded since the page loaded. */
export const marks = (page: Page, name: string) =>
  page.evaluate((markName) =>
    (performance.getEntriesByName(markName, 'mark') as PerformanceMark[]).map((mark) => ({ at: Math.round(mark.startTime), detail: mark.detail })), name);

/** SHA-256 of every composite byte (byte identity), plus a few samples for readable failures. */
export const compositeChecksum = (page: Page) =>
  canvas(page).evaluate(async (element: HTMLCanvasElement) => {
    const data = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    const digest = await crypto.subtle.digest('SHA-256', data);
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const at = (x: number, y: number) => Array.from(data.slice((y * element.width + x) * 4, (y * element.width + x) * 4 + 4));
    const w = element.width, h = element.height;
    return { w, h, sha256, samples: [at(10, 10), at(w >> 1, h >> 1), at(w - 1, h - 1), at(w >> 2, (h * 3) >> 2)] };
  });

type StoreEntry = { id: string; bytes: number; tag?: string };

/** Entries of the on-device layer store (never creates the database). */
export const layerStoreEntries = (page: Page) =>
  page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((database) => database.name === 'pixelforge-layer-cache')) return [];
    return new Promise<StoreEntry[]>((resolve) => {
      const opening = indexedDB.open('pixelforge-layer-cache');
      opening.onerror = () => resolve([]);
      opening.onsuccess = () => {
        const database = opening.result;
        if (!database.objectStoreNames.contains('meta')) {
          database.close();
          resolve([]);
          return;
        }
        const all = database.transaction('meta', 'readonly').objectStore('meta').getAll();
        all.onsuccess = () => {
          database.close();
          resolve(all.result as StoreEntry[]);
        };
        all.onerror = () => resolve([]);
      };
    });
  });

/** Remove the saved draft preview (the entry tagged with a composite key). */
export const dropDraftPreview = (page: Page) =>
  page.evaluate(() => new Promise<number>((resolve) => {
    const opening = indexedDB.open('pixelforge-layer-cache');
    opening.onerror = () => resolve(0);
    opening.onsuccess = () => {
      const database = opening.result, write = database.transaction(['meta', 'blobs'], 'readwrite');
      const all = write.objectStore('meta').getAll();
      let dropped = 0;
      all.onsuccess = () => {
        for (const meta of all.result as StoreEntry[])
          if (meta.tag && !meta.tag.startsWith('placed:')) {
            write.objectStore('meta').delete(meta.id);
            write.objectStore('blobs').delete(meta.id);
            dropped += 1;
          }
      };
      write.oncomplete = () => {
        database.close();
        resolve(dropped);
      };
      write.onerror = () => resolve(0);
    };
  }));
