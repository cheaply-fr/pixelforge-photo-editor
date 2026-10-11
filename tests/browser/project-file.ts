import { readPortableBundle } from '../../src/portableBundle';
import { readFile } from 'node:fs/promises';

/** Read the current .pixelforge download, regardless of its temporary path. */
export async function downloadedProject(path: string): Promise<ReturnType<typeof JSON.parse>> {
  const bytes = await readFile(path);
  return await readPortableBundle(new Blob([bytes])) as ReturnType<typeof JSON.parse>;
}
