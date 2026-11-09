import { useEffect, useRef, useState } from 'react';
import { Brush, Crop, Hand, Lasso, Layers, MousePointer2, Pipette, SlidersHorizontal, Sparkles, Stamp, Type } from 'lucide-react';
import {
  HERO_LOOKS,
  HERO_PHASES,
  HERO_POSTER_FRAME,
  HERO_STROKE_POINTS,
  applyHeroLook,
  catmullRom,
  heroFrame,
  partialStroke,
  type HeroFrame,
  type HeroLook,
  type HeroPhase,
} from './landingContent';

/** Internal resolution of the demo canvas; CSS scales it to the frame. */
const SCENE_W = 960;
const SCENE_H = 600;
const STROKE = catmullRom(HERO_STROKE_POINTS, 14);

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Paint the procedural "photo": dusk sky, sun, layered ridges and a lake. */
function paintScene(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#1d2a4d');
  sky.addColorStop(0.45, '#5b5d86');
  sky.addColorStop(0.8, '#d9927a');
  sky.addColorStop(1, '#f2c48f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Deterministic stars.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 70; i++) {
    const x = rand() * w;
    const y = rand() * h * 0.32;
    const r = rand() * 1.3 + 0.3;
    ctx.globalAlpha = 0.35 + rand() * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const sunX = w * 0.66;
  const sunY = h * 0.47;
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, h * 0.42);
  glow.addColorStop(0, 'rgba(255,214,150,0.95)');
  glow.addColorStop(0.18, 'rgba(255,180,120,0.55)');
  glow.addColorStop(1, 'rgba(255,140,100,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffe2b0';
  ctx.beginPath();
  ctx.arc(sunX, sunY, h * 0.075, 0, Math.PI * 2);
  ctx.fill();

  const ridge = (base: number, amp: number, freq: number, phase: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const n = Math.sin(x * freq + phase) * 0.6 + Math.sin(x * freq * 2.7 + phase * 1.9) * 0.3 + Math.sin(x * freq * 6.1 + phase) * 0.1;
      ctx.lineTo(x, h * base - n * h * amp);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  };
  ridge(0.5, 0.1, 0.006, 1.2, '#7a5f7e');
  ridge(0.56, 0.08, 0.009, 3.1, '#4e4466');
  ridge(0.62, 0.06, 0.013, 0.4, '#2c2d48');

  // Lake with reflected sun streaks.
  const lake = ctx.createLinearGradient(0, h * 0.62, 0, h);
  lake.addColorStop(0, '#c68a7a');
  lake.addColorStop(0.35, '#5b5476');
  lake.addColorStop(1, '#151a30');
  ctx.fillStyle = lake;
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  for (let i = 0; i < 22; i++) {
    const y = h * 0.63 + i * i * 0.45;
    const width = (w * 0.16) / (1 + i * 0.08);
    ctx.fillStyle = `rgba(255,214,160,${0.5 - i * 0.02})`;
    ctx.fillRect(sunX - width / 2 + Math.sin(i * 1.7) * 14, y, width, 2);
  }
  ctx.fillStyle = '#10131f';
  ridge(0.94, 0.03, 0.02, 2, '#10131f');
}

type Assets = { base: HTMLCanvasElement; looks: HTMLCanvasElement[] };

function buildAssets(): Assets | null {
  const base = document.createElement('canvas');
  base.width = SCENE_W;
  base.height = SCENE_H;
  const ctx = base.getContext('2d');
  if (!ctx) return null;
  paintScene(ctx, SCENE_W, SCENE_H);
  const source = ctx.getImageData(0, 0, SCENE_W, SCENE_H);
  const looks = HERO_LOOKS.map((_, index) => {
    const canvas = document.createElement('canvas');
    canvas.width = SCENE_W;
    canvas.height = SCENE_H;
    const lctx = canvas.getContext('2d')!;
    const copy = new ImageData(new Uint8ClampedArray(source.data), SCENE_W, SCENE_H);
    applyHeroLook(copy.data, index as HeroLook);
    lctx.putImageData(copy, 0, 0);
    return canvas;
  });
  return { base, looks };
}

function drawFrame(ctx: CanvasRenderingContext2D, assets: Assets, frame: HeroFrame) {
  const w = SCENE_W;
  const h = SCENE_H;
  ctx.globalAlpha = 1;
  ctx.drawImage(assets.base, 0, 0);

  // Graded side of the before/after comparison.
  const splitX = Math.round(w * frame.split);
  if (splitX < w) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, w - splitX, h);
    ctx.clip();
    ctx.drawImage(assets.looks[frame.look], 0, 0);
    if (frame.lookBlend > 0 && frame.look + 1 < assets.looks.length) {
      ctx.globalAlpha = frame.lookBlend;
      ctx.drawImage(assets.looks[frame.look + 1], 0, 0);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  // Brush stroke on its own layer.
  const stroke = partialStroke(STROKE, frame.stroke);
  if (stroke.length > 1) {
    ctx.save();
    ctx.globalAlpha = frame.fade;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const gradient = ctx.createLinearGradient(w * 0.1, 0, w * 0.9, 0);
    gradient.addColorStop(0, '#ff6b43');
    gradient.addColorStop(0.5, '#ff3d7f');
    gradient.addColorStop(1, '#8f6bff');
    const path = () => {
      ctx.beginPath();
      stroke.forEach(([x, y], i) => (i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h)));
    };
    ctx.strokeStyle = gradient;
    ctx.globalAlpha = 0.22 * frame.fade;
    ctx.lineWidth = 46;
    path();
    ctx.stroke();
    ctx.globalAlpha = 0.95 * frame.fade;
    ctx.lineWidth = 20;
    path();
    ctx.stroke();
    if (frame.phase === 'paint' && frame.stroke < 1) {
      const [tx, ty] = stroke[stroke.length - 1];
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx * w, ty * h, 24, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Editable type layer with transform handles.
  if (frame.text > 0) {
    ctx.save();
    ctx.globalAlpha = frame.text * frame.fade;
    ctx.font = '700 64px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    const label = 'Golden hour';
    const tw = ctx.measureText(label).width;
    const x = w * 0.08;
    const y = h * 0.2;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff7ec';
    ctx.fillText(label, x, y);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(120,200,255,0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 10, y - 44, tw + 20, 88);
    ctx.fillStyle = '#ffffff';
    for (const [hx, hy] of [[x - 10, y - 44], [x + tw + 10, y - 44], [x - 10, y + 44], [x + tw + 10, y + 44]]) {
      ctx.fillRect(hx - 5, hy - 5, 10, 10);
      ctx.strokeRect(hx - 5, hy - 5, 10, 10);
    }
    ctx.restore();
  }

  // Comparison handle.
  if (splitX > 0 && splitX < w) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(splitX - 1.5, 0, 3, h);
    ctx.beginPath();
    ctx.arc(splitX, h / 2, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16171d';
    ctx.beginPath();
    ctx.moveTo(splitX - 11, h / 2);
    ctx.lineTo(splitX - 4, h / 2 - 7);
    ctx.lineTo(splitX - 4, h / 2 + 7);
    ctx.moveTo(splitX + 11, h / 2);
    ctx.lineTo(splitX + 4, h / 2 - 7);
    ctx.lineTo(splitX + 4, h / 2 + 7);
    ctx.fill();
    ctx.font = '600 18px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(10,12,18,0.55)';
    if (splitX > 120) {
      ctx.fillRect(16, h - 46, 86, 30);
      ctx.fillStyle = '#fff';
      ctx.fillText('Before', 28, h - 40);
    }
    if (splitX < w - 120) {
      ctx.fillStyle = 'rgba(10,12,18,0.55)';
      ctx.fillRect(w - 88, h - 46, 72, 30);
      ctx.fillStyle = '#fff';
      ctx.fillText('After', w - 76, h - 40);
    }
    ctx.restore();
  }
}

const RAIL: { id: string; icon: typeof Brush; phase?: HeroPhase; label: string }[] = [
  { id: 'move', icon: MousePointer2, label: 'Move' },
  { id: 'hand', icon: Hand, label: 'Hand' },
  { id: 'lasso', icon: Lasso, label: 'Lasso' },
  { id: 'crop', icon: Crop, label: 'Crop' },
  { id: 'eyedropper', icon: Pipette, label: 'Eyedropper' },
  { id: 'brush', icon: Brush, phase: 'paint', label: 'Brush' },
  { id: 'stamp', icon: Stamp, label: 'Clone Stamp' },
  { id: 'adjust', icon: SlidersHorizontal, phase: 'adjust', label: 'Adjustments' },
  { id: 'filter', icon: Sparkles, phase: 'filter', label: 'Filters' },
  { id: 'type', icon: Type, phase: 'type', label: 'Type' },
];

type LayerRow = { id: string; name: string; kind: string; showFrom: HeroPhase };
const LAYERS: LayerRow[] = [
  { id: 'type', name: 'Golden hour', kind: 'T', showFrom: 'type' },
  { id: 'look', name: 'Look', kind: 'fx', showFrom: 'filter' },
  { id: 'curves', name: 'Curves 1', kind: '◐', showFrom: 'adjust' },
  { id: 'stroke', name: 'Brush stroke', kind: '✎', showFrom: 'paint' },
  { id: 'bg', name: 'Background', kind: '▣', showFrom: 'paint' },
];
const PHASE_ORDER: HeroPhase[] = ['paint', 'adjust', 'filter', 'type'];
const ACTIVE_LAYER: Record<HeroPhase, string> = { paint: 'stroke', adjust: 'curves', filter: 'look', type: 'type' };

/**
 * Animated mock of the editor: a canvas "document" painted, graded and typed
 * on a loop, framed by a tool rail and a layers panel. Motion pauses when the
 * demo is off screen or the tab is hidden, and is replaced by a still frame
 * when the visitor prefers reduced motion.
 */
export default function LandingHeroDemo() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<HeroPhase>(HERO_POSTER_FRAME.phase);
  const [look, setLook] = useState(0);
  const [animated] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    const target = canvas.current;
    const ctx = target?.getContext('2d');
    if (!target || !ctx) return;
    const assets = buildAssets();
    if (!assets) return;
    const reduce = prefersReducedMotion();
    if (reduce) {
      drawFrame(ctx, assets, HERO_POSTER_FRAME);
      target.dataset.ready = 'true';
      return;
    }
    let raf = 0;
    let visible = true;
    let elapsed = 0;
    let last = performance.now();
    let lastPhase: HeroPhase | null = null;
    let lastLook = -1;
    const tick = (now: number) => {
      elapsed += Math.min(100, now - last);
      last = now;
      const frame = heroFrame(elapsed);
      drawFrame(ctx, assets, frame);
      if (frame.phase !== lastPhase) setPhase((lastPhase = frame.phase));
      const shownLook = frame.lookBlend > 0.5 ? frame.look + 1 : frame.look;
      if (shownLook !== lastLook) setLook((lastLook = shownLook));
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (raf || !visible || document.hidden) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    drawFrame(ctx, assets, heroFrame(0));
    target.dataset.ready = 'true';
    start();
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => {
          visible = entry.isIntersecting;
          if (visible) start();
          else stop();
        })
      : null;
    if (root.current) observer?.observe(root.current);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const phaseIndex = PHASE_ORDER.indexOf(phase);
  const status = HERO_PHASES.find((entry) => entry.id === phase)!;
  return (
    <div className="lp-demo" ref={root} data-phase={phase} data-animated={animated ? 'true' : 'false'} data-testid="landing-hero-demo">
      <div className="lp-demo-glow" aria-hidden="true" />
      <figure className="lp-window">
        <figcaption className="sr-only">Animated preview of the PixelForge editor: a brush stroke, a Curves adjustment, color looks and an editable type layer</figcaption>
        <div className="lp-window-bar" aria-hidden="true">
          <span className="lp-dots"><i /><i /><i /></span>
          <span className="lp-doc">golden-hour.pixelforge · 100%</span>
          <span className="lp-saved">Saved on this device</span>
        </div>
        <div className="lp-window-body" aria-hidden="true">
          <ul className="lp-rail">
            {RAIL.map(({ id, icon: Icon, phase: railPhase, label }) => (
              <li key={id} data-active={railPhase === phase ? 'true' : 'false'} title={label}><Icon size={15} strokeWidth={1.8} /></li>
            ))}
          </ul>
          <div className="lp-stage">
            <canvas ref={canvas} width={SCENE_W} height={SCENE_H} className="lp-canvas" data-testid="landing-hero-canvas" />
            <span className="lp-chip" key={phase + look}>
              <b>{status.tool}</b> {phase === 'filter' ? `${HERO_LOOKS[Math.min(look, HERO_LOOKS.length - 1)]} look` : status.label}
            </span>
          </div>
          <aside className="lp-panel">
            <div className="lp-panel-title"><Layers size={13} /> Layers</div>
            <ol>
              {LAYERS.map((layer) => {
                const shown = PHASE_ORDER.indexOf(layer.showFrom) <= phaseIndex;
                return (
                  <li key={layer.id} data-shown={shown ? 'true' : 'false'} data-active={ACTIVE_LAYER[phase] === layer.id ? 'true' : 'false'}>
                    <span className="lp-thumb">{layer.kind}</span>
                    <span>{layer.name}</span>
                  </li>
                );
              })}
            </ol>
            <div className="lp-panel-title lp-panel-gap"><SlidersHorizontal size={13} /> Curves</div>
            <svg className="lp-curve" viewBox="0 0 100 70" preserveAspectRatio="none">
              <path d="M0 70 L100 0" className="lp-curve-base" />
              <path d="M0 70 C 30 66, 55 18, 100 0" className="lp-curve-line" />
            </svg>
          </aside>
        </div>
      </figure>
    </div>
  );
}
