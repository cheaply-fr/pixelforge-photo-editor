import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_DOCUMENT_METADATA,
  normalizeDocumentMetadata,
  type DocumentMetadata,
} from './metadata';

type Props = {
  metadata?: DocumentMetadata;
  close: () => void;
  apply: (metadata: DocumentMetadata) => void;
};

export default function MetadataDialog({ metadata, close, apply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(metadata?.title ?? DEFAULT_DOCUMENT_METADATA.title);
  const [description, setDescription] = useState(
    metadata?.description ?? DEFAULT_DOCUMENT_METADATA.description,
  );
  const [author, setAuthor] = useState(metadata?.author ?? DEFAULT_DOCUMENT_METADATA.author);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="editor-dialog metadata-dialog"
      aria-labelledby="metadata-heading"
      onCancel={close}
      onClose={close}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            apply(normalizeDocumentMetadata({ title, description, author }));
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : 'File info is invalid.');
          }
        }}
      >
        <h2 id="metadata-heading">File Info &amp; Privacy</h2>
        <p>
          These editable fields stay in your local draft and <code>.pixelforge</code> project.
          Browser image exports contain rendered pixels only.
        </p>
        <label>
          Title
          <input
            aria-label="Document title"
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Description
          <textarea
            aria-label="Document description"
            maxLength={2000}
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label>
          Author
          <input
            aria-label="Document author"
            maxLength={160}
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
          />
        </label>
        <p className="export-format-note">
          Privacy default: strip source EXIF/GPS metadata and source color profiles from image
          exports. The values above are never uploaded by anonymous editing.
        </p>
        {error && <p role="alert" data-testid="metadata-error" className="resize-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit">Save file info</button>
        </div>
      </form>
    </dialog>
  );
}
