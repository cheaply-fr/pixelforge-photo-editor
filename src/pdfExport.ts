/**
 * Bounded single-page PDF composite encoder.
 *
 * The PDF contains one JPEG image XObject and no editable layers, text,
 * profiles or source metadata. It is a share/interchange output; the
 * .pixelforge project remains the editable recovery format.
 */

export const PDF_EXPORT_MIME = 'application/pdf';
export const PDF_EXPORT_MAX_PIXELS = 16_000_000;
export const PDF_EXPORT_MAX_DIMENSION = 30_000;

function validDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= PDF_EXPORT_MAX_DIMENSION;
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** Build a deterministic PDF around an already encoded opaque JPEG. */
export function buildPdfFromJpeg(
  jpeg: Uint8Array,
  width: number,
  height: number,
): Blob {
  if (!validDimension(width) || !validDimension(height))
    throw new Error('PDF export dimensions are outside the supported range.');
  if (width * height > PDF_EXPORT_MAX_PIXELS)
    throw new Error('PDF export is limited to 16 megapixels.');
  if (!jpeg.length || jpeg[0] !== 0xff || jpeg[1] !== 0xd8)
    throw new Error('PDF export requires a valid JPEG composite.');

  const parts: Uint8Array[] = [
    Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xff, 0xff, 0xff, 0xff, 0x0a]),
  ];
  const offsets = [0];
  let cursor = parts[0].length;
  const addObject = (id: number, body: Uint8Array[]) => {
    offsets[id] = cursor;
    const start = ascii(`${id} 0 obj\n`);
    const end = ascii('\nendobj\n');
    parts.push(start, ...body, end);
    cursor += start.length + body.reduce((sum, part) => sum + part.length, 0) + end.length;
  };

  addObject(1, [ascii('<< /Type /Catalog /Pages 2 0 R >>')]);
  addObject(2, [ascii('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')]);
  addObject(3, [
    ascii(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
  ]);
  addObject(4, [
    ascii(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
    jpeg,
    ascii('\nendstream'),
  ]);
  const content = ascii(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`);
  addObject(5, [ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii('endstream')]);

  const xrefOffset = cursor;
  const xref = [`xref\n0 6\n0000000000 65535 f \n`];
  for (let id = 1; id <= 5; id += 1)
    xref.push(`${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`);
  xref.push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  parts.push(ascii(xref.join('')));
  return new Blob(parts.map((part) => part.buffer as ArrayBuffer), { type: PDF_EXPORT_MIME });
}

/** Flatten transparency over white and encode a local single-page PDF. */
export async function encodePdfComposite(image: HTMLCanvasElement): Promise<Blob> {
  if (!validDimension(image.width) || !validDimension(image.height))
    throw new Error('PDF export dimensions are outside the supported range.');
  if (image.width * image.height > PDF_EXPORT_MAX_PIXELS)
    throw new Error('PDF export is limited to 16 megapixels.');
  const output = image.ownerDocument.createElement('canvas');
  output.width = image.width;
  output.height = image.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('PDF export is unavailable in this browser.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(image, 0, 0);
  const jpeg = await new Promise<Blob | null>((resolve) =>
    output.toBlob(resolve, 'image/jpeg', 0.95),
  );
  if (!jpeg || jpeg.type !== 'image/jpeg' || !jpeg.size)
    throw new Error('The browser could not encode the PDF composite.');
  return buildPdfFromJpeg(new Uint8Array(await jpeg.arrayBuffer()), image.width, image.height);
}
