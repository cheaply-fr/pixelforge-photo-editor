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
  };
}
