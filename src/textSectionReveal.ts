/**
 * When a text layer becomes the selected layer through a user action
 * (a Layers panel click, or committing type), the inspector reveals the Text
 * section (Type / Character / Paragraph panels for that layer) using the
 * sidebar auto-scroll (docs/sidebar-autoscroll-contract.md). Re-selecting the
 * layer that was revealed last does not scroll again, so a user reading
 * elsewhere in the panel is not pulled back. Reveals never move keyboard
 * focus (the auto-scroll only scrolls and expands).
 */
export type TextRevealLayer = { id: string; kind: string };

/** The section to reveal for a selected layer, or undefined to leave the panel alone. */
export function textSectionToReveal(
  layer: TextRevealLayer | undefined,
  lastRevealedId: string | undefined,
): 'text' | undefined {
  if (!layer || layer.kind !== 'text') return undefined;
  if (layer.id === lastRevealedId) return undefined;
  return 'text';
}
