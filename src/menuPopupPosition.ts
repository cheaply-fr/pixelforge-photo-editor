/**
 * Placement of a top-bar menu popup. The popup is drawn with fixed
 * positioning anchored to its trigger so a clipped (overflow:hidden) menu bar,
 * as on phones, never cuts it off; it is clamped to the viewport and scrolls
 * within the room left below the trigger. Pure.
 */
export type MenuAnchor = { left: number; right: number; bottom: number };
export type MenuPopupPlacement = { top: number; left: number; width: number; maxHeight: number };

export const MENU_POPUP_WIDTH = 220;
const MARGIN = 8;

export function menuPopupPlacement(
  anchor: MenuAnchor,
  viewport: { width: number; height: number },
  options: { alignRight: boolean; gap: number; phone: boolean },
): MenuPopupPlacement {
  const width = Math.max(120, Math.min(MENU_POPUP_WIDTH, options.phone ? viewport.width * 0.88 : MENU_POPUP_WIDTH, viewport.width - MARGIN * 2));
  const preferred = options.alignRight ? anchor.right - width : anchor.left;
  const left = Math.max(MARGIN, Math.min(preferred, viewport.width - MARGIN - width));
  const top = Math.max(0, anchor.bottom + options.gap);
  const room = viewport.height - top - MARGIN;
  const maxHeight = Math.max(120, Math.min(viewport.height * 0.75, 720, room));
  return { top, left, width, maxHeight };
}
