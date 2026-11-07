import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLIPBOARD_MESSAGES,
  clipboardImageFile,
  imageFileFromClipboardItems,
  isClipboardImageType,
  isTextEditingTarget,
  pickClipboardImageType,
  readClipboardImage,
} from '../src/clipboardImage.ts';

const fileItem = (type, name = `clip.${type.split('/')[1]}`) => ({
  kind: 'file',
  type,
  getAsFile: () => new File([new Uint8Array([1, 2, 3])], name, { type }),
});
const stringItem = (type) => ({ kind: 'string', type, getAsFile: () => null });

test('image type detection accepts image/* only', () => {
  assert.equal(isClipboardImageType('image/png'), true);
  assert.equal(isClipboardImageType('image/svg+xml'), true);
  assert.equal(isClipboardImageType('text/plain'), false);
  assert.equal(isClipboardImageType('image/'), false);
  assert.equal(isClipboardImageType(''), false);
});

test('the most faithful clipboard image type is preferred', () => {
  assert.equal(pickClipboardImageType(['text/html', 'image/jpeg', 'image/png']), 'image/png');
  assert.equal(pickClipboardImageType(['image/jpeg', 'image/webp']), 'image/webp');
  assert.equal(pickClipboardImageType(['image/x-custom']), 'image/x-custom');
  assert.equal(pickClipboardImageType(['text/plain', 'text/html']), null);
  assert.equal(pickClipboardImageType([]), null);
});

test('paste event items yield the image file and ignore text entries', () => {
  const file = imageFileFromClipboardItems([
    stringItem('text/plain'),
    fileItem('image/jpeg'),
    fileItem('image/png'),
  ]);
  assert.ok(file);
  assert.equal(file.type, 'image/png');
  assert.equal(imageFileFromClipboardItems([stringItem('text/plain')]), null);
  assert.equal(imageFileFromClipboardItems([{ kind: 'file', type: 'application/pdf', getAsFile: () => null }]), null);
  assert.equal(imageFileFromClipboardItems(null), null);
  assert.equal(imageFileFromClipboardItems(undefined), null);
});

test('clipboard blobs get a stable importable filename', () => {
  const png = clipboardImageFile(new Blob([new Uint8Array([1])], { type: 'image/png' }));
  assert.equal(png.name, 'Pasted image.png');
  assert.equal(png.type, 'image/png');
  const jpeg = clipboardImageFile(new Blob([new Uint8Array([1])]), 'image/jpeg');
  assert.equal(jpeg.name, 'Pasted image.jpg');
  assert.equal(jpeg.type, 'image/jpeg');
  assert.equal(clipboardImageFile(new Blob([]), 'image/x-unknown').name, 'Pasted image.png');
});

test('text-editing targets keep native paste', () => {
  assert.equal(isTextEditingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTextEditingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTextEditingTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTextEditingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTextEditingTarget({ tagName: 'BODY', isContentEditable: false }), false);
  assert.equal(isTextEditingTarget({ tagName: 'CANVAS' }), false);
  assert.equal(isTextEditingTarget(null), false);
});

test('async clipboard read returns the preferred image blob', async () => {
  const png = new Blob([new Uint8Array([137, 80])], { type: 'image/png' });
  const requested = [];
  const result = await readClipboardImage({
    read: async () => [
      { types: ['text/plain'], getType: async () => new Blob(['hi']) },
      {
        types: ['text/html', 'image/png'],
        getType: async (type) => {
          requested.push(type);
          return png;
        },
      },
    ],
  });
  assert.deepEqual(requested, ['image/png']);
  assert.equal(result.ok, true);
  assert.equal(result.blob, png);
  assert.equal(result.type, 'image/png');
});

test('async clipboard failures map to actionable messages', async () => {
  const unsupported = await readClipboardImage(undefined);
  assert.deepEqual(unsupported, { ok: false, reason: 'unsupported', message: CLIPBOARD_MESSAGES.unsupported });
  assert.equal((await readClipboardImage({})).reason, 'unsupported');

  const rejectWith = (name) => ({
    read: async () => {
      const error = new Error(name);
      error.name = name;
      throw error;
    },
  });
  const denied = await readClipboardImage(rejectWith('NotAllowedError'));
  assert.equal(denied.reason, 'denied');
  assert.equal(denied.message, CLIPBOARD_MESSAGES.denied);
  assert.equal((await readClipboardImage(rejectWith('SecurityError'))).reason, 'denied');
  assert.equal((await readClipboardImage(rejectWith('DataError'))).reason, 'no-image');
  assert.equal((await readClipboardImage(rejectWith('TypeError'))).reason, 'failed');

  const textOnly = await readClipboardImage({
    read: async () => [{ types: ['text/plain'], getType: async () => new Blob(['x']) }],
  });
  assert.equal(textOnly.reason, 'no-image');
  assert.equal(textOnly.message, CLIPBOARD_MESSAGES.noImage);
  assert.equal((await readClipboardImage({ read: async () => [] })).reason, 'no-image');

  const unreadable = await readClipboardImage({
    read: async () => [{ types: ['image/png'], getType: async () => { throw new Error('gone'); } }],
  });
  assert.equal(unreadable.reason, 'failed');
});
