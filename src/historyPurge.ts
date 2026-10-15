import type { Frame } from './document';

export function purgeUndoHistory(history: Frame[], index: number): Frame[] {
  if (!Number.isInteger(index) || index < 0 || index >= history.length || !history.length)
    throw new Error('Cannot purge an invalid history position');
  return [history[index]];
}
