import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOWNLOAD_URL_REVOKE_DELAY_MS,
  downloadBlob,
  downloadMimeType,
  fileExtension,
  pickSaveFile,
  safeDownloadName,
  saveFilePickerOptions,
  supportsSaveFilePicker,
  typedDownloadBlob,
  writeToFileHandle,
} from '../src/download.ts';

function fakeEnvironment() {
  const events = [];
  const timers = [];
  const children = [];
  const body = {
    append(node) {
      children.push(node);
      node.parent = body;
      events.push('append');
    },
  };
  const environment = {
    document: {
      body,
      documentElement: body,
      createElement(tag) {
        assert.equal(tag, 'a');
        const anchor = {
          style: {},
          click() {
            events.push(`click:${anchor.parent === body ? 'attached' : 'detached'}:${anchor.download}:${anchor.href}`);
          },
          remove() {
            children.splice(children.indexOf(anchor), 1);
            anchor.parent = undefined;
            events.push('remove');
          },
        };
        return anchor;
      },
    },
    URL: {
      created: [],
      revoked: [],
      createObjectURL(blob) {
        this.created.push(blob);
        return `blob:test/${this.created.length}`;
      },
      revokeObjectURL(url) {
        this.revoked.push(url);
        events.push(`revoke:${url}`);
      },
    },
    setTimeout(callback, ms) {
      timers.push({ callback, ms });
    },
  };
  return { environment, events, timers, children };
}

test('file extensions and MIME types follow the export filename', () => {
  assert.equal(fileExtension('photo.PNG'), 'png');
  assert.equal(fileExtension('my.project.pixelforge'), 'pixelforge');
  assert.equal(fileExtension('noext'), '');
  assert.equal(downloadMimeType('a.png'), 'image/png');
  assert.equal(downloadMimeType('a.jpg'), 'image/jpeg');
  assert.equal(downloadMimeType('a.webp'), 'image/webp');
  assert.equal(downloadMimeType('a.psd'), 'image/vnd.adobe.photoshop');
  assert.equal(downloadMimeType('a.pdf'), 'application/pdf');
  assert.equal(downloadMimeType('a.pixelforge'), 'application/zip');
  assert.equal(downloadMimeType('a-history.zip'), 'application/zip');
  assert.equal(downloadMimeType('a.unknown'), 'application/octet-stream');
});

test('untyped blobs are labelled, typed blobs are never relabelled', () => {
  const untyped = new Blob([new Uint8Array([1, 2])]);
  const labelled = typedDownloadBlob(untyped, 'x.png');
  assert.equal(labelled.type, 'image/png');
  assert.equal(labelled.size, 2);
  const octet = typedDownloadBlob(new Blob([new Uint8Array([1])], { type: 'application/octet-stream' }), 'x.pdf');
  assert.equal(octet.type, 'application/pdf');
  // A PNG fallback from a JPEG encoder must keep its real type.
  const png = new Blob([new Uint8Array([1])], { type: 'image/png' });
  assert.equal(typedDownloadBlob(png, 'x.jpg'), png);
  const unknown = new Blob([new Uint8Array([1])]);
  assert.equal(typedDownloadBlob(unknown, 'x.bin'), unknown);
});

test('suggested names drop path separators and control characters', () => {
  assert.equal(safeDownloadName('../../etc/passwd.png'), '-..-etc-passwd.png');
  assert.equal(safeDownloadName('a/b\\c:d.png'), 'a-b-c-d.png');
  assert.equal(safeDownloadName('line\nbreak.png'), 'line-break.png');
  assert.equal(safeDownloadName('...'), 'pixelforge-export');
  assert.equal(safeDownloadName('   '), 'pixelforge-export');
  assert.equal(safeDownloadName('x'.repeat(300)).length, 200);
  assert.equal(safeDownloadName('Cosmic eye.png'), 'Cosmic eye.png');
});

test('anchor downloads attach before click, detach after, and revoke late', () => {
  const { environment, events, timers, children } = fakeEnvironment();
  const blob = new Blob([new Uint8Array([1, 2, 3])]);
  downloadBlob(blob, 'Poster.png', environment);
  assert.deepEqual(events, ['append', 'click:attached:Poster.png:blob:test/1', 'remove']);
  assert.equal(children.length, 0);
  assert.equal(environment.URL.created[0].type, 'image/png', 'untyped export blob is given the PNG MIME type');
  assert.equal(environment.URL.revoked.length, 0, 'URL must outlive the click');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, DOWNLOAD_URL_REVOKE_DELAY_MS);
  assert.ok(DOWNLOAD_URL_REVOKE_DELAY_MS >= 30_000);
  timers[0].callback();
  assert.deepEqual(environment.URL.revoked, ['blob:test/1']);
});

test('each download receives its own object URL', () => {
  const { environment } = fakeEnvironment();
  const blob = new Blob([new Uint8Array([1])], { type: 'application/zip' });
  downloadBlob(blob, 'a.pixelforge', environment);
  downloadBlob(blob, 'a.pixelforge', environment);
  assert.equal(environment.URL.created.length, 2);
  assert.equal(environment.URL.created[0], blob, 'typed blob passed through unchanged');
});

test('a throwing click still removes the anchor and schedules revocation', () => {
  const { environment, events, timers } = fakeEnvironment();
  const create = environment.document.createElement;
  environment.document.createElement = (tag) => {
    const anchor = create(tag);
    anchor.click = () => {
      throw new Error('blocked');
    };
    return anchor;
  };
  assert.throws(() => downloadBlob(new Blob([]), 'x.png', environment), /blocked/);
  assert.deepEqual(events, ['append', 'remove']);
  assert.equal(timers.length, 1);
});

test('file picker support requires the API in a secure context', () => {
  assert.equal(supportsSaveFilePicker({}), false);
  assert.equal(supportsSaveFilePicker(null), false);
  assert.equal(supportsSaveFilePicker({ showSaveFilePicker: () => {} }), true);
  assert.equal(supportsSaveFilePicker({ showSaveFilePicker: () => {}, isSecureContext: false }), false);
});

test('file picker options restrict the type to the export format', () => {
  assert.deepEqual(saveFilePickerOptions('Poster.webp'), {
    suggestedName: 'Poster.webp',
    types: [{ description: 'WebP image', accept: { 'image/webp': ['.webp'] } }],
  });
  assert.deepEqual(saveFilePickerOptions('Poster.pixelforge').types[0].accept, {
    'application/zip': ['.pixelforge'],
  });
  assert.deepEqual(saveFilePickerOptions('noext').types, []);
});

test('picker results distinguish saved, cancelled and unavailable', async () => {
  const written = [];
  const handle = {
    async createWritable() {
      return {
        async write(data) {
          written.push(data);
        },
        async close() {
          written.push('closed');
        },
      };
    },
  };
  let options;
  const picked = await pickSaveFile('a.png', {
    showSaveFilePicker: async (value) => {
      options = value;
      return handle;
    },
  });
  assert.equal(picked.status, 'picked');
  assert.equal(options.suggestedName, 'a.png');
  const blob = new Blob([new Uint8Array([9])]);
  await writeToFileHandle(picked.handle, blob);
  assert.deepEqual(written, [blob, 'closed']);

  const reject = (name) => ({
    showSaveFilePicker: async () => {
      const error = new Error(name);
      error.name = name;
      throw error;
    },
  });
  assert.deepEqual(await pickSaveFile('a.png', reject('AbortError')), { status: 'cancelled' });
  const blocked = await pickSaveFile('a.png', reject('SecurityError'));
  assert.equal(blocked.status, 'unavailable');
  assert.match(blocked.reason, /blocked/);
  assert.equal((await pickSaveFile('a.png', reject('TypeError'))).status, 'unavailable');
  assert.equal((await pickSaveFile('a.png', {})).status, 'unavailable');
});
