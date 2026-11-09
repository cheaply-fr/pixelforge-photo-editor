import type { Frame, Layer } from './document';
import { layerRuns, replaceRange, richRecord, runStyleAt } from './richText.ts';

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

type TextLayer = Extract<Layer, { kind: 'text' }>;

/** Replace every match literally while keeping each match's character style. */
export function replaceWithRuns(layer: TextLayer, expression: RegExp, replacement: string): TextLayer {
  const matches: { index: number; length: number }[] = [];
  const global = new RegExp(expression.source, expression.flags.includes('g') ? expression.flags : expression.flags + 'g');
  for (let match = global.exec(layer.text); match; match = global.exec(layer.text)) {
    if (!match[0].length) { global.lastIndex++; continue; }
    matches.push({ index: match.index, length: match[0].length });
  }
  if (!matches.length) return layer;
  let text = layer.text;
  let runs = layerRuns(layer);
  for (const match of matches.reverse()) {
    const style = runStyleAt(runs, match.index);
    const next = text.slice(0, match.index) + replacement + text.slice(match.index + match.length);
    runs = replaceRange(runs, text.length, match.index, match.index + match.length, replacement.length, style);
    text = next;
  }
  const rich = richRecord(runs, text.length);
  const { rich: _old, ...rest } = layer;
  return rich ? { ...rest, text, rich } : { ...rest, text };
}

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
    // Character-style runs follow the edit; replacements take the style of
    // the text they replace (see richText.remapRuns).
    return replaceWithRuns(layer, expression, options.replace);
  });
  return {
    frame: layersChanged ? { ...frame, layers } : frame,
    replacements,
    layersChanged,
  };
}
