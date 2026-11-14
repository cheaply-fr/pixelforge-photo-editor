/**
 * Edit > Toggle Last State (Ctrl+Alt+Z): switch between the current history
 * state and the one before it, and back again on the next press. The anchor
 * remembers the pair by identity, so any other history move (Undo, Redo, a
 * History panel jump or a new edit) starts a fresh toggle from wherever the
 * document now is.
 */
export type ToggleAnchor<T> = {
  from: number;
  to: number;
  fromState: T;
  toState: T;
};

export function resolveToggleLastState<T>(
  history: readonly T[],
  index: number,
  anchor?: ToggleAnchor<T> | null,
): { target: number; anchor: ToggleAnchor<T> } | undefined {
  if (
    anchor &&
    index === anchor.to &&
    history[anchor.to] === anchor.toState &&
    history[anchor.from] === anchor.fromState
  ) {
    return {
      target: anchor.from,
      anchor: { from: anchor.to, to: anchor.from, fromState: anchor.toState, toState: anchor.fromState },
    };
  }
  const target = index > 0 ? index - 1 : index < history.length - 1 ? index + 1 : undefined;
  if (target === undefined || index < 0 || index >= history.length) return undefined;
  return {
    target,
    anchor: { from: index, to: target, fromState: history[index], toState: history[target] },
  };
}
