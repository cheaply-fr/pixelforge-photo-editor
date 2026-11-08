/**
 * React glue for the properties-sidebar auto-scroll. It owns one coordinator
 * per editor, feeds it a "commit happened" signal after every render of the
 * host component, and exposes stable `reveal` / `clear` callbacks.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { SidebarRevealCoordinator, type RevealRequest } from './sidebarAutoScroll.ts';
import { createDomRevealPorts, createInteractionTracker } from './sidebarAutoScrollDom.ts';
import type { SidebarSectionId } from './sidebarSections.ts';

export type SidebarAutoScroll = {
  reveal: (request: RevealRequest<Element>) => void;
  clear: () => void;
  cancel: () => void;
};

export function useSidebarAutoScroll(options: {
  container: RefObject<HTMLElement | null>;
  announcer: RefObject<HTMLElement | null>;
  expand: (section: SidebarSectionId) => void;
}): SidebarAutoScroll {
  const { container, announcer } = options;
  const expandRef = useRef(options.expand);
  const coordinatorRef = useRef<SidebarRevealCoordinator<Element> | null>(null);
  useLayoutEffect(() => {
    expandRef.current = options.expand;
  });
  useEffect(() => {
    let coordinator: SidebarRevealCoordinator<Element> | null = null;
    const tracker = createInteractionTracker(window, {
      container: () => container.current,
      onInteractionEnded: () => coordinator?.notifyInteractionEnded(),
      onUserScrollIntent: () => coordinator?.notifyUserScroll(),
    });
    coordinator = new SidebarRevealCoordinator<Element>(
      createDomRevealPorts({
        window,
        container: () => container.current,
        announcer: () => announcer.current,
        expand: (section) => expandRef.current(section),
        isInteractionActive: () => tracker.isActive(),
      }),
    );
    coordinatorRef.current = coordinator;
    return () => {
      coordinator?.dispose();
      tracker.dispose();
      coordinatorRef.current = null;
    };
  }, [container, announcer]);
  // Runs after every commit of the host: a pending reveal measures the
  // freshly committed DOM before the browser paints.
  useLayoutEffect(() => {
    coordinatorRef.current?.notifyCommit();
  });
  const reveal = useCallback((request: RevealRequest<Element>) => coordinatorRef.current?.request(request), []);
  const clear = useCallback(() => coordinatorRef.current?.clear(), []);
  const cancel = useCallback(() => coordinatorRef.current?.cancel(), []);
  return { reveal, clear, cancel };
}
