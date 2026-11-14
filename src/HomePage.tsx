import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Blend,
  Check,
  Brush,
  Cpu,
  Crop,
  Download,
  Grid3x3,
  HardDrive,
  Lasso,
  Layers,
  MousePointer2,
  PenTool,
  Pipette,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  SquareDashed,
  Stamp,
  Undo2,
  UserX,
  WandSparkles,
  WifiOff,
  Zap,
} from 'lucide-react';
import './home.css';
import './landing.css';
import { useMember } from './cloud';
import ProjectLibrary from './ProjectLibrary';
import { BrandLockup } from './Brand';
import AccountMenu from './AccountMenu';
import LandingHeroDemo, { prefersReducedMotion } from './LandingHeroDemo';
import { countUpValue, filterRibbon, landingStats, toolFamilyCards } from './landingContent';

const STATS = landingStats();
const FAMILIES = toolFamilyCards();
const RIBBON = filterRibbon();
const FREE_POINTS = [
  `All ${STATS.tools} tools and ${STATS.filters} filter effects, unlocked`,
  'No watermark, export at your full image size',
  'No sign-up, no card, no trial period',
  'Optional private cloud saves, also free',
];

const FAMILY_ICONS: Record<string, typeof Brush> = {
  navigation: MousePointer2,
  measure: Pipette,
  marquee: SquareDashed,
  lasso: Lasso,
  selection: WandSparkles,
  crop: Crop,
  retouch: Stamp,
  paint: Brush,
  mask: Layers,
  draw: PenTool,
};

/** Reveal sections as they scroll in. Content stays visible without JS or motion. */
function useReveal() {
  useEffect(() => {
    if (prefersReducedMotion() || typeof IntersectionObserver !== 'function') return;
    const page = document.querySelector('.lp');
    if (!page) return;
    page.setAttribute('data-reveal', 'on');
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute('data-in', 'true');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    page.querySelectorAll('.lp-reveal').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);
}

function Stat({ value, suffix = '', label }: { value: number; suffix?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion() || typeof IntersectionObserver !== 'function') return;
    setShown(0);
    let raf = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const progress = (now - start) / 1400;
        setShown(countUpValue(value, progress));
        if (progress < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);
  return (
    <div className="lp-stat" ref={ref}>
      <dt>{label}</dt>
      <dd>
        <span aria-hidden="true">{shown}{suffix}</span>
        <span className="sr-only">{value}{suffix}</span>
      </dd>
    </div>
  );
}

const SHOWCASE = [
  {
    icon: Layers,
    title: 'Layers, masks and groups',
    text: `Raster, type, shape, fill and adjustment layers with masks, clipping, groups and ${STATS.blendModes} blend modes. Everything stays editable after reload.`,
    art: 'layers',
  },
  {
    icon: SlidersHorizontal,
    title: 'Nondestructive adjustments',
    text: 'Levels, Curves, Hue/Saturation and Color Balance as adjustment layers you can tweak, mask or switch off at any time.',
    art: 'curves',
  },
  {
    icon: Sparkles,
    title: `${STATS.filters} filter effects`,
    text: 'Blur gallery, sharpen, distort, stylize, render and noise filters, with filter stacks and previews computed in background workers.',
    art: 'filters',
  },
  {
    icon: PenTool,
    title: 'Vector paths and real type',
    text: 'Pen and curvature pens, anchor editing, shapes and horizontal or vertical type with a built-in font library.',
    art: 'pen',
  },
  {
    icon: Stamp,
    title: 'Retouching',
    text: 'Clone, heal, patch and content-aware cleanup, plus dodge, burn, smudge and history brushes.',
    art: 'heal',
  },
  {
    icon: Download,
    title: 'Export your way',
    text: 'PNG, JPEG and WebP with size preview, flattened PSD and PDF composites, or a .pixelforge project with layers and history.',
    art: 'export',
  },
] as const;

function ShowcaseArt({ kind }: { kind: (typeof SHOWCASE)[number]['art'] }) {
  if (kind === 'layers') return <div className="lp-art lp-art-layers" aria-hidden="true"><i /><i /><i /></div>;
  if (kind === 'curves') {
    return (
      <svg className="lp-art lp-art-curves" viewBox="0 0 120 80" aria-hidden="true">
        <path d="M0 80 L120 0" className="base" />
        <path d="M0 80 C 40 78, 60 10, 120 0" className="curve" />
        <circle cx="47" cy="50" r="3.5" className="knot" />
      </svg>
    );
  }
  if (kind === 'filters') return <div className="lp-art lp-art-filters" aria-hidden="true"><i /><i /><i /><i /></div>;
  if (kind === 'pen') {
    return (
      <svg className="lp-art lp-art-pen" viewBox="0 0 120 80" aria-hidden="true">
        <path d="M10 64 C 30 6, 70 6, 70 40 S 100 76, 112 18" className="path" />
        <rect x="7" y="61" width="6" height="6" /><rect x="67" y="37" width="6" height="6" /><rect x="109" y="15" width="6" height="6" />
      </svg>
    );
  }
  if (kind === 'heal') return <div className="lp-art lp-art-heal" aria-hidden="true"><i /><b /></div>;
  return (
    <div className="lp-art lp-art-export" aria-hidden="true">
      {['PNG', 'JPEG', 'WebP', 'PSD', 'PDF', '.pixelforge'].map((format) => <span key={format}>{format}</span>)}
    </div>
  );
}

export default function HomePage() {
  const { member, checking, unavailable: signInUnavailable, retry: retrySignIn } = useMember();
  const [draft] = useState(() => {
    try {
      const id = localStorage.getItem('pixelforge:last-draft');
      return id && /^[a-f0-9-]{36}$/.test(id) ? id : null;
    } catch {
      return null;
    }
  });
  useReveal();
  return (
    <main className="home-page lp">
      <div className="lp-backdrop" aria-hidden="true"><i /><i /><i /></div>
      <header className="home-header lp-header">
        <BrandLockup home />
        <div className="home-account">
          <AccountMenu member={member} checking={checking} unavailable={signInUnavailable} retry={retrySignIn} />
          <a className="home-small-link" href="/help">Help Center</a>
          <a className="home-small-link" href="/editor?new=1">Open editor <ArrowRight size={16} /></a>
        </div>
      </header>

      <section className="lp-hero" aria-labelledby="lp-title">
        <div className="lp-hero-copy">
          <span className="lp-badge"><span className="lp-pulse" aria-hidden="true" /> 100% free · Local-first · No sign-up</span>
          <h1 id="lp-title">
            Pro-grade photo editing.
            <span className="lp-gradient-text"> Free, right in your browser.</span>
          </h1>
          <p className="lp-lead">
            {STATS.tools} tools, layers with masks, nondestructive adjustments and {STATS.filters} filter effects.
            Your images are edited on your device and never leave it unless you choose to save to the cloud.
          </p>
          <div className="home-actions lp-actions">
            <a className="home-primary lp-primary" href="/editor?new=1">Start editing <ArrowRight size={18} /></a>
            {draft && <a className="home-secondary" href={'/editor#draft=' + draft}>Continue saved draft</a>}
            <a className="lp-ghost" href="#lp-tools">Explore the toolset</a>
          </div>
          <ul className="lp-trust">
            <li><BadgeCheck size={15} /> Free forever, every tool</li>
            <li><UserX size={15} /> No account needed</li>
            <li><HardDrive size={15} /> Autosaves on this device</li>
            <li><WifiOff size={15} /> Works offline after a visit</li>
          </ul>
        </div>
        <LandingHeroDemo />
      </section>

      <section className="lp-stats lp-reveal" aria-label="PixelForge in numbers">
        <dl>
          <Stat value={STATS.tools} label="Editing tools" />
          <Stat value={STATS.railSlots} label="Toolbar families" />
          <Stat value={STATS.filters} label="Filter effects" />
          <Stat value={STATS.blendModes} label="Blend modes" />
          <Stat value={STATS.undoStates} label="Undo steps" />
          <Stat value={0} suffix=" €" label="Price, forever" />
        </dl>
      </section>

      <div className="lp-ribbon" aria-hidden="true">
        <div className="lp-ribbon-track">
          {[0, 1].map((copy) => (
            <span key={copy}>{RIBBON.map((name) => <b key={name}>{name}</b>)}</span>
          ))}
        </div>
      </div>

      <section className="lp-section lp-free" aria-labelledby="lp-free-title">
        <div className="lp-free-copy lp-reveal">
          <span className="home-eyebrow">FREE MEANS FREE</span>
          <h2 id="lp-free-title">Every tool. Every export. <span className="lp-gradient-text">Zero cost.</span></h2>
          <p>No trial that runs out, no locked “pro” tier, no watermark on your images. The whole editor is free for everyone, with or without an account.</p>
          <ul className="lp-free-list">
            {FREE_POINTS.map((point) => <li key={point}><Check size={16} /> {point}</li>)}
          </ul>
        </div>
        <div className="lp-price lp-reveal" aria-hidden="true">
          <span className="lp-price-label">PixelForge</span>
          <span className="lp-price-amount">0 €<small>/ forever</small></span>
          <span className="lp-price-row"><b>{STATS.tools}</b> tools unlocked</span>
          <span className="lp-price-row"><b>{STATS.filters}</b> filter effects</span>
          <span className="lp-price-row"><b>0</b> watermarks</span>
          <span className="lp-price-shine" />
        </div>
      </section>

      {member && <ProjectLibrary key={member.id} member={member} />}

      <section className="lp-section" id="lp-tools" aria-labelledby="lp-tools-title">
        <div className="lp-heading lp-reveal">
          <span className="home-eyebrow">THE FULL TOOLBOX</span>
          <h2 id="lp-tools-title">{STATS.tools} tools in {STATS.railSlots} compact toolbar slots.</h2>
          <p>Every family opens from one rail with keyboard shortcuts and press-and-hold flyouts, on desktop and touch.</p>
        </div>
        <div className="lp-families">
          {FAMILIES.map(({ id, label, count, blurb }, index) => {
            const Icon = FAMILY_ICONS[id] ?? Brush;
            return (
              <article key={id} className="lp-family lp-reveal" style={{ '--i': index } as CSSProperties}>
                <span className="lp-family-icon"><Icon size={20} /></span>
                <h3>{label}<small>{count} tools</small></h3>
                <p>{blurb}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="lp-section" aria-labelledby="lp-showcase-title">
        <div className="lp-heading lp-reveal">
          <span className="home-eyebrow">BUILT FOR REAL WORK</span>
          <h2 id="lp-showcase-title">From quick fixes to layered compositions.</h2>
        </div>
        <div className="lp-bento">
          {SHOWCASE.map(({ icon: Icon, title, text, art }, index) => (
            <article key={title} className="lp-card lp-reveal" style={{ '--i': index } as CSSProperties}>
              <ShowcaseArt kind={art} />
              <h3><Icon size={18} /> {title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-engine" aria-labelledby="lp-engine-title">
        <div className="lp-engine-copy lp-reveal">
          <span className="home-eyebrow">ENGINEERED FOR BIG DOCUMENTS</span>
          <h2 id="lp-engine-title">A rendering engine, not a filter app.</h2>
          <ul>
            <li><Grid3x3 size={18} /><span><b>Tiled layers.</b> Layer pixels are stored as {STATS.tileSize}×{STATS.tileSize} tiles, so large documents save and reopen incrementally.</span></li>
            <li><Cpu size={18} /><span><b>Worker filters.</b> Filters run in parallel background workers, keeping the canvas responsive.</span></li>
            <li><Zap size={18} /><span><b>Off-thread rendering and encoding.</b> Document renders and exports use workers and OffscreenCanvas where the browser supports them.</span></li>
            <li><Undo2 size={18} /><span><b>Deep history.</b> Up to {STATS.undoStates} undo steps in memory, with recent history saved with your draft.</span></li>
          </ul>
        </div>
        <div className="lp-tiles lp-reveal" aria-hidden="true">
          {Array.from({ length: 48 }, (_, index) => <i key={index} style={{ '--d': (index % 8) + Math.floor(index / 8) } as CSSProperties} />)}
          <span className="lp-tiles-label">256² tiles · worker pool</span>
        </div>
      </section>

      <section className="lp-section lp-privacy" aria-labelledby="lp-privacy-title">
        <div className="lp-heading lp-reveal">
          <span className="home-eyebrow">PRIVATE BY DESIGN</span>
          <h2 id="lp-privacy-title">Your photos stay on your device.</h2>
        </div>
        <div className="lp-privacy-grid">
          <article className="lp-reveal"><ShieldCheck size={22} /><h3>Local-first editing</h3><p>Images are decoded, edited and exported in your browser. Exports contain rendered pixels only, without the source location metadata.</p></article>
          <article className="lp-reveal"><UserX size={22} /><h3>No account required</h3><p>Open the editor and start. Drafts and undo history autosave in this browser, and a bookmark brings you back.</p></article>
          <article className="lp-reveal"><Blend size={22} /><h3>Cloud only when you ask</h3><p>Sign in with an existing Cheaply account and choose Save to my projects for a private cloud copy. Nothing uploads on its own.</p></article>
        </div>
      </section>

      <section className="lp-final lp-reveal" aria-labelledby="lp-final-title">
        <h2 id="lp-final-title">Free. Pro-grade. Ready now.</h2>
        <p>No download, no sign-up, no watermark, no price tag. Just your image and a full set of tools.</p>
        <a className="home-primary lp-primary" href="/editor?new=1">Open editor <ArrowRight size={18} /></a>
      </section>

      <footer className="home-footer lp-footer">
        <span>PixelForge by Cheaply</span>
        <p>Drafts autosave in this browser. Sign in and choose Save to my projects for a private cloud copy. Clearing browser data or using private browsing can remove drafts. Export a copy to keep your work.</p>
        <a href="/help">Help Center</a>
        <a href="https://www.cheaply.fr/pages/apps">More free Cheaply tools ↗</a>
      </footer>
    </main>
  );
}
