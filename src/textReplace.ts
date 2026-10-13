import type { Frame, Layer } from './document';

export type TextReplaceOptions = {
  find: string;
  replace: string;
  matchCase?: boolean;
  wholeWord?: boolean;
};

export type TextReplaceResult = {
  frame: Frame;
  replacements: number;
  layersChanged: number;
};

/**
 * Replace text only in editable text layers. The frame and its layers remain
 * immutable, making the result safe to commit as one undoable edit.
 */
export function replaceTextLayers(
  frame: Frame,
  options: TextReplaceOptions,
): TextReplaceResult {
  const find = options.find;
  if (!find) return { frame, replacements: 0, layersChanged: 0 };
  const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const source = options.wholeWord ? `\\b${escaped}\\b` : escaped;
  const expression = new RegExp(source, options.matchCase ? 'g' : 'gi');
  let replacements = 0;
  let layersChanged = 0;
  const layers = frame.layers.map((layer): Layer => {
    if (layer.kind !== 'text') return layer;
    const matches = layer.text.match(expression);
    if (!matches?.length) return layer;
    replacements += matches.length;
    layersChanged += 1;
    return { ...layer, text: layer.text.replace(expression, options.replace) };
  });
  return {
    frame: layersChanged ? { ...frame, layers } : frame,
    replacements,
    layersChanged,
  };
}
