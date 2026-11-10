import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  LAYER_THUMBNAIL_DELAY_MS,
  cachedLayerThumbnail,
  layerThumbnailKey,
  layerThumbnailSize,
  requestLayerThumbnail,
  type ThumbnailLayer,
} from './layerThumbnails';
import type { AnyAsset } from './tiledAssets';

type Props = {
  layer: ThumbnailLayer & { id: string };
  frame: { w: number; h: number };
  /** Reads the document's current assets (they live outside React state). */
  assets?: () => Readonly<Record<string, AnyAsset | undefined>>;
  /** Shown while no thumbnail is available (and for non-raster layers). */
  fallback: ReactNode;
};

/**
 * A decorative layer thumbnail in a Layers panel row (src/layerThumbnails.ts).
 * The row's accessible name stays "Select layer <name>", so the image has an
 * empty alt. It draws only once the row is on screen and the layer has not
 * changed for a short moment, and keeps the previous image meanwhile.
 */
export default function LayerThumbnail({ layer, frame, assets, fallback }: Props) {
  const box = useRef<HTMLSpanElement>(null);
  // Without IntersectionObserver every row counts as on screen.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver !== 'function');
  const [shown, setShown] = useState<{ key: string; url: string } | null>(null);
  const key = assets ? layerThumbnailKey(layer, frame, assets()) : undefined;
  const cached = key ? cachedLayerThumbnail(key) : undefined;
  useEffect(() => {
    const element = box.current;
    if (!element || !key) return;
    if (typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [key]);
  const latest = useRef({ layer, frame, assets });
  useEffect(() => {
    latest.current = { layer, frame, assets };
  });
  const shownKey = shown?.key;
  useEffect(() => {
    if (!key || !visible || shownKey === key) return;
    if (cached) return;
    let current = true;
    const timer = window.setTimeout(() => {
      const { layer: now, frame: size, assets: read } = latest.current;
      const all = read?.();
      const asset = all && now.asset ? all[now.asset] : undefined;
      // The layer changed again meanwhile: its own effect takes over.
      if (!all || !asset || layerThumbnailKey(now, size, all) !== key) return;
      void requestLayerThumbnail(key, now, size, asset, () => !current).then((url) => {
        if (current && url) setShown({ key, url });
      });
    }, LAYER_THUMBNAIL_DELAY_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [key, visible, cached, shownKey]);
  const size = layerThumbnailSize(frame.w, frame.h, 28);
  const url = key ? (cached ?? shown?.url) : undefined;
  return (
    <span
      ref={box}
      className={'layer-type' + (key ? ' layer-thumbnail' : '')}
      data-testid={key ? 'layer-thumbnail' : undefined}
      data-thumbnail-state={key ? (url ? (cached || shownKey === key ? 'ready' : 'stale') : 'pending') : undefined}
    >
      {url ? (
        <img src={url} alt="" aria-hidden="true" width={size.w} height={size.h} draggable={false} />
      ) : (
        fallback
      )}
    </span>
  );
}
