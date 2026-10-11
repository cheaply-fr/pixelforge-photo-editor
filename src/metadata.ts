/** Bounded File Info stays in the local draft and portable project only. */
export type DocumentMetadata = {
  title: string;
  description: string;
  author: string;
};

export const DEFAULT_DOCUMENT_METADATA: DocumentMetadata = {
  title: '',
  description: '',
  author: '',
};
export const METADATA_LIMITS = { title: 160, description: 2000, author: 160 } as const;
const FIELDS = ['title', 'description', 'author'] as const;

function safeText(value: unknown, max: number, multiline = false): value is string {
  return (
    typeof value === 'string' && value.length <= max &&
    !Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && !(multiline && code === 10)) || (code >= 127 && code <= 159);
    })
  );
}

function metadataRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === FIELDS.length &&
    Object.keys(value).every((field) => FIELDS.includes(field as typeof FIELDS[number]));
}

/** Only the three canonical fields may enter storage; LF is allowed in description. */
export function validDocumentMetadata(value: unknown): value is DocumentMetadata {
  return metadataRecord(value) &&
    safeText(value.title, METADATA_LIMITS.title) &&
    safeText(value.description, METADATA_LIMITS.description, true) &&
    safeText(value.author, METADATA_LIMITS.author);
}

/** Normalize textarea line endings and validate before saving or accepting imports. */
export function normalizeDocumentMetadata(value: unknown): DocumentMetadata {
  if (!metadataRecord(value)) throw new Error('File info must contain only title, description and author.');
  const description = typeof value.description === 'string'
    ? value.description.replace(/\r\n?/g, '\n') : value.description;
  for (const field of FIELDS) {
    const entry = field === 'description' ? description : value[field];
    if (!safeText(entry, METADATA_LIMITS[field], field === 'description'))
      throw new Error(`${field[0].toUpperCase()}${field.slice(1)} must be text within ${METADATA_LIMITS[field]} characters without unsupported control characters.`);
  }
  return {
    title: (value.title as string).trim(),
    description: (description as string).trim(),
    author: (value.author as string).trim(),
  };
}

/** Legacy projects omit metadata. Valid fields are copied without retaining unknown keys. */
export function effectiveDocumentMetadata(value: unknown): DocumentMetadata {
  if (value === undefined) return { ...DEFAULT_DOCUMENT_METADATA };
  return normalizeDocumentMetadata(value);
}
