import { shapePoints, type ParametricShapeVariant } from './vectorShapes.ts';
import { validatePath, type PathModel } from './paths.ts';

export const COOKIE_CUTTER_SHAPES = ['rectangle', 'ellipse', 'triangle', 'star', 'hexagon'] as const;
export type CookieCutterShape = (typeof COOKIE_CUTTER_SHAPES)[number];

/** Build a bounded editable vector-mask path for the Cookie Cutter command. */
export function cookieCutterPath(width: number, height: number, shape: CookieCutterShape): PathModel {
  if (!COOKIE_CUTTER_SHAPES.includes(shape)) throw new Error('Cookie Cutter shape is invalid');
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 16000 || height > 16000)
    throw new Error('Cookie Cutter dimensions are invalid');
  if (shape === 'rectangle') {
    return validatePath({
      nodes: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }],
      closed: true, fill: true, stroke: false, strokeWidth: 0,
      fillColor: '#ffffff', strokeColor: '#000000',
    });
  }
  const variant: ParametricShapeVariant = shape === 'ellipse' ? 'polygon' : shape === 'hexagon' ? 'polygon' : shape;
  const sides = shape === 'ellipse' ? 48 : shape === 'hexagon' ? 6 : shape === 'triangle' ? 3 : 5;
  const points = shape === 'ellipse'
    ? Array.from({ length: sides }, (_, index) => ({
      x: width / 2 + Math.cos(-Math.PI / 2 + (index * Math.PI * 2) / sides) * width / 2,
      y: height / 2 + Math.sin(-Math.PI / 2 + (index * Math.PI * 2) / sides) * height / 2,
    }))
    : shapePoints(width, height, variant, sides);
  return validatePath({
    nodes: points,
    closed: true, fill: true, stroke: false, strokeWidth: 0,
    fillColor: '#ffffff', strokeColor: '#000000',
  });
}
