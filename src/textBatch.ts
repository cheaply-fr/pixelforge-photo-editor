import { FONTS, type Frame } from './document.ts';

export type TextBatchPatch = {
  fontFamily?: (typeof FONTS)[number];
  fontSize?: number;
  bold?: boolean;
};

export function updateAllTextLayers(frame: Frame, patch: TextBatchPatch): { frame: Frame; updated: number } {
  if (patch.fontFamily !== undefined && !FONTS.includes(patch.fontFamily)) throw new Error('Unsupported text font');
  if (patch.fontSize !== undefined && (!Number.isFinite(patch.fontSize) || patch.fontSize < 1 || patch.fontSize > 1000)) throw new Error('Text size must be between 1 and 1000 pixels');
  if (patch.bold !== undefined && typeof patch.bold !== 'boolean') throw new Error('Bold must be a boolean');
  let updated = 0;
  const layers = frame.layers.map((layer) => {
    if (layer.kind !== 'text') return layer;
    updated += 1;
    return { ...layer, ...patch };
  });
  return { frame: updated ? { ...frame, layers } : frame, updated };
}
