import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  FAVOURITE_FONTS_KEY,
  MAX_FAVOURITE_FONTS,
  MAX_RECENT_FONTS,
  RECENT_FONTS_KEY,
  parseStoredFamilies,
  pushRecentFamily,
  toggleFavouriteFamily,
} from './fontLibrary';
import { sharedFontLoader, type EnsureOptions, type FontLoadState } from './fontLoader';

/** Live load state of a family; optionally starts loading it. */
export function useFontLoadState(family: string, ensure?: EnsureOptions | false): FontLoadState {
  const loader = sharedFontLoader();
  const subscribe = useCallback((notify: () => void) => loader.subscribe((changed) => changed === family && notify()), [loader, family]);
  const state = useSyncExternalStore(subscribe, () => loader.state(family), () => loader.state(family));
  const enabled = Boolean(ensure);
  const weight = ensure ? ensure.weight : undefined;
  const style = ensure ? ensure.style : undefined;
  const text = ensure ? ensure.text : undefined;
  const priority = ensure ? ensure.priority : undefined;
  useEffect(() => {
    if (enabled) void loader.ensure(family, { weight, style, text, priority });
  }, [loader, family, enabled, weight, style, text, priority]);
  return state;
}

/** Re-render whenever any library family changes load state. */
export function useFontLoaderRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => sharedFontLoader().subscribe(() => setRevision((value) => value + 1)), []);
  return revision;
}

function readStored(key: string, limit: number): string[] {
  try {
    return parseStoredFamilies(globalThis.localStorage?.getItem(key) ?? '[]', limit);
  } catch {
    return [];
  }
}

function writeStored(key: string, value: string[]): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode); preferences stay in memory */
  }
}

/** Favourite and recent families kept in localStorage (per browser). */
export function useFontPreferences() {
  const [favourites, setFavourites] = useState(() => readStored(FAVOURITE_FONTS_KEY, MAX_FAVOURITE_FONTS));
  const [recent, setRecent] = useState(() => readStored(RECENT_FONTS_KEY, MAX_RECENT_FONTS));
  const toggleFavourite = useCallback((family: string) => {
    setFavourites((current) => {
      const next = toggleFavouriteFamily(current, family);
      writeStored(FAVOURITE_FONTS_KEY, next);
      return next;
    });
  }, []);
  const markRecent = useCallback((family: string) => {
    setRecent((current) => {
      const next = pushRecentFamily(current, family);
      writeStored(RECENT_FONTS_KEY, next);
      return next;
    });
  }, []);
  return { favourites, recent, toggleFavourite, markRecent };
}
