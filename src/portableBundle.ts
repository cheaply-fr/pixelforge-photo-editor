/**
 * Portable PixelForge project bundle v3.
 *
 * The archive is intentionally ZIP-store-only: manifest.json and document.json
 * are UTF-8 JSON and every source asset is an unmodified PNG at
 * assets/<stable-id>.png.  This keeps imports deterministic and avoids a
 * decompression or archive filesystem dependency in the browser.
 */
import { validateDraft, type Asset, type Assets, type Draft } from './drafts.ts';

export const PORTABLE_BUNDLE_KIND = 'pixelforge-project' as const;
export const PORTABLE_BUNDLE_VERSION = 3 as const;
export const PORTABLE_MANIFEST_PATH = 'manifest.json' as const;
export const PORTABLE_DOCUMENT_PATH = 'document.json' as const;
export const PORTABLE_ASSET_PREFIX = 'assets/' as const;

/** These limits are deliberately no larger than the editor's v2 limits. */
export const PORTABLE_MAX_BYTES = 64 * 1024 * 1024;
export const PORTABLE_MAX_ENTRIES = 770; // manifest + document + 768 assets
export const PORTABLE_MAX_JSON_BYTES = 8 * 1024 * 1024;
export const PORTABLE_MAX_ASSET_BYTES = 16 * 1024 * 1024;
export const PORTABLE_MAX_ASSETS = PORTABLE_MAX_ENTRIES - 2;

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const STABLE_ID_PATTERN = /^[a-f0-9-]{36}$/;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export type PortableAssetManifest = {
  id: string;
  path: string;
  sha256: string;
  byteLength: number;
  w: number;
  h: number;
};

export type PortableBundleManifest = {
  kind: typeof PORTABLE_BUNDLE_KIND;
  version: typeof PORTABLE_BUNDLE_VERSION;
  document: typeof PORTABLE_DOCUMENT_PATH;
  assets: PortableAssetManifest[];
  documentSha256: string;
  documentByteLength: number;
  archiveByteLength: number;
};

type ZipEntry = { name: string; data: Uint8Array; method: number; flags: number };
type PortableDocument = Omit<Draft, 'assets' | 'cloud' | 'localRevision'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function copyBytes(value: Uint8Array): Uint8Array {
  const result = new Uint8Array(value.byteLength);
  result.set(value);
  return result;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Portable bundle integrity is unavailable');
  const copy = copyBytes(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function jsonBytes(value: unknown): Uint8Array {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new Error('Portable document is not serializable');
  }
  if (typeof encoded !== 'string') throw new Error('Portable document is not serializable');
  const bytes = textEncoder.encode(encoded);
  if (bytes.byteLength > PORTABLE_MAX_JSON_BYTES) throw new Error('Portable JSON exceeds 8 MiB');
  return bytes;
}

function decodeBase64(value: string): Uint8Array {
  const body = value.slice('data:image/png;base64,'.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body) || body.length % 4 !== 0)
    throw new Error('Portable asset is not a base64 PNG');
  try {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new Error('Portable asset is not a base64 PNG');
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunking avoids argument and string limits when a large source is imported.
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  return btoa(binary);
}

function readPngDimensions(bytes: Uint8Array): { w: number; h: number } {
  if (bytes.byteLength < 33 || !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte))
    throw new Error('Portable asset is not a PNG');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452)
    throw new Error('Portable PNG header is invalid');
  const w = view.getUint32(16);
  const h = view.getUint32(20);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 16000 || h > 16000 || w * h > 16000000)
    throw new Error('Portable asset dimensions are invalid');
  return { w, h };
}

function stableAssetId(id: string): boolean {
  return STABLE_ID_PATTERN.test(id);
}

function safePath(name: string): boolean {
  return !!name && !name.startsWith('/') && !name.includes('\\') &&
    !name.split('/').some((part) => part === '' || part === '.' || part === '..') &&
    !/[\u0000-\u001f\u007f]/.test(name);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, value, true); return bytes;
}
function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes;
}
function put(view: Uint8Array, at: number, value: Uint8Array): void { view.set(value, at); }

function makeZip(entries: readonly { name: string; data: Uint8Array }[]): Uint8Array {
  if (!entries.length || entries.length > PORTABLE_MAX_ENTRIES) throw new Error('Portable bundle has too many entries');
  const names = new Set<string>();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  let centralBytes = 0;
  for (const entry of entries) {
    if (!safePath(entry.name) || names.has(entry.name)) throw new Error('Portable bundle contains an unsafe or duplicate path');
    names.add(entry.name);
    const name = textEncoder.encode(entry.name);
    if (name.byteLength > 0xffff || entry.data.byteLength > 0xffffffff || offset > 0xffffffff)
      throw new Error('Portable bundle entry exceeds ZIP limits');
    const crc = crc32(entry.data);
    const header = new Uint8Array(30 + name.byteLength);
    put(header, 0, u32(ZIP_LOCAL_SIGNATURE)); put(header, 4, u16(20)); put(header, 6, u16(0x0800));
    put(header, 8, u16(0)); put(header, 10, u16(0)); put(header, 12, u16(0)); put(header, 14, u32(crc));
    put(header, 18, u32(entry.data.byteLength)); put(header, 22, u32(entry.data.byteLength)); put(header, 26, u16(name.byteLength)); put(header, 28, u16(0));
    header.set(name, 30); local.push(header, entry.data);
    const directory = new Uint8Array(46 + name.byteLength);
    put(directory, 0, u32(ZIP_CENTRAL_SIGNATURE)); put(directory, 4, u16(20)); put(directory, 6, u16(20)); put(directory, 8, u16(0x0800));
    put(directory, 10, u16(0)); put(directory, 12, u16(0)); put(directory, 14, u16(0)); put(directory, 16, u32(crc));
    put(directory, 20, u32(entry.data.byteLength)); put(directory, 24, u32(entry.data.byteLength)); put(directory, 28, u16(name.byteLength)); put(directory, 30, u16(0));
    put(directory, 32, u16(0)); put(directory, 34, u16(0)); put(directory, 36, u16(0)); put(directory, 38, u32(0)); put(directory, 42, u32(offset)); directory.set(name, 46);
    central.push(directory); centralBytes += directory.byteLength; offset += header.byteLength + entry.data.byteLength;
  }
  const end = new Uint8Array(22);
  put(end, 0, u32(ZIP_END_SIGNATURE)); put(end, 4, u16(0)); put(end, 6, u16(0)); put(end, 8, u16(entries.length)); put(end, 10, u16(entries.length));
  put(end, 12, u32(centralBytes)); put(end, 16, u32(offset)); put(end, 20, u16(0));
  const result = new Uint8Array(offset + centralBytes + end.byteLength); let at = 0;
  for (const part of [...local, ...central, end]) { result.set(part, at); at += part.byteLength; }
  if (result.byteLength > PORTABLE_MAX_BYTES) throw new Error('Portable bundle exceeds 64 MiB');
  return result;
}

function asBytes(input: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> | Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return input.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function parseZip(input: Uint8Array): ZipEntry[] {
  if (input.byteLength < 22 || input.byteLength > PORTABLE_MAX_BYTES) throw new Error('Portable ZIP size is invalid');
  let end = -1;
  for (let at = input.byteLength - 22; at >= Math.max(0, input.byteLength - 0xffff - 22); at -= 1) {
    if (new DataView(input.buffer, input.byteOffset, input.byteLength).getUint32(at, true) === ZIP_END_SIGNATURE) { end = at; break; }
  }
  if (end < 0) throw new Error('Portable ZIP end record is missing');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const disk = view.getUint16(end + 4, true), centralDisk = view.getUint16(end + 6, true);
  const count = view.getUint16(end + 8, true), count2 = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true), centralOffset = view.getUint32(end + 16, true);
  const commentLength = view.getUint16(end + 20, true);
  if (disk !== 0 || centralDisk !== 0 || count !== count2 || count > PORTABLE_MAX_ENTRIES || commentLength !== 0 || end + 22 !== input.byteLength || centralOffset + centralSize > end)
    throw new Error('Portable ZIP directory is invalid');
  const entries: ZipEntry[] = []; const names = new Set<string>(); let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > input.byteLength || view.getUint32(cursor, true) !== ZIP_CENTRAL_SIGNATURE) throw new Error('Portable ZIP central entry is invalid');
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true), compressed = view.getUint32(cursor + 20, true), uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), comment = view.getUint16(cursor + 32, true), localOffset = view.getUint32(cursor + 42, true);
    const nameStart = cursor + 46, next = nameStart + nameLength + extraLength + comment;
    if (next > input.byteLength || comment !== 0 || (flags & 1) !== 0 || (flags & 8) !== 0 || method !== 0 || compressed !== uncompressed || !safePath(textDecoder.decode(input.subarray(nameStart, nameStart + nameLength))) || (flags & ~0x0800) !== 0)
      throw new Error('Portable ZIP entry is compressed, encrypted or unsafe');
    const name = textDecoder.decode(input.subarray(nameStart, nameStart + nameLength));
    if (names.has(name) || localOffset + 30 > input.byteLength || view.getUint32(localOffset, true) !== ZIP_LOCAL_SIGNATURE)
      throw new Error('Portable ZIP has duplicate or invalid entry');
    const localNameLength = view.getUint16(localOffset + 26, true), localExtraLength = view.getUint16(localOffset + 28, true);
    const localNameStart = localOffset + 30;
    const dataStart = localNameStart + localNameLength + localExtraLength;
    if (localNameLength !== nameLength || !input.subarray(localNameStart, localNameStart + localNameLength).every((byte, nameIndex) => byte === input[nameStart + nameIndex]) || view.getUint32(localOffset + 14, true) !== view.getUint32(cursor + 16, true) || view.getUint32(localOffset + 18, true) !== compressed || view.getUint32(localOffset + 22, true) !== uncompressed || dataStart + uncompressed > input.byteLength || view.getUint16(localOffset + 6, true) !== flags || view.getUint16(localOffset + 8, true) !== method)
      throw new Error('Portable ZIP local entry is invalid');
    const data = copyBytes(input.subarray(dataStart, dataStart + uncompressed));
    if (crc32(data) !== view.getUint32(cursor + 16, true)) throw new Error('Portable ZIP checksum mismatch');
    names.add(name); entries.push({ name, data, method, flags }); cursor = next;
  }
  if (cursor !== centralOffset + centralSize) throw new Error('Portable ZIP directory size is invalid');
  return entries;
}

export function isPortableBundleManifest(value: unknown): value is PortableBundleManifest {
  if (!isRecord(value) || value.kind !== PORTABLE_BUNDLE_KIND || value.version !== PORTABLE_BUNDLE_VERSION || value.document !== PORTABLE_DOCUMENT_PATH || !Array.isArray(value.assets)) return false;
  if (value.assets.length > PORTABLE_MAX_ASSETS || typeof value.documentSha256 !== 'string' || !SHA256_PATTERN.test(value.documentSha256) || !Number.isInteger(value.documentByteLength) || value.documentByteLength < 1 || value.documentByteLength > PORTABLE_MAX_JSON_BYTES || !Number.isInteger(value.archiveByteLength) || value.archiveByteLength < 1 || value.archiveByteLength > PORTABLE_MAX_BYTES) return false;
  const paths = new Set<string>();
  return value.assets.every((asset) => isRecord(asset) && typeof asset.id === 'string' && stableAssetId(asset.id) && asset.path === `${PORTABLE_ASSET_PREFIX}${asset.id}.png` && !paths.has(asset.path) && paths.add(asset.path) && typeof asset.sha256 === 'string' && SHA256_PATTERN.test(asset.sha256) && Number.isInteger(asset.byteLength) && asset.byteLength > 0 && asset.byteLength <= PORTABLE_MAX_ASSET_BYTES && Number.isInteger(asset.w) && Number.isInteger(asset.h) && asset.w >= 1 && asset.h >= 1 && asset.w <= 16000 && asset.h <= 16000 && asset.w * asset.h <= 16000000);
}

function portableDocument(value: Draft): PortableDocument {
  const { assets: _assets, cloud: _cloud, localRevision: _localRevision, ...document } = value;
  return document;
}

export async function writePortableBundle(input: unknown): Promise<Blob> {
  const draft = validateDraft(input);
  const document = portableDocument(draft);
  const documentBytes = jsonBytes(document);
  const assets: PortableAssetManifest[] = [];
  const files: { name: string; data: Uint8Array }[] = [];
  for (const id of Object.keys(draft.assets).sort()) {
    const asset = draft.assets[id];
    const bytes = decodeBase64(asset.url);
    if (bytes.byteLength > PORTABLE_MAX_ASSET_BYTES) throw new Error('Portable asset exceeds 16 MiB');
    const dimensions = readPngDimensions(bytes);
    if (dimensions.w !== asset.w || dimensions.h !== asset.h) throw new Error('Portable asset dimensions do not match the document');
    const path = `${PORTABLE_ASSET_PREFIX}${id}.png`;
    assets.push({ id, path, sha256: await sha256(bytes), byteLength: bytes.byteLength, w: asset.w, h: asset.h });
    files.push({ name: path, data: bytes });
  }
  if (assets.length > PORTABLE_MAX_ASSETS) throw new Error('Portable bundle has too many assets');
  const manifestWithoutSize = { kind: PORTABLE_BUNDLE_KIND, version: PORTABLE_BUNDLE_VERSION, document: PORTABLE_DOCUMENT_PATH, assets, documentSha256: await sha256(documentBytes), documentByteLength: documentBytes.byteLength };
  // The manifest carries the archive length. Its decimal digits affect the
  // archive length, so converge the small fixed point before returning bytes.
  let archiveByteLength = 0;
  let finalArchive = new Uint8Array();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const manifest = jsonBytes({ ...manifestWithoutSize, archiveByteLength });
    finalArchive = makeZip([{ name: PORTABLE_MANIFEST_PATH, data: manifest }, { name: PORTABLE_DOCUMENT_PATH, data: documentBytes }, ...files]);
    if (finalArchive.byteLength === archiveByteLength) break;
    archiveByteLength = finalArchive.byteLength;
  }
  if (finalArchive.byteLength !== archiveByteLength) throw new Error('Portable archive length could not be stabilized');
  if (finalArchive.byteLength > PORTABLE_MAX_BYTES) throw new Error('Portable bundle exceeds 64 MiB');
  return new Blob([finalArchive], { type: 'application/zip' });
}

/** Alias used by callers that prefer the project terminology. */
export const createPortableProjectBundle = writePortableBundle;

export async function readPortableBundle(input: Uint8Array | ArrayBuffer | Blob | string | unknown): Promise<Draft> {
  // v1/v2 JSON project files remain directly importable.
  if (typeof input === 'string') {
    try { return validateDraft(JSON.parse(input)); } catch { throw new Error('Invalid project file'); }
  }
  if (isRecord(input) && !(input instanceof Blob) && !(input instanceof Uint8Array) && !(input instanceof ArrayBuffer)) return validateDraft(input);
  if (!(input instanceof Blob) && !(input instanceof Uint8Array) && !(input instanceof ArrayBuffer)) throw new Error('Portable bundle input is invalid');
  const bytes = await asBytes(input);
  const entries = parseZip(bytes);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  if (byName.size !== entries.length || !byName.has(PORTABLE_MANIFEST_PATH) || !byName.has(PORTABLE_DOCUMENT_PATH)) throw new Error('Portable bundle is missing manifest or document');
  const manifestBytes = byName.get(PORTABLE_MANIFEST_PATH)!.data;
  const documentBytes = byName.get(PORTABLE_DOCUMENT_PATH)!.data;
  if (manifestBytes.byteLength > PORTABLE_MAX_JSON_BYTES || documentBytes.byteLength > PORTABLE_MAX_JSON_BYTES) throw new Error('Portable JSON exceeds 8 MiB');
  let manifest: unknown, document: unknown;
  try { manifest = JSON.parse(textDecoder.decode(manifestBytes)); document = JSON.parse(textDecoder.decode(documentBytes)); } catch { throw new Error('Portable JSON is invalid'); }
  if (!isPortableBundleManifest(manifest) || manifest.archiveByteLength !== bytes.byteLength || manifest.documentByteLength !== documentBytes.byteLength || manifest.documentSha256 !== await sha256(documentBytes)) throw new Error('Portable manifest integrity check failed');
  const expectedPaths = new Set([PORTABLE_MANIFEST_PATH, PORTABLE_DOCUMENT_PATH, ...manifest.assets.map((asset) => asset.path)]);
  if (expectedPaths.size !== entries.length || entries.some((entry) => !expectedPaths.has(entry.name))) throw new Error('Portable bundle has missing or unexpected entries');
  const assets: Assets = {};
  for (const item of manifest.assets) {
    const entry = byName.get(item.path);
    if (!entry) throw new Error('Portable bundle is missing an asset');
    if (entry.data.byteLength !== item.byteLength || await sha256(entry.data) !== item.sha256) throw new Error('Portable asset checksum mismatch');
    const dimensions = readPngDimensions(entry.data);
    if (dimensions.w !== item.w || dimensions.h !== item.h) throw new Error('Portable asset dimensions do not match the manifest');
    assets[item.id] = { url: `data:image/png;base64,${encodeBase64(entry.data)}`, w: item.w, h: item.h } satisfies Asset;
  }
  if (!isRecord(document)) throw new Error('Portable document is invalid');
  return validateDraft({ ...document, version: 2, assets });
}

export const readPortableProjectBundle = readPortableBundle;
export const decodePortableBundle = readPortableBundle;
export const createPortableBundle = writePortableBundle;
export const decodePortableProjectBundle = readPortableBundle;
export const isPortableManifest = isPortableBundleManifest;
export const writeProjectBundle = writePortableBundle;
export const readProjectBundle = readPortableBundle;
