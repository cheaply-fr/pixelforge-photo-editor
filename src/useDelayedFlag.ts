import { useEffect, useRef, useState } from 'react';
import { createDelayedFlag, type DelayedFlag } from './canvasPresentation';

/**
 * React view of {@link createDelayedFlag}: `value` must stay true for
 * `showDelayMs` before the result turns on, and false for `hideDelayMs`
 * before it turns off again.
 */
export function useDelayedFlag(value: boolean, showDelayMs: number, hideDelayMs: number): boolean {
  const [shown, setShown] = useState(false);
  const flag = useRef<DelayedFlag | null>(null);
  useEffect(() => {
    const created = createDelayedFlag({ showDelayMs, hideDelayMs, onChange: setShown });
    flag.current = created;
    return () => {
      created.dispose();
      flag.current = null;
      setShown(false);
    };
  }, [showDelayMs, hideDelayMs]);
  useEffect(() => {
    flag.current?.set(value);
  }, [value, showDelayMs, hideDelayMs]);
  return shown;
}
