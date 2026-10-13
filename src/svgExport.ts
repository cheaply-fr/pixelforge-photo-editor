import { serializePathData, validatePath, type PathModel } from './paths.ts';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Serialize one validated world-space path as a standalone, deterministic SVG. */
export function pathToSvg(path: PathModel, width: number, height: number): string {
  if (!finite(width) || !finite(height) || width < 1 || height < 1 || width > 16000 || height > 16000)
    throw new Error('SVG dimensions are invalid');
  const valid = validatePath(path), d = serializePathData(valid);
  const fill = valid.fill ? valid.fillColor : 'none';
  const stroke = valid.stroke ? valid.strokeColor : 'none';
  const rule = valid.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width)}" height="${Math.round(height)}" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}"><path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${valid.strokeWidth}"${rule}/></svg>`;
}
