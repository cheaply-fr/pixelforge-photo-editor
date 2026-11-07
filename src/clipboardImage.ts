/**
 * Operating-system clipboard image paste helpers.
 *
 * PixelForge keeps its private layer clipboard authoritative while it holds a
 * copied layer. When it is empty, an image on the OS clipboard can be pasted
 * as a new raster layer either from a native `paste` event (Ctrl/Cmd+V) or
 * from Edit → Paste Image from Clipboard, which uses the asynchronous
 * Clipboard API. Image bytes are decoded locally and never uploaded.
 */

/** Preferred clipboard image types, most faithful first. */
export const CLIPBOARD_IMAGE_TYPES = [
  'image/png',
  'image/webp',
  'image/jpeg',
  'image/gif',
  'image/bmp',
  'image/avif',
] as const;

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

export const CLIPBOARD_MESSAGES = {
  unsupported:
    'This browser cannot read images from the clipboard here. Press Ctrl+V (⌘V on Mac) on the canvas, or use Add image layer.',
  denied:
    'Clipboard access was blocked. Allow clipboard access for this site, or press Ctrl+V (⌘V on Mac) on the canvas.',
  noImage: 'The clipboard does not contain an image.',
  failed: 'The clipboard image could not be read. Your document is unchanged.',
} as const;

export type ClipboardImageResult =
  | { ok: true; blob: Blob; type: string }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no-image' | 'failed'; message: string };

type ItemLike = { kind: string; type: string; getAsFile(): File | null };

/** Return true for an `image/*` MIME type PixelForge may try to decode. */
export function isClipboardImageType(type: string): boolean {
  return /^image\/[a-z0-9.+-]+$/i.test(type);
}

/** Choose the most faithful image type offered by one clipboard item. */
export function pickClipboardImageType(types: readonly string[]): string | null {
  for (const preferred of CLIPBOARD_IMAGE_TYPES)
    if (types.includes(preferred)) return preferred;
  return types.find(isClipboardImageType) ?? null;
}

/**
 * Extract the first image file from a paste event's `clipboardData.items`.
 * Non-file and non-image entries (text, HTML) are ignored.
 */
export function imageFileFromClipboardItems(items: ArrayLike<ItemLike> | null | undefined): File | null {
  if (!items) return null;
  const list = Array.from(items).filter(
    (item) => item.kind === 'file' && isClipboardImageType(item.type),
  );
  const type = pickClipboardImageType(list.map((item) => item.type));
  const item = list.find((entry) => entry.type === type);
  return item?.getAsFile() ?? null;
}

/** Give a clipboard blob a stable local filename so the import path can describe it. */
export function clipboardImageFile(blob: Blob, type = blob.type): File {
  const extension = EXTENSIONS[type] ?? 'png';
  return new File([blob], `Pasted image.${extension}`, { type });
}

/** True when a paste/keyboard target is a native text-editing control. */
export function isTextEditingTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  return (
    (typeof element.tagName === 'string' && /^(INPUT|TEXTAREA|SELECT)$/.test(element.tagName)) ||
    element.isContentEditable === true
  );
}

type ClipboardItemLike = { types: readonly string[]; getType(type: string): Promise<Blob> };
type AsyncClipboardLike = { read?: () => Promise<readonly ClipboardItemLike[]> };

/**
 * Read the first image from the asynchronous Clipboard API. Browsers that do
 * not expose `navigator.clipboard.read`, or that deny permission, receive a
 * specific actionable message instead of a generic failure.
 */
export async function readClipboardImage(
  clipboard: AsyncClipboardLike | null | undefined,
): Promise<ClipboardImageResult> {
  if (!clipboard || typeof clipboard.read !== 'function')
    return { ok: false, reason: 'unsupported', message: CLIPBOARD_MESSAGES.unsupported };
  let items: readonly ClipboardItemLike[];
  try {
    items = await clipboard.read();
  } catch (error) {
    const name = (error as { name?: unknown } | null)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError')
      return { ok: false, reason: 'denied', message: CLIPBOARD_MESSAGES.denied };
    if (name === 'DataError' || name === 'NotFoundError')
      return { ok: false, reason: 'no-image', message: CLIPBOARD_MESSAGES.noImage };
    return { ok: false, reason: 'failed', message: CLIPBOARD_MESSAGES.failed };
  }
  for (const item of items ?? []) {
    const type = pickClipboardImageType(item.types ?? []);
    if (!type) continue;
    try {
      const blob = await item.getType(type);
      return { ok: true, blob, type };
    } catch {
      return { ok: false, reason: 'failed', message: CLIPBOARD_MESSAGES.failed };
    }
  }
  return { ok: false, reason: 'no-image', message: CLIPBOARD_MESSAGES.noImage };
}
