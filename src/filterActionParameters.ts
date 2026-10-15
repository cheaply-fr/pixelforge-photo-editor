import {
  effectiveFilterEffects,
  type FilterEffects,
} from './filterEffects.ts';
import type { ActionParameter } from './actions.ts';

/**
 * Capture only bounded, serializable filter controls in a recorded Action.
 * Filter Actions never retain pixels, assets, object URLs or source paths.
 */
export function filterActionParameters(
  value: Partial<FilterEffects> | undefined,
): Record<string, ActionParameter> {
  const effect = effectiveFilterEffects(value);
  return {
    amount: effect.amount,
    radius: effect.radius,
    angle: effect.angle,
    centerX: effect.centerX,
    centerY: effect.centerY,
    seed: effect.seed,
    threshold: effect.threshold ?? 25,
    noiseMonochromatic: effect.noiseMonochromatic === true,
    noiseDistribution: effect.noiseDistribution === 'gaussian' ? 'gaussian' : 'uniform',
    gradientShadow: effect.gradientMap?.shadow ?? '#000000',
    gradientHighlight: effect.gradientMap?.highlight ?? '#ffffff',
    gradientBlend: effect.gradientMap?.blend ?? 'normal',
    gradientStops: JSON.stringify(effect.gradientMap?.stops ?? []),
    filterExtra: JSON.stringify({
      ...(effect.radialMode ? { radialMode: effect.radialMode } : {}),
      ...(effect.lensDirection ? { lensDirection: effect.lensDirection } : {}),
      ...(effect.path ? { path: effect.path, pathCentered: effect.pathCentered, pathTaper: effect.pathTaper } : {}),
      ...(effect.spinEllipse ? { spinEllipse: effect.spinEllipse } : {}),
      ...(effect.fieldPoints ? { fieldPoints: effect.fieldPoints } : {}),
      ...(effect.tiltShift ? { tiltShift: effect.tiltShift } : {}),
      ...(effect.colorHalftone ? { colorHalftone: effect.colorHalftone } : {}),
      ...(effect.mezzotint ? { mezzotint: effect.mezzotint } : {}),
      ...(effect.fibers ? { fibers: effect.fibers } : {}),
      ...(effect.tree ? { tree: effect.tree } : {}),
      ...(effect.deinterlace ? { deinterlace: effect.deinterlace } : {}),
      ...(effect.vanishingPoint ? { vanishingPoint: effect.vanishingPoint } : {}),
    }),
  };
}
