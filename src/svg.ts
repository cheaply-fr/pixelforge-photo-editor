/**
 * Bounded, local-only SVG import preparation.
 *
 * PixelForge rasterizes SVG into an editable raster layer.  Passing the
 * original markup directly to an image decoder would allow embedded network
 * references, scripts, event handlers, or foreign documents to escape the
 * local-only import contract.  This module intentionally accepts a small,
 * conservative SVG subset and returns the original bytes only after the
 * safety and resource checks pass.  It does not attempt to preserve vector
 * editability or provide a general XML parser.
 */

export const SVG_MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const SVG_MAX_ELEMENTS = 20_000;
export const SVG_MAX_DIMENSION = 16_000;
export const SVG_MAX_PIXELS = 16_000_000;

export type SvgImportInfo = {
  markup: string;
  width?: number;
  height?: number;
  viewBox?: [number, number, number, number];
};

function fail(message: string): never {
  throw new Error(message);
}

function finitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > SVG_MAX_DIMENSION)
    fail(`SVG ${label} is outside the supported range.`);
  return value;
}

function parseLength(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  // Percentages and viewport-relative units require layout context that is
  // intentionally outside this flattened local import contract.
  const match = /^([+]?(?:\d+(?:\.\d*)?|\.\d+))(?:px)?$/i.exec(trimmed);
  if (!match) fail(`SVG ${label} must use a bounded pixel length.`);
  return finitePositive(Number(match[1]), label);
}

function parseViewBox(value: string | undefined): [number, number, number, number] | undefined {
  if (value === undefined) return undefined;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item)))
    fail('SVG viewBox is malformed.');
  const [x, y, width, height] = parts;
  finitePositive(width, 'viewBox width');
  finitePositive(height, 'viewBox height');
  if (Math.abs(x) > SVG_MAX_DIMENSION * 4 || Math.abs(y) > SVG_MAX_DIMENSION * 4)
    fail('SVG viewBox origin is outside the supported range.');
  return [x, y, width, height];
}

function rootAttributes(openTag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const source = openTag.replace(/^<svg\b/i, '').replace(/>\s*$/, '');
  const attributePattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = attributePattern.exec(source))) {
    const between = source.slice(consumed, match.index);
    if (between.trim()) fail('SVG root attributes are malformed.');
    const name = match[1].toLowerCase();
    if (attributes.has(name)) fail(`SVG root attribute ${name} is duplicated.`);
    attributes.set(name, match[2] ?? match[3] ?? '');
    consumed = attributePattern.lastIndex;
  }
  if (source.slice(consumed).replace(/\s*\/\s*$/, '').trim())
    fail('SVG root attributes are malformed.');
  return attributes;
}

function rejectUnsafeMarkup(markup: string): void {
  const lowered = markup.toLowerCase();
  if (lowered.includes('\u0000')) fail('SVG contains a NUL byte.');
  if (/<\s*!doctype\b|<\s*!entity\b|<\s*\?xml-stylesheet\b/.test(lowered))
    fail('SVG document declarations are not supported.');
  for (const tag of ['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video', 'link', 'style']) {
    if (new RegExp(`<\\s*${tag}\\b`, 'i').test(markup))
      fail(`SVG ${tag} elements are not allowed for local import.`);
  }
  if (/<\s*\/\s*script\s*>/i.test(markup)) fail('SVG scripts are not allowed.');
  if (/\son[a-z0-9_:.:-]*\s*=\s*(?:"[^"]*"|'[^']*')/i.test(markup))
    fail('SVG event handlers are not allowed.');
  if (/(?:javascript|vbscript)\s*:/i.test(markup))
    fail('SVG script URLs are not allowed.');
  if (/\bsrc\s*=\s*(?:"[^"]*"|'[^']*')/i.test(markup))
    fail('SVG source URLs are not allowed.');
  if (/@import\b/i.test(markup)) fail('SVG stylesheet imports are not allowed.');
  const urlFunctions = markup.match(/url\s*\(\s*([^)]*)\)/gi) || [];
  for (const expression of urlFunctions) {
    const value = expression.replace(/^url\s*\(\s*/i, '').replace(/\s*\)$/i, '').trim();
    if (!/^#[A-Za-z_][\w:.-]*$/.test(value))
      fail('SVG resource URLs must reference local fragment IDs.');
  }
  const references = markup.match(/(?:xlink:)?href\s*=\s*(?:"[^"]*"|'[^']*')/gi) || [];
  for (const reference of references) {
    const value = reference.replace(/^[^=]+=/, '').trim().slice(1, -1).trim();
    if (!/^#[A-Za-z_][\w:.-]*$/.test(value))
      fail('SVG href values must reference local fragment IDs.');
  }
}

/** Validate and bound an SVG string before creating a browser object URL. */
export function prepareSvgImport(markup: string): SvgImportInfo {
  if (typeof markup !== 'string' || !markup.trim()) fail('SVG document is empty.');
  if (new TextEncoder().encode(markup).byteLength > SVG_MAX_INPUT_BYTES)
    fail('SVG file exceeds the 8 MB safety limit.');
  const normalized = markup.replace(/^\uFEFF/, '').trim();
  rejectUnsafeMarkup(normalized);
  const open = normalized.match(/<svg\b[^>]*>/i);
  if (!open || normalized.indexOf(open[0]) !== normalized.search(/<svg\b/i))
    fail('SVG root element is missing.');
  if (!/<\/svg\s*>\s*$/i.test(normalized)) fail('SVG root element is not closed.');
  const tags = normalized.match(/<\s*[A-Za-z][^>]*>/g) || [];
  if (!tags.length || tags.length > SVG_MAX_ELEMENTS)
    fail('SVG contains too many elements.');
  const attributes = rootAttributes(open[0]);
  const width = parseLength(attributes.get('width'), 'width');
  const height = parseLength(attributes.get('height'), 'height');
  const viewBox = parseViewBox(attributes.get('viewbox'));
  if (width === undefined && height === undefined && !viewBox)
    fail('SVG must declare pixel dimensions or a viewBox.');
  if (width !== undefined && height !== undefined && width * height > SVG_MAX_PIXELS)
    fail('SVG exceeds the 16 megapixel safety limit.');
  if (viewBox && viewBox[2] * viewBox[3] > SVG_MAX_PIXELS)
    fail('SVG viewBox exceeds the 16 megapixel safety limit.');
  return { markup: normalized, ...(width === undefined ? {} : { width }), ...(height === undefined ? {} : { height }), ...(viewBox ? { viewBox } : {}) };
}

/** Decode UTF-8 SVG bytes and apply the same bounded local-only contract. */
export function prepareSvgBytes(input: Uint8Array): SvgImportInfo {
  if (!(input instanceof Uint8Array) || input.byteLength > SVG_MAX_INPUT_BYTES)
    fail('SVG file exceeds the 8 MB safety limit.');
  let markup: string;
  try {
    markup = new TextDecoder('utf-8', { fatal: true }).decode(input);
  } catch {
    fail('SVG must be valid UTF-8.');
  }
  return prepareSvgImport(markup);
}
