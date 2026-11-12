/**
 * SVG import as editable layers.
 *
 * `planSvgImport` reads markup that already passed `prepareSvgImport` and
 * turns each shape into an editable vector path layer and each simple text
 * element into a text layer. Top-level <g> elements become layer groups.
 * Anything this converter cannot reproduce faithfully (gradients, patterns,
 * clip paths, masks, filters, <use>, embedded images, dashes, markers, ...)
 * is kept as a "raster item": a small standalone SVG the browser rasterizes
 * into a pixel layer at the same position in the stack. So every SVG still
 * looks right, and everything that can be edited as vectors is.
 *
 * This module is pure (no DOM), so it runs in Node tests.
 */
import { commonLayer, type Group, type Layer, type Matrix } from './document.ts';
import { isFontFamilyName } from './fontLibrary.ts';
import {
  PATH_MAX_CONTOURS,
  PATH_MAX_COORDINATE,
  PATH_MAX_NODES,
  transformPath,
  validatePath,
  type PathContour,
  type PathLineCap,
  type PathLineJoin,
  type PathModel,
  type PathNode,
} from './paths.ts';

// ------------------------------------------------------------------ XML

export type SvgElement = {
  name: string;
  attrs: Record<string, string>;
  children: SvgElement[];
  /** Text and child elements in document order (for <text>). */
  content: Array<string | SvgElement>;
  start: number;
  end: number;
  parent?: SvgElement;
};

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const point = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const fail = (message: string): never => {
  throw new Error(message);
};

/** Parse SVG markup into an element tree. Throws on malformed nesting. */
export function parseSvgXml(markup: string): SvgElement {
  let root: SvgElement | undefined;
  const stack: SvgElement[] = [];
  const n = markup.length;
  let i = 0;
  const appendText = (text: string) => {
    const top = stack[stack.length - 1];
    if (top && text) top.content.push(text);
  };
  while (i < n) {
    const lt = markup.indexOf('<', i);
    if (lt < 0) {
      appendText(decodeEntities(markup.slice(i)));
      break;
    }
    if (lt > i) appendText(decodeEntities(markup.slice(i, lt)));
    if (markup.startsWith('<!--', lt)) {
      const end = markup.indexOf('-->', lt + 4);
      if (end < 0) fail('SVG comment is not closed.');
      i = end + 3;
      continue;
    }
    if (markup.startsWith('<![CDATA[', lt)) {
      const end = markup.indexOf(']]>', lt + 9);
      if (end < 0) fail('SVG CDATA section is not closed.');
      appendText(markup.slice(lt + 9, end));
      i = end + 3;
      continue;
    }
    if (markup.startsWith('<?', lt)) {
      const end = markup.indexOf('?>', lt + 2);
      if (end < 0) fail('SVG processing instruction is not closed.');
      i = end + 2;
      continue;
    }
    if (markup.startsWith('<!', lt)) {
      const end = markup.indexOf('>', lt + 2);
      if (end < 0) fail('SVG declaration is not closed.');
      i = end + 1;
      continue;
    }
    if (markup.startsWith('</', lt)) {
      const end = markup.indexOf('>', lt + 2);
      if (end < 0) fail('SVG closing tag is malformed.');
      const name = markup.slice(lt + 2, end).trim().replace(/^svg:/, '');
      const top = stack.pop();
      if (!top || top.name !== name) fail(`SVG closing tag </${name}> does not match.`);
      top!.end = end + 1;
      i = end + 1;
      continue;
    }
    let j = lt + 1;
    let quote = '';
    for (; j < n; j++) {
      const c = markup[j];
      if (quote) {
        if (c === quote) quote = '';
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (j >= n) fail('SVG tag is not closed.');
    let inner = markup.slice(lt + 1, j);
    const selfClosing = /\/\s*$/.test(inner);
    if (selfClosing) inner = inner.replace(/\/\s*$/, '');
    const nameMatch = /^([A-Za-z_][\w:.-]*)/.exec(inner);
    if (!nameMatch) fail('SVG tag name is malformed.');
    const name = nameMatch![1].replace(/^svg:/, '');
    const attrs: Record<string, string> = {};
    const attributePattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match: RegExpExecArray | null;
    const rest = inner.slice(nameMatch![1].length);
    while ((match = attributePattern.exec(rest))) attrs[match[1]] = decodeEntities(match[2] ?? match[3] ?? '');
    const parent = stack[stack.length - 1];
    const element: SvgElement = { name, attrs, children: [], content: [], start: lt, end: j + 1, parent };
    if (parent) {
      parent.children.push(element);
      parent.content.push(element);
    } else if (!root) root = element;
    else fail('SVG has more than one root element.');
    if (!selfClosing) stack.push(element);
    i = j + 1;
  }
  if (stack.length) fail('SVG element is not closed.');
  if (!root || root.name !== 'svg') fail('SVG root element is missing.');
  return root!;
}

// ------------------------------------------------------------------ CSS

type CssRule = {
  tag?: string;
  classes: string[];
  id?: string;
  specificity: number;
  order: number;
  declarations: Record<string, string>;
};

function parseDeclarations(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of text.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).replace(/!important/i, '').trim();
    if (key && value) out[key] = value;
  }
  return out;
}

/** Simple stylesheet support: tag, .class, #id and compound selectors. */
export function parseStylesheet(text: string): CssRule[] {
  const rules: CssRule[] = [];
  const source = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  let order = 0;
  while (i < source.length) {
    const open = source.indexOf('{', i);
    if (open < 0) break;
    const selectorText = source.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    for (; j < source.length && depth; j++) {
      if (source[j] === '{') depth++;
      else if (source[j] === '}') depth--;
    }
    const body = source.slice(open + 1, j - 1);
    i = j;
    if (selectorText.startsWith('@')) continue;
    const declarations = parseDeclarations(body);
    for (const raw of selectorText.split(',')) {
      const selector = raw.trim();
      const match = /^([A-Za-z][\w-]*|\*)?((?:[.#][\w-]+)*)$/.exec(selector);
      if (!match || !selector) continue;
      const parts = match[2].match(/[.#][\w-]+/g) ?? [];
      const classes = parts.filter((part) => part[0] === '.').map((part) => part.slice(1));
      const id = parts.find((part) => part[0] === '#')?.slice(1);
      const tag = match[1] && match[1] !== '*' ? match[1] : undefined;
      rules.push({
        tag,
        classes,
        id,
        specificity: (id ? 100 : 0) + classes.length * 10 + (tag ? 1 : 0),
        order: order++,
        declarations,
      });
    }
  }
  return rules.sort((a, b) => a.specificity - b.specificity || a.order - b.order);
}

// ------------------------------------------------------------------ style

const INHERITED = new Set([
  'fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'fill-rule',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'visibility',
  'stroke-linejoin', 'stroke-linecap', 'stroke-miterlimit', 'stroke-dasharray',
  'letter-spacing', 'color', 'paint-order', 'marker-start', 'marker-mid', 'marker-end',
  'vector-effect', 'text-decoration', 'font-variant',
]);
const OWN = new Set(['opacity', 'display', 'clip-path', 'mask', 'filter', 'mix-blend-mode']);

type Style = Record<string, string>;

function ownStyle(element: SvgElement, rules: CssRule[]): Style {
  const style: Style = {};
  for (const [key, value] of Object.entries(element.attrs))
    if (INHERITED.has(key) || OWN.has(key)) style[key] = value.trim();
  const classes = (element.attrs.class ?? '').split(/\s+/).filter(Boolean);
  for (const rule of rules) {
    if (rule.tag && rule.tag !== element.name) continue;
    if (rule.id && rule.id !== element.attrs.id) continue;
    if (!rule.classes.every((name) => classes.includes(name))) continue;
    Object.assign(style, rule.declarations);
  }
  if (element.attrs.style) Object.assign(style, parseDeclarations(element.attrs.style));
  return style;
}

function computeStyle(element: SvgElement, parent: Style, rules: CssRule[]): Style {
  const own = ownStyle(element, rules);
  const style: Style = {};
  for (const [key, value] of Object.entries(parent)) if (INHERITED.has(key)) style[key] = value;
  for (const [key, value] of Object.entries(own)) {
    if (value === 'inherit') {
      if (parent[key] !== undefined) style[key] = parent[key];
    } else style[key] = value;
  }
  // Relative font sizes resolve against the parent size.
  if (own['font-size'] !== undefined) {
    const size = parseLength(own['font-size'], parseLength(parent['font-size'] ?? '16', 16) ?? 16);
    if (size !== undefined) style['font-size'] = String(size);
  }
  return style;
}

// ------------------------------------------------------------------ values

const UNIT: Record<string, number> = { px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, q: 96 / 101.6 };

/** A CSS/SVG length in px; `em` uses `fontSize`. Percentages are unsupported. */
export function parseLength(value: string | undefined, fontSize = 16): number | undefined {
  if (value === undefined) return undefined;
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(value);
  if (!match) return undefined;
  const number = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(number)) return undefined;
  if (!unit) return number;
  if (unit === 'em') return number * fontSize;
  if (unit === 'ex') return number * fontSize * 0.5;
  if (unit === 'rem') return number * 16;
  return UNIT[unit] === undefined ? undefined : number * UNIT[unit];
}

const NAMED: Record<string, string> = {
  black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00',
  cyan: '00ffff', aqua: '00ffff', magenta: 'ff00ff', fuchsia: 'ff00ff', gray: '808080', grey: '808080',
  silver: 'c0c0c0', maroon: '800000', olive: '808000', lime: '00ff00', teal: '008080', navy: '000080',
  purple: '800080', orange: 'ffa500', pink: 'ffc0cb', brown: 'a52a2a', gold: 'ffd700',
  darkgray: 'a9a9a9', darkgrey: 'a9a9a9', lightgray: 'd3d3d3', lightgrey: 'd3d3d3', dimgray: '696969',
  dimgrey: '696969', whitesmoke: 'f5f5f5', gainsboro: 'dcdcdc', indigo: '4b0082', violet: 'ee82ee',
  coral: 'ff7f50', salmon: 'fa8072', tomato: 'ff6347', crimson: 'dc143c', khaki: 'f0e68c',
  beige: 'f5f5dc', ivory: 'fffff0', tan: 'd2b48c', chocolate: 'd2691e', skyblue: '87ceeb',
  steelblue: '4682b4', royalblue: '4169e1', darkblue: '00008b', darkred: '8b0000', darkgreen: '006400',
  lightblue: 'add8e6', lightgreen: '90ee90', orchid: 'da70d6', plum: 'dda0dd', turquoise: '40e0d0',
  seagreen: '2e8b57', forestgreen: '228b22', firebrick: 'b22222', hotpink: 'ff69b4', deeppink: 'ff1493',
  dodgerblue: '1e90ff', slategray: '708090', slategrey: '708090', darkorange: 'ff8c00', lavender: 'e6e6fa',
  aliceblue: 'f0f8ff', snow: 'fffafa', linen: 'faf0e6', wheat: 'f5deb3', sienna: 'a0522d', peru: 'cd853f',
  goldenrod: 'daa520', limegreen: '32cd32', yellowgreen: '9acd32', olivedrab: '6b8e23',
  midnightblue: '191970', cornflowerblue: '6495ed', cadetblue: '5f9ea0', darkviolet: '9400d3',
  darkmagenta: '8b008b', mediumpurple: '9370db', rebeccapurple: '663399', lightpink: 'ffb6c1',
  lightyellow: 'ffffe0', lightcyan: 'e0ffff', darkcyan: '008b8b', darkslategray: '2f4f4f',
  darkslategrey: '2f4f4f', saddlebrown: '8b4513',
};

export type Paint = { hex: string; alpha: number } | 'none';

const hex2 = (value: number) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0');

function channel(value: string, max = 255): number | undefined {
  const text = value.trim();
  if (text.endsWith('%')) {
    const number = Number(text.slice(0, -1));
    return Number.isFinite(number) ? (number / 100) * max : undefined;
  }
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Parse an SVG paint. Returns undefined for anything unsupported (gradients, ...). */
export function parsePaint(value: string | undefined, currentColor?: string): Paint | undefined {
  if (value === undefined) return undefined;
  const text = value.trim().toLowerCase();
  if (text === 'none' || text === 'transparent') return 'none';
  if (text === 'currentcolor') return currentColor === undefined ? { hex: '#000000', alpha: 1 } : parsePaint(currentColor);
  if (NAMED[text]) return { hex: `#${NAMED[text]}`, alpha: 1 };
  let match = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (match) {
    let digits = match[1];
    if (digits.length <= 4) digits = digits.split('').map((digit) => digit + digit).join('');
    return { hex: `#${digits.slice(0, 6)}`, alpha: digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1 };
  }
  match = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(text);
  if (!match) return undefined;
  const parts = match[2].replace(/\s*\/\s*/, ',').split(/[\s,]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return undefined;
  const alpha = parts[3] === undefined ? 1 : channel(parts[3], 1);
  if (alpha === undefined) return undefined;
  let rgb: [number, number, number];
  if (match[1].startsWith('rgb')) {
    const values = parts.slice(0, 3).map((part) => channel(part));
    if (values.some((item) => item === undefined)) return undefined;
    rgb = values as [number, number, number];
  } else {
    const h = Number(parts[0].replace(/deg$/, ''));
    const s = channel(parts[1], 1);
    const l = channel(parts[2], 1);
    if (!Number.isFinite(h) || s === undefined || l === undefined) return undefined;
    rgb = hslToRgb(((h % 360) + 360) % 360, s, l);
  }
  return { hex: `#${rgb.map(hex2).join('')}`, alpha: Math.max(0, Math.min(1, alpha)) };
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
export function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

/** Parse an SVG transform list. Returns undefined when malformed. */
export function parseTransform(value: string | undefined): Matrix | undefined {
  if (!value || !value.trim()) return IDENTITY;
  let result = IDENTITY;
  const pattern = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (value.slice(consumed, match.index).replace(/[\s,]/g, '')) return undefined;
    consumed = pattern.lastIndex;
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (args.some((item) => !Number.isFinite(item))) return undefined;
    let next: Matrix;
    const rad = (degrees: number) => (degrees * Math.PI) / 180;
    switch (match[1]) {
      case 'matrix':
        if (args.length !== 6) return undefined;
        next = args as Matrix;
        break;
      case 'translate':
        next = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
        break;
      case 'scale':
        next = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const angle = rad(args[0] ?? 0), cos = Math.cos(angle), sin = Math.sin(angle);
        const [cx, cy] = [args[1] ?? 0, args[2] ?? 0];
        next = multiplyMatrix(multiplyMatrix([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        next = [1, 0, Math.tan(rad(args[0] ?? 0)), 1, 0, 0];
        break;
      default:
        next = [1, Math.tan(rad(args[0] ?? 0)), 0, 1, 0, 0];
    }
    result = multiplyMatrix(result, next);
  }
  if (value.slice(consumed).replace(/[\s,]/g, '')) return undefined;
  return result;
}

// ------------------------------------------------------------------ path data

type Point = { x: number; y: number };

/** Convert one SVG arc to cubic segments (endpoint parameterization). */
function arcToCubics(p0: Point, rxIn: number, ryIn: number, angle: number, large: boolean, sweep: boolean, p: Point): Array<[Point, Point, Point]> {
  let rx = Math.abs(rxIn), ry = Math.abs(ryIn);
  if (!rx || !ry || (p0.x === p.x && p0.y === p.y)) return [[p0, p, p]];
  const phi = (angle * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (p0.x - p.x) / 2, dy = (p0.y - p.y) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = large === sweep ? -1 : 1;
  const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const factor = sign * Math.sqrt(Math.max(0, numerator / (rx * rx * y1 * y1 + ry * ry * x1 * x1)));
  const cx1 = (factor * rx * y1) / ry, cy1 = (-factor * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (p0.x + p.x) / 2, cy = sin * cx1 + cos * cy1 + (p0.y + p.y) / 2;
  const angleOf = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy, len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const value = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    return ux * vy - uy * vx < 0 ? -value : value;
  };
  const theta = angleOf(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let delta = angleOf((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / segments;
  const k = (4 / 3) * Math.tan(step / 4);
  const at = (t: number) => {
    const x = rx * Math.cos(t), y = ry * Math.sin(t);
    return { x: cos * x - sin * y + cx, y: sin * x + cos * y + cy };
  };
  const derivative = (t: number) => {
    const x = -rx * Math.sin(t), y = ry * Math.cos(t);
    return { x: cos * x - sin * y, y: sin * x + cos * y };
  };
  const out: Array<[Point, Point, Point]> = [];
  for (let index = 0; index < segments; index++) {
    const t1 = theta + index * step, t2 = t1 + step;
    const a = at(t1), b = at(t2), da = derivative(t1), db = derivative(t2);
    out.push([
      { x: a.x + k * da.x, y: a.y + k * da.y },
      { x: b.x - k * db.x, y: b.y - k * db.y },
      index === segments - 1 ? { x: p.x, y: p.y } : b,
    ]);
  }
  return out;
}

/** Parse SVG path data into editable contours. Returns undefined when malformed. */
export function parsePathData(d: string): PathContour[] | undefined {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g);
  if (!tokens) return [];
  if (d.replace(/[MmLlHhVvCcSsQqTtAaZz]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[\s,]/g, '')) return undefined;
  const contours: PathContour[] = [];
  let contour: PathContour | undefined;
  let current: Point = { x: 0, y: 0 };
  let start: Point = { x: 0, y: 0 };
  let lastCubic: Point | undefined;
  let lastQuad: Point | undefined;
  let command = '';
  let index = 0;
  const isCommand = (token: string | undefined) => token !== undefined && /^[A-Za-z]$/.test(token);
  const number = (): number => {
    const token = tokens[index];
    if (token === undefined || isCommand(token)) throw new Error('path');
    index++;
    return Number(token);
  };
  const flag = (): boolean => {
    // Arc flags may be packed ("a1 1 0 011 1"); split a leading 0/1 digit.
    const token = tokens[index];
    if (token === undefined || isCommand(token)) throw new Error('path');
    if (token === '0' || token === '1') {
      index++;
      return token === '1';
    }
    if (/^[01]/.test(token)) {
      tokens[index] = token.slice(1);
      return token[0] === '1';
    }
    throw new Error('path');
  };
  const begin = (point: Point) => {
    if (contour && contour.nodes.length) contours.push(contour);
    contour = { nodes: [{ x: point.x, y: point.y }], closed: false };
  };
  const ensure = () => {
    if (!contour || contour.closed) begin(start);
    return contour!;
  };
  const lineTo = (point: Point) => {
    ensure().nodes.push({ x: point.x, y: point.y });
    current = point;
  };
  const cubicTo = (c1: Point, c2: Point, point: Point) => {
    const target = ensure();
    const previous = target.nodes[target.nodes.length - 1];
    previous.outHandle = { x: c1.x, y: c1.y };
    target.nodes.push({ x: point.x, y: point.y, inHandle: { x: c2.x, y: c2.y } });
    current = point;
  };
  try {
    while (index < tokens.length) {
      if (isCommand(tokens[index])) command = tokens[index++];
      else if (!command) return undefined;
      const relative = command === command.toLowerCase();
      const base = relative ? current : { x: 0, y: 0 };
      const upper = command.toUpperCase();
      const point = (): Point => {
        const x = number(), y = number();
        return { x: base.x + x, y: base.y + y };
      };
      let cubicControl: Point | undefined;
      let quadControl: Point | undefined;
      switch (upper) {
        case 'M': {
          const target = point();
          begin(target);
          current = start = target;
          command = relative ? 'l' : 'L';
          break;
        }
        case 'L':
          lineTo(point());
          break;
        case 'H':
          lineTo({ x: number() + (relative ? current.x : 0), y: current.y });
          break;
        case 'V':
          lineTo({ x: current.x, y: number() + (relative ? current.y : 0) });
          break;
        case 'C': {
          const c1 = point(), c2 = point(), target = point();
          cubicTo(c1, c2, target);
          cubicControl = c2;
          break;
        }
        case 'S': {
          const c1 = lastCubic ? { x: 2 * current.x - lastCubic.x, y: 2 * current.y - lastCubic.y } : current;
          const c2 = point(), target = point();
          cubicTo(c1, c2, target);
          cubicControl = c2;
          break;
        }
        case 'Q':
        case 'T': {
          const q = upper === 'Q' ? point() : lastQuad ? { x: 2 * current.x - lastQuad.x, y: 2 * current.y - lastQuad.y } : current;
          const target = point();
          const from = current;
          cubicTo(
            { x: from.x + (2 / 3) * (q.x - from.x), y: from.y + (2 / 3) * (q.y - from.y) },
            { x: target.x + (2 / 3) * (q.x - target.x), y: target.y + (2 / 3) * (q.y - target.y) },
            target,
          );
          quadControl = q;
          break;
        }
        case 'A': {
          const rx = number(), ry = number(), rotation = number(), large = flag(), sweep = flag();
          const target = point();
          for (const [c1, c2, end] of arcToCubics(current, rx, ry, rotation, large, sweep, target))
            if (c1 === current && c2 === end) lineTo(end);
            else cubicTo(c1, c2, end);
          current = target;
          break;
        }
        case 'Z': {
          const target = ensure();
          target.closed = true;
          const first = target.nodes[0], last = target.nodes[target.nodes.length - 1];
          if (target.nodes.length > 1 && Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) {
            if (last.inHandle) first.inHandle = last.inHandle;
            target.nodes.pop();
          }
          current = start;
          break;
        }
        default:
          return undefined;
      }
      lastCubic = cubicControl;
      lastQuad = quadControl;
    }
  } catch {
    return undefined;
  }
  if (contour && (contour as PathContour).nodes.length) contours.push(contour);
  // A lone moveto draws nothing.
  return contours.filter((item) => item.nodes.length > 1 || item.closed);
}

const fmt = (value: number) => Number(value.toFixed(4)).toString();

/** Basic shapes as path data, so one parser handles every geometry. */
function shapePathData(element: SvgElement, fontSize: number): string | undefined {
  const a = element.attrs;
  const length = (key: string, fallback = 0) => {
    if (a[key] === undefined) return fallback;
    return parseLength(a[key], fontSize);
  };
  switch (element.name) {
    case 'path':
      return a.d ?? '';
    case 'rect': {
      const x = length('x'), y = length('y'), w = length('width'), h = length('height');
      if ([x, y, w, h].some((item) => item === undefined)) return undefined;
      if (!(w! > 0 && h! > 0)) return '';
      let rx = a.rx === undefined || a.rx === 'auto' ? undefined : parseLength(a.rx, fontSize);
      let ry = a.ry === undefined || a.ry === 'auto' ? undefined : parseLength(a.ry, fontSize);
      if (rx === undefined) rx = ry ?? 0;
      if (ry === undefined) ry = rx;
      rx = Math.min(Math.max(0, rx), w! / 2);
      ry = Math.min(Math.max(0, ry), h! / 2);
      const [X, Y, W, H] = [x!, y!, w!, h!];
      if (!rx || !ry) return `M${fmt(X)} ${fmt(Y)}H${fmt(X + W)}V${fmt(Y + H)}H${fmt(X)}Z`;
      return `M${fmt(X + rx)} ${fmt(Y)}H${fmt(X + W - rx)}A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(X + W)} ${fmt(Y + ry)}V${fmt(Y + H - ry)}A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(X + W - rx)} ${fmt(Y + H)}H${fmt(X + rx)}A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(X)} ${fmt(Y + H - ry)}V${fmt(Y + ry)}A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(X + rx)} ${fmt(Y)}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = length('cx'), cy = length('cy');
      const rx = element.name === 'circle' ? length('r') : length('rx', undefined as unknown as number);
      const ry = element.name === 'circle' ? rx : length('ry', undefined as unknown as number);
      const rxx = rx ?? ry, ryy = ry ?? rx;
      if (cx === undefined || cy === undefined || rxx === undefined || ryy === undefined) return undefined;
      if (!(rxx > 0 && ryy > 0)) return '';
      return `M${fmt(cx + rxx)} ${fmt(cy)}A${fmt(rxx)} ${fmt(ryy)} 0 0 1 ${fmt(cx)} ${fmt(cy + ryy)}A${fmt(rxx)} ${fmt(ryy)} 0 0 1 ${fmt(cx - rxx)} ${fmt(cy)}A${fmt(rxx)} ${fmt(ryy)} 0 0 1 ${fmt(cx)} ${fmt(cy - ryy)}A${fmt(rxx)} ${fmt(ryy)} 0 0 1 ${fmt(cx + rxx)} ${fmt(cy)}Z`;
    }
    case 'line': {
      const x1 = length('x1'), y1 = length('y1'), x2 = length('x2'), y2 = length('y2');
      if ([x1, y1, x2, y2].some((item) => item === undefined)) return undefined;
      return `M${fmt(x1!)} ${fmt(y1!)}L${fmt(x2!)} ${fmt(y2!)}`;
    }
    case 'polyline':
    case 'polygon': {
      const numbers = (a.points ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (numbers.some((item) => !Number.isFinite(item))) return undefined;
      if (numbers.length < 4) return '';
      const pairs: string[] = [];
      for (let index = 0; index + 1 < numbers.length; index += 2) pairs.push(`${fmt(numbers[index])} ${fmt(numbers[index + 1])}`);
      return `M${pairs.join('L')}${element.name === 'polygon' ? 'Z' : ''}`;
    }
    default:
      return undefined;
  }
}

// ------------------------------------------------------------------ plan

export type SvgImportItem =
  | { kind: 'layer'; layer: Layer; anchor?: 'middle' | 'end' }
  | { kind: 'raster'; name: string; markup: string; opacity: number; groupId?: string };

export type SvgImportPlan = {
  w: number;
  h: number;
  /** Bottom-to-top, like Frame.layers. */
  items: SvgImportItem[];
  groups: Group[];
  vectorLayers: number;
  textLayers: number;
  rasterLayers: number;
};

export type SvgImportOptions = {
  /** Most layers the plan may produce; beyond it the SVG imports flattened. */
  maxLayers?: number;
  /** Fallback document size when the SVG declares none. */
  maxDimension?: number;
};

/** CSS mix-blend-mode values with the same canvas layer blend. */
const LAYER_BLENDS: Record<string, Layer['blend']> = {
  normal: 'source-over', multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken',
  lighten: 'lighten', 'color-dodge': 'color-dodge', 'color-burn': 'color-burn', 'hard-light': 'hard-light',
  'soft-light': 'soft-light', difference: 'difference', exclusion: 'exclusion', hue: 'hue',
  saturation: 'saturation', color: 'color', luminosity: 'luminosity',
};
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const SKIP = new Set(['defs', 'title', 'desc', 'metadata', 'style', 'symbol', 'linearGradient', 'radialGradient', 'pattern', 'clipPath', 'mask', 'filter', 'marker']);
const CONTAINERS = new Set(['g', 'a']);
const RESOURCE_REFERENCE = /url\(\s*#([^)\s]+)\s*\)|href\s*=\s*["']#([^"']+)["']/g;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const numberOr = (value: string | undefined, fallback: number) => {
  if (value === undefined) return fallback;
  const parsed = value.trim().endsWith('%') ? Number(value.trim().slice(0, -1)) / 100 : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function readableName(element: SvgElement, fallback: string): string {
  const label = element.attrs['inkscape:label'] ?? element.attrs['data-name'] ?? element.attrs.id;
  const clean = label ? Array.from(label).filter((char) => char.charCodeAt(0) >= 32).join('').trim() : undefined;
  return (clean || fallback).slice(0, 160);
}

const DEFAULT_NAMES: Record<string, string> = {
  path: 'Path', rect: 'Rectangle', circle: 'Ellipse', ellipse: 'Ellipse', line: 'Line',
  polyline: 'Polyline', polygon: 'Polygon', text: 'Text', image: 'Image', use: 'Symbol', g: 'Group',
};

/** Root viewport size and the viewBox → document transform. */
function rootViewport(root: SvgElement, maxDimension: number): { w: number; h: number; matrix: Matrix } {
  const viewBox = root.attrs.viewBox?.trim().split(/[\s,]+/).map(Number);
  const box = viewBox && viewBox.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0 ? viewBox : undefined;
  const pct = (value: string | undefined) => value?.trim().endsWith('%');
  let width = pct(root.attrs.width) ? undefined : parseLength(root.attrs.width);
  let height = pct(root.attrs.height) ? undefined : parseLength(root.attrs.height);
  if (width === undefined && height === undefined) {
    width = box?.[2];
    height = box?.[3];
  } else if (width === undefined) width = box ? (height! * box[2]) / box[3] : height;
  else if (height === undefined) height = box ? (width * box[3]) / box[2] : width;
  if (!width || !height || width <= 0 || height <= 0) fail('SVG must declare pixel dimensions or a viewBox.');
  const w = Math.max(1, Math.min(maxDimension, Math.round(width!)));
  const h = Math.max(1, Math.min(maxDimension, Math.round(height!)));
  if (!box) return { w, h, matrix: [w / width!, 0, 0, h / height!, 0, 0] };
  const preserve = (root.attrs.preserveAspectRatio ?? 'xMidYMid meet').trim().split(/\s+/);
  let sx = w / box[2], sy = h / box[3];
  let tx = 0, ty = 0;
  if (preserve[0] !== 'none') {
    const scale = preserve[1] === 'slice' ? Math.max(sx, sy) : Math.min(sx, sy);
    const align = preserve[0];
    const extraX = w - box[2] * scale, extraY = h - box[3] * scale;
    tx = /xMid/.test(align) ? extraX / 2 : /xMax/.test(align) ? extraX : 0;
    ty = /YMid/.test(align) ? extraY / 2 : /YMax/.test(align) ? extraY : 0;
    sx = sy = scale;
  }
  return { w, h, matrix: [sx, 0, 0, sy, tx - box[0] * sx, ty - box[1] * sy] };
}

const matrixAttr = (m: Matrix) => `matrix(${m.map(fmt).join(' ')})`;
const escapeAttr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Plan an editable import of prepared SVG markup. */
export function planSvgImport(markup: string, options: SvgImportOptions = {}): SvgImportPlan {
  const maxLayers = options.maxLayers ?? 512;
  const root = parseSvgXml(markup);
  const { w, h, matrix: rootMatrix } = rootViewport(root, options.maxDimension ?? 16000);
  const styleText: string[] = [];
  const byId = new Map<string, SvgElement>();
  const visit = (element: SvgElement) => {
    if (element.attrs.id && !byId.has(element.attrs.id)) byId.set(element.attrs.id, element);
    if (element.name === 'style') styleText.push(element.content.filter((item): item is string => typeof item === 'string').join(''));
    element.children.forEach(visit);
  };
  visit(root);
  const rules = parseStylesheet(styleText.join('\n'));
  const namespaces = Object.entries(root.attrs)
    .filter(([key]) => key.startsWith('xmlns:') && key !== 'xmlns:xlink')
    .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
    .join('');

  const items: SvgImportItem[] = [];
  const groups: Group[] = [];
  let pendingRaster: { fragments: string[]; name: string; groupId?: string; opacity: number } | undefined;
  const flushRaster = () => {
    if (!pendingRaster) return;
    items.push({
      kind: 'raster',
      name: pendingRaster.name,
      markup: rasterDocument(pendingRaster.fragments),
      opacity: pendingRaster.opacity,
      ...(pendingRaster.groupId ? { groupId: pendingRaster.groupId } : {}),
    });
    pendingRaster = undefined;
  };
  const rasterDocument = (fragments: string[]) => {
    // Pull in every resource the fragments reference (gradients, clips, symbols...).
    const needed = new Set<string>();
    const queue = [...fragments];
    while (queue.length) {
      const text = queue.pop()!;
      for (const match of text.matchAll(RESOURCE_REFERENCE)) {
        const id = match[1] ?? match[2];
        const target = byId.get(id);
        if (!target || needed.has(id)) continue;
        needed.add(id);
        queue.push(markup.slice(target.start, target.end));
      }
    }
    const resources = [...needed]
      .map((id) => byId.get(id)!)
      .filter((element, _, all) => !all.some((other) => other !== element && other.start <= element.start && other.end >= element.end))
      .map((element) => markup.slice(element.start, element.end));
    const style = styleText.length ? `<style>${styleText.join('\n').replace(/<\/style/gi, '')}</style>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${namespaces} width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${style}<defs>${resources.join('')}</defs>${fragments.join('')}</svg>`;
  };
  const addRaster = (element: SvgElement, matrix: Matrix, inherited: Style, opacity: number, groupId: string | undefined) => {
    const attrs = Object.entries(inherited)
      .filter(([key]) => INHERITED.has(key) && key !== 'font-size')
      .map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
      .join('');
    const fontSize = inherited['font-size'] ? ` font-size="${escapeAttr(inherited['font-size'])}px"` : '';
    const fragment = `<g transform="${matrixAttr(matrix)}"${attrs}${fontSize}>${markup.slice(element.start, element.end)}</g>`;
    if (pendingRaster && pendingRaster.groupId === groupId && pendingRaster.opacity === opacity) pendingRaster.fragments.push(fragment);
    else {
      flushRaster();
      pendingRaster = { fragments: [fragment], name: readableName(element, DEFAULT_NAMES[element.name] ?? 'SVG artwork'), groupId, opacity };
    }
  };
  const pushLayer = (layer: Layer, anchor?: 'middle' | 'end') => {
    flushRaster();
    items.push({ kind: 'layer', layer, ...(anchor ? { anchor } : {}) });
  };

  const walk = (element: SvgElement, parentMatrix: Matrix, parentStyle: Style, opacity: number, groupId: string | undefined, depth: number) => {
    if (SKIP.has(element.name)) return;
    const style = computeStyle(element, parentStyle, rules);
    if (style.display === 'none') return;
    const transform = parseTransform(element.attrs.transform);
    const own = numberOr(style.opacity, 1);
    const unsupportedEffect = Boolean(
      (style['clip-path'] && style['clip-path'] !== 'none') ||
      (style.mask && style.mask !== 'none') ||
      (style.filter && style.filter !== 'none') ||
      // Shapes and text keep a blend mode as their layer blend.
      (style['mix-blend-mode'] && style['mix-blend-mode'] !== 'normal' &&
        !((SHAPES.has(element.name) || element.name === 'text') && LAYER_BLENDS[style['mix-blend-mode'].trim()])),
    );
    const blend = LAYER_BLENDS[(style['mix-blend-mode'] ?? 'normal').trim()] ?? 'source-over';
    if (!transform || unsupportedEffect) {
      addRaster(element, parentMatrix, parentStyle, opacity, groupId);
      return;
    }
    const matrix = multiplyMatrix(parentMatrix, transform);
    if (CONTAINERS.has(element.name)) {
      // A top-level group with content becomes a layer group.
      if (depth === 0 && element.name === 'g' && element.children.length > 0 && !groupId) {
        const group: Group = {
          id: crypto.randomUUID(),
          name: readableName(element, `Group ${groups.length + 1}`),
          visible: true,
          locked: false,
          opacity: clamp01(own),
          blend: 'source-over',
          collapsed: true,
        };
        const before = items.length;
        flushRaster();
        for (const child of element.children) walk(child, matrix, style, opacity, group.id, depth + 1);
        flushRaster();
        if (items.length > before) groups.push(group);
        return;
      }
      for (const child of element.children) walk(child, matrix, style, opacity * clamp01(own), groupId, depth + 1);
      return;
    }
    if (style.visibility === 'hidden' || style.visibility === 'collapse') return;
    const layerOpacity = opacity * clamp01(own);
    const fontSize = Number(style['font-size'] ?? 16) || 16;
    if (SHAPES.has(element.name)) {
      const layer = shapeLayer(element, style, matrix, fontSize);
      if (layer === null) return;
      if (!layer) addRaster(element, parentMatrix, parentStyle, opacity, groupId);
      else {
        layer.opacity = layerOpacity;
        layer.blend = blend;
        if (groupId) layer.groupId = groupId;
        pushLayer(layer);
      }
      return;
    }
    if (element.name === 'text') {
      const result = textLayer(element, style, matrix, w, rules);
      if (result === null) return;
      if (!result) addRaster(element, parentMatrix, parentStyle, opacity, groupId);
      else {
        result.layer.opacity = clamp01(layerOpacity * result.alpha);
        result.layer.blend = blend;
        if (groupId) result.layer.groupId = groupId;
        pushLayer(result.layer, result.anchor);
      }
      return;
    }
    // image, use, switch, nested svg, foreign content...
    addRaster(element, parentMatrix, parentStyle, opacity, groupId);
  };
  // The root's own presentation attributes are inherited by everything.
  const rootStyle = computeStyle(root, {}, rules);
  const rootOpacity = clamp01(numberOr(rootStyle.opacity, 1));
  for (const child of root.children) walk(child, rootMatrix, rootStyle, rootOpacity, undefined, 0);
  flushRaster();

  const layerCount = items.length;
  if (layerCount > maxLayers || layerCount === 0) {
    // Too many pieces to keep editable (or nothing drawable): one flattened layer.
    return {
      w,
      h,
      items: layerCount === 0 ? [] : [{ kind: 'raster', name: 'SVG artwork', markup: rasterDocument([`<g transform="${matrixAttr(rootMatrix)}">${root.children.map((child) => markup.slice(child.start, child.end)).join('')}</g>`]), opacity: 1 }],
      groups: [],
      vectorLayers: 0,
      textLayers: 0,
      rasterLayers: layerCount === 0 ? 0 : 1,
    };
  }
  return {
    w,
    h,
    items,
    groups,
    vectorLayers: items.filter((item) => item.kind === 'layer' && item.layer.kind === 'path').length,
    textLayers: items.filter((item) => item.kind === 'layer' && item.layer.kind === 'text').length,
    rasterLayers: items.filter((item) => item.kind === 'raster').length,
  };
}

/** True when two straight segments meet at less than 30°. */
function hasSharpCorner(contour: PathContour): boolean {
  const nodes = contour.nodes;
  const count = nodes.length;
  for (let index = 0; index < count; index++) {
    if (!contour.closed && (index === 0 || index === count - 1)) continue;
    const previous = nodes[(index - 1 + count) % count], node = nodes[index], next = nodes[(index + 1) % count];
    const ax = (node.inHandle ?? previous).x - node.x, ay = (node.inHandle ?? previous).y - node.y;
    const bx = (node.outHandle ?? next).x - node.x, by = (node.outHandle ?? next).y - node.y;
    const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
    if (!lengths) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / lengths)));
    if (angle < Math.PI / 6) return true;
  }
  return false;
}

const JOINS: Record<string, PathLineJoin> = { miter: 'miter', 'miter-clip': 'miter', arcs: 'miter', round: 'round', bevel: 'bevel' };
const CAPS: Record<string, PathLineCap> = { butt: 'butt', round: 'round', square: 'square' };

/**
 * An editable path layer for a basic shape, null when it draws nothing, or
 * undefined when only a raster can reproduce it.
 */
function shapeLayer(element: SvgElement, style: Style, matrix: Matrix, fontSize: number): Layer | null | undefined {
  const d = shapePathData(element, fontSize);
  if (d === undefined) return undefined;
  const contours = parsePathData(d);
  if (!contours) return undefined;
  if (!contours.length) return null;
  // A line encloses no area, so its fill never shows.
  const fill = element.name === 'line' ? 'none' : parsePaint(style.fill ?? 'black', style.color);
  const stroke = parsePaint(style.stroke ?? 'none', style.color);
  if (!fill || !stroke) return undefined;
  for (const key of ['marker-start', 'marker-mid', 'marker-end'])
    if (style[key] && style[key] !== 'none') return undefined;
  if (style['stroke-dasharray'] && style['stroke-dasharray'] !== 'none' && stroke !== 'none') return undefined;
  if (style['vector-effect'] === 'non-scaling-stroke' && stroke !== 'none') return undefined;
  if (style['paint-order'] && /^\s*(stroke|markers)/.test(style['paint-order']) && stroke !== 'none' && fill !== 'none') return undefined;
  const strokeWidth = parseLength(style['stroke-width'] ?? '1', fontSize);
  if (strokeWidth === undefined || strokeWidth < 0) return undefined;
  const fillAlpha = fill === 'none' ? 0 : fill.alpha * clamp01(numberOr(style['fill-opacity'], 1));
  const strokeAlpha = stroke === 'none' ? 0 : stroke.alpha * clamp01(numberOr(style['stroke-opacity'], 1));
  const hasFill = fill !== 'none' && fillAlpha > 0;
  const hasStroke = stroke !== 'none' && strokeAlpha > 0 && strokeWidth > 0;
  if (!hasFill && !hasStroke) return null;
  // The renderer fills only when a contour is closed; an open filled shape
  // without a stroke looks the same closed.
  if (hasFill && contours.every((contour) => !contour.closed)) {
    if (hasStroke) return undefined;
    contours.forEach((contour) => (contour.closed = true));
  }
  const nodes = contours.reduce((total, contour) => total + contour.nodes.length, 0);
  if (contours.length > PATH_MAX_CONTOURS || nodes > PATH_MAX_NODES) return undefined;
  const color = (paint: Paint, alpha: number) => (paint === 'none' ? '#000000' : alpha >= 1 ? paint.hex : `${paint.hex}${hex2(alpha * 255)}`);
  const join = JOINS[(style['stroke-linejoin'] ?? 'miter').trim()];
  const cap = CAPS[(style['stroke-linecap'] ?? 'butt').trim()];
  if (hasStroke && (!join || !cap)) return undefined;
  // The renderer mitres at SVG's default limit of 4. Another limit only
  // changes corners sharper than ~29°, so check for those.
  const miterLimit = numberOr(style['stroke-miterlimit'], 4);
  if (hasStroke && join === 'miter' && Math.abs(miterLimit - 4) > 1e-6 && contours.some(hasSharpCorner)) return undefined;
  let path: PathModel = {
    nodes: contours[0].nodes,
    closed: contours[0].closed,
    ...(contours.length > 1 ? { contours } : {}),
    fill: hasFill,
    stroke: hasStroke,
    strokeWidth: hasStroke ? strokeWidth : 0,
    fillColor: hasFill ? color(fill, fillAlpha) : '#000000',
    strokeColor: hasStroke ? color(stroke, strokeAlpha) : '#000000',
    fillRule: style['fill-rule']?.trim() === 'evenodd' ? 'evenodd' : 'nonzero',
    ...(hasStroke && join !== 'round' ? { lineJoin: join } : {}),
    ...(hasStroke && cap !== 'round' ? { lineCap: cap } : {}),
  };
  // Bake similarity transforms into the nodes so tools edit document
  // coordinates directly; keep anything else (skew, stretch) on the layer.
  const [a, b, c, d2] = matrix;
  const similarity = Math.abs(a - d2) < 1e-9 && Math.abs(b + c) < 1e-9;
  let layerMatrix: Matrix = [1, 0, 0, 1, 0, 0];
  if (similarity) {
    const scale = Math.hypot(a, b);
    path = { ...transformPath(path, matrix), strokeWidth: path.strokeWidth * scale };
  } else layerMatrix = matrix;
  if (path.strokeWidth > 10_000) return undefined;
  const coordinates = (path.contours ?? [{ nodes: path.nodes, closed: path.closed }]).flatMap((contour) => contour.nodes.flatMap((node: PathNode) => [node, node.inHandle, node.outHandle]));
  if (coordinates.some((point) => point && (Math.abs(point.x) > PATH_MAX_COORDINATE || Math.abs(point.y) > PATH_MAX_COORDINATE))) return undefined;
  try {
    path = validatePath(path);
  } catch {
    return undefined;
  }
  return {
    ...commonLayer(readableName(element, DEFAULT_NAMES[element.name] ?? 'Path')),
    kind: 'path',
    path,
    matrix: layerMatrix,
  };
}

const GENERIC_FONTS: Record<string, string> = {
  'sans-serif': 'Arial', serif: 'Times New Roman', monospace: 'Courier New', cursive: 'Comic Sans MS',
  'system-ui': 'Arial', fantasy: 'Impact',
};

function fontFamily(value: string | undefined): string {
  const first = (value ?? 'sans-serif').split(',')[0].trim().replace(/^["']|["']$/g, '').trim();
  const family = GENERIC_FONTS[first.toLowerCase()] ?? first;
  return isFontFamilyName(family) ? family : 'Arial';
}

const fontWeight = (value: string | undefined) => {
  const text = (value ?? 'normal').trim().toLowerCase();
  if (text === 'bold' || text === 'bolder') return 700;
  if (text === 'normal' || text === 'lighter') return 400;
  const number = Number(text);
  return Number.isFinite(number) ? number : 400;
};

/**
 * A text layer for simple <text>: one style, horizontal lines. null when it
 * draws nothing; undefined when only a raster can reproduce it.
 */
function textLayer(
  element: SvgElement,
  style: Style,
  matrix: Matrix,
  documentWidth: number,
  rules: CssRule[],
): { layer: Layer; alpha: number; anchor?: 'middle' | 'end' } | null | undefined {
  const firstNumber = (value: string | undefined, size: number) => (value === undefined ? undefined : parseLength(value.trim().split(/[\s,]+/)[0], size));
  const size = Number(style['font-size'] ?? 16) || 16;
  const signature = (item: Style) => ['fill', 'font-size', 'font-family', 'font-weight', 'font-style', 'text-anchor', 'stroke', 'letter-spacing', 'text-decoration', 'fill-opacity', 'opacity'].map((key) => item[key] ?? '').join('|');
  const base = signature({ ...style, opacity: '' });
  const lines: string[] = [];
  const baselines: number[] = [];
  let line = '';
  let simple = true;
  const x0 = firstNumber(element.attrs.x, size) ?? 0;
  const y0 = (firstNumber(element.attrs.y, size) ?? 0) + (firstNumber(element.attrs.dy, size) ?? 0);
  if ([element.attrs.x, element.attrs.y].some((value) => value !== undefined && /[\s,]/.test(value.trim()))) return undefined;
  if (element.attrs.rotate || element.attrs.textLength) return undefined;
  let y = y0;
  const pushLine = () => {
    lines.push(line);
    baselines.push(y);
    line = '';
  };
  const collect = (node: SvgElement, inherited: Style) => {
    for (const item of node.content) {
      if (typeof item === 'string') {
        line += item;
        continue;
      }
      if (item.name !== 'tspan') {
        if (item.name !== 'title' && item.name !== 'desc') simple = false;
        continue;
      }
      const childStyle = computeStyle(item, inherited, rules);
      if (signature({ ...childStyle, opacity: '' }) !== base || (childStyle.opacity && numberOr(childStyle.opacity, 1) !== 1)) simple = false;
      if (item.attrs.rotate || item.attrs.dx || item.attrs.transform) simple = false;
      const ty = firstNumber(item.attrs.y, size);
      const tdy = firstNumber(item.attrs.dy, size);
      const tx = firstNumber(item.attrs.x, size);
      if (ty !== undefined || (tdy !== undefined && tdy !== 0)) {
        if (line.trim() || lines.length) pushLine();
        y = ty !== undefined ? ty + (tdy ?? 0) : y + (tdy ?? 0);
        if (tx !== undefined && Math.abs(tx - x0) > 0.01) simple = false;
      } else if (tx !== undefined) simple = false;
      collect(item, childStyle);
    }
  };
  collect(element, style);
  pushLine();
  if (!simple) return undefined;
  const preserve = element.attrs['xml:space'] === 'preserve';
  const cleaned = lines.map((text) => (preserve ? text.replace(/[\r\n\t]/g, ' ') : text.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim()));
  // Drop leading empty lines created by whitespace before the first tspan.
  while (cleaned.length > 1 && !cleaned[0]) {
    cleaned.shift();
    baselines.shift();
  }
  if (!cleaned.join('').trim()) return null;
  const fill = parsePaint(style.fill ?? 'black', style.color);
  if (!fill) return undefined;
  if (fill === 'none') return null;
  if (style.stroke && style.stroke !== 'none') return undefined;
  if (style['font-style'] && !/^(normal)$/.test(style['font-style'].trim())) return undefined;
  if (style['text-decoration'] && style['text-decoration'].trim() !== 'none') return undefined;
  if (style['font-variant'] && style['font-variant'].trim() !== 'normal') return undefined;
  if (size < 1 || size > 1000) return undefined;
  const spacing = style['letter-spacing'] && style['letter-spacing'].trim() !== 'normal' ? parseLength(style['letter-spacing'], size) : 0;
  if (spacing === undefined || spacing < -100 || spacing > 100) return undefined;
  const gaps = baselines.slice(1).map((value, index) => value - baselines[index]);
  const gap = gaps.length ? gaps[0] : size * 1.2;
  if (gaps.some((value) => Math.abs(value - gap) > 0.5)) return undefined;
  const lineHeight = gap / size;
  if (lineHeight < 0.5 || lineHeight > 4) return undefined;
  const text = cleaned.join('\n');
  if (text.length > 10000) return undefined;
  const anchor = style['text-anchor']?.trim();
  const local: Matrix = [1, 0, 0, 1, x0, baselines[0] - size * 0.8];
  return {
    layer: {
      ...commonLayer(readableName(element, text.split('\n')[0].slice(0, 40) || 'Text')),
      kind: 'text',
      text,
      color: fill.hex,
      fontSize: size,
      fontFamily: fontFamily(style['font-family']),
      bold: fontWeight(style['font-weight']) >= 600,
      boxWidth: Math.max(1, Math.min(16000, documentWidth)),
      textAlign: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left',
      lineHeight,
      letterSpacing: spacing,
      orientation: 'horizontal',
      textMode: 'point',
      matrix: multiplyMatrix(matrix, local),
    } as Layer,
    alpha: fill.alpha * clamp01(numberOr(style['fill-opacity'], 1)),
    ...(anchor === 'middle' || anchor === 'end' ? { anchor } : {}),
  };
}
