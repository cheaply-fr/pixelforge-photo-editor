// Minimal, dependency-free readers for the font tables the font-library build
// step needs: the character map (glyph coverage for the Glyphs panel) and
// GSUB ligatures (icon names for ligature-driven icon fonts such as Material
// Symbols). Only WOFF2 and WOFF 1.0 single-font containers are supported.
import { brotliDecompressSync, inflateSync } from 'node:zlib';

const WOFF2_KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep',
  'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE',
  'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt',
  'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar',
  'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

function tagAt(view, offset) {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

function readBase128(view, state) {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = view.getUint8(state.offset++);
    if (i === 0 && byte === 0x80) throw new Error('WOFF2 UIntBase128 has a leading zero');
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
  throw new Error('WOFF2 UIntBase128 is too long');
}

/** Extract the untransformed tables of a WOFF2 or WOFF file as tag -> bytes. */
export function readFontTables(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = tagAt(view, 0);
  const tables = new Map();
  if (signature === 'wOF2') {
    const numTables = view.getUint16(12);
    const compressedSize = view.getUint32(20);
    const state = { offset: 48 };
    const entries = [];
    for (let i = 0; i < numTables; i += 1) {
      const flags = view.getUint8(state.offset++);
      const tagIndex = flags & 0x3f;
      let tag;
      if (tagIndex === 63) {
        tag = tagAt(view, state.offset);
        state.offset += 4;
      } else tag = WOFF2_KNOWN_TAGS[tagIndex];
      const version = flags >> 6;
      const origLength = readBase128(view, state);
      const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
      const length = transformed ? readBase128(view, state) : origLength;
      entries.push({ tag, length, transformed });
    }
    if (tagAt(view, 4) === 'ttcf') throw new Error('WOFF2 collections are not supported');
    const data = brotliDecompressSync(bytes.subarray(state.offset, state.offset + compressedSize));
    let cursor = 0;
    for (const entry of entries) {
      if (!entry.transformed) tables.set(entry.tag, data.subarray(cursor, cursor + entry.length));
      cursor += entry.length;
    }
    if (cursor > data.length) throw new Error('WOFF2 table directory exceeds the decompressed stream');
    return tables;
  }
  if (signature === 'wOFF') {
    const numTables = view.getUint16(12);
    for (let i = 0; i < numTables; i += 1) {
      const base = 44 + i * 20;
      const tag = tagAt(view, base);
      const offset = view.getUint32(base + 4);
      const compLength = view.getUint32(base + 8);
      const origLength = view.getUint32(base + 12);
      const raw = bytes.subarray(offset, offset + compLength);
      tables.set(tag, compLength < origLength ? inflateSync(raw) : raw);
    }
    return tables;
  }
  throw new Error(`Unsupported font container "${signature}"`);
}

function viewOf(table) {
  return new DataView(table.buffer, table.byteOffset, table.byteLength);
}

/** Parse a cmap table into a Map of codepoint -> glyph id (non-zero glyphs only). */
export function parseCmap(table) {
  const view = viewOf(table);
  const count = view.getUint16(2);
  const subtables = [];
  for (let i = 0; i < count; i += 1) {
    const platform = view.getUint16(4 + i * 8);
    const encoding = view.getUint16(6 + i * 8);
    const offset = view.getUint32(8 + i * 8);
    subtables.push({ platform, encoding, offset, format: view.getUint16(offset) });
  }
  const rank = (s) =>
    s.format === 12 ? 0 : s.platform === 3 && s.encoding === 1 && s.format === 4 ? 1 : s.platform === 0 && s.format === 4 ? 2 : s.platform === 3 && s.encoding === 0 && s.format === 4 ? 3 : 9;
  const best = subtables.filter((s) => rank(s) < 9).sort((a, b) => rank(a) - rank(b))[0];
  const map = new Map();
  if (!best) return map;
  const o = best.offset;
  if (best.format === 12) {
    const groups = view.getUint32(o + 12);
    for (let g = 0; g < groups; g += 1) {
      const start = view.getUint32(o + 16 + g * 12);
      const end = view.getUint32(o + 20 + g * 12);
      const glyph = view.getUint32(o + 24 + g * 12);
      for (let c = start; c <= end && c - start < 0x110000; c += 1) if (glyph + (c - start)) map.set(c, glyph + (c - start));
    }
    return map;
  }
  const segX2 = view.getUint16(o + 6);
  const ends = o + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const rangeOffsets = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s += 1) {
    const end = view.getUint16(ends + s * 2);
    const start = view.getUint16(starts + s * 2);
    const delta = view.getInt16(deltas + s * 2);
    const rangeOffset = view.getUint16(rangeOffsets + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c += 1) {
      let glyph;
      if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
      else {
        const address = rangeOffsets + s * 2 + rangeOffset + (c - start) * 2;
        if (address + 2 > table.byteLength) continue;
        glyph = view.getUint16(address);
        if (glyph) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph) map.set(c, glyph);
    }
  }
  return map;
}

function coverageGlyphs(view, offset) {
  const format = view.getUint16(offset);
  const glyphs = [];
  if (format === 1) {
    const count = view.getUint16(offset + 2);
    for (let i = 0; i < count; i += 1) glyphs.push(view.getUint16(offset + 4 + i * 2));
  } else if (format === 2) {
    const count = view.getUint16(offset + 2);
    for (let i = 0; i < count; i += 1) {
      const start = view.getUint16(offset + 4 + i * 6);
      const end = view.getUint16(offset + 6 + i * 6);
      for (let g = start; g <= end; g += 1) glyphs.push(g);
    }
  }
  return glyphs;
}

/**
 * Read every GSUB ligature (lookup type 4, also through type 7 extensions)
 * as { components: glyphId[], glyph: glyphId }.
 */
export function parseGsubLigatures(table) {
  const view = viewOf(table);
  const lookupList = view.getUint16(8);
  const lookupCount = view.getUint16(lookupList);
  const ligatures = [];
  const readLigatureSubtable = (sub) => {
    if (view.getUint16(sub) !== 1) return;
    const firstGlyphs = coverageGlyphs(view, sub + view.getUint16(sub + 2));
    const setCount = view.getUint16(sub + 4);
    for (let s = 0; s < setCount && s < firstGlyphs.length; s += 1) {
      const set = sub + view.getUint16(sub + 6 + s * 2);
      const ligCount = view.getUint16(set);
      for (let l = 0; l < ligCount; l += 1) {
        const lig = set + view.getUint16(set + 2 + l * 2);
        const glyph = view.getUint16(lig);
        const compCount = view.getUint16(lig + 2);
        const components = [firstGlyphs[s]];
        for (let c = 1; c < compCount; c += 1) components.push(view.getUint16(lig + 4 + (c - 1) * 2));
        ligatures.push({ components, glyph });
      }
    }
  };
  for (let i = 0; i < lookupCount; i += 1) {
    const lookup = lookupList + view.getUint16(lookupList + 2 + i * 2);
    const type = view.getUint16(lookup);
    const subCount = view.getUint16(lookup + 4);
    for (let s = 0; s < subCount; s += 1) {
      const sub = lookup + view.getUint16(lookup + 6 + s * 2);
      if (type === 4) readLigatureSubtable(sub);
      else if (type === 7 && view.getUint16(sub + 2) === 4) readLigatureSubtable(sub + view.getUint32(sub + 4));
    }
  }
  return ligatures;
}

/** Compress sorted codepoints into [start, end] inclusive ranges. */
export function codepointRanges(codepoints) {
  const sorted = [...new Set(codepoints)].sort((a, b) => a - b);
  const ranges = [];
  for (const cp of sorted) {
    const last = ranges.at(-1);
    if (last && cp === last[1] + 1) last[1] = cp;
    else ranges.push([cp, cp]);
  }
  return ranges;
}
