import { useState } from 'react';
import { ArrowRight, Crop, Download, Palette, RotateCw, ShieldCheck, Type } from 'lucide-react';
import './home.css';
import { useMember } from './cloud';
import ProjectLibrary from './ProjectLibrary';
import { BrandLockup } from './Brand';
import AccountMenu from './AccountMenu';

const features = [
  { icon: Crop, title: 'Make the cut', text: 'Crop, rotate and flip your images to get the composition right.' },
  { icon: Palette, title: 'Find your look', text: 'Adjust brightness, contrast, saturation and filters on individual layers without changing the source image.' },
  { icon: Type, title: 'Add your touch', text: 'Keep text and shapes editable. Paint on separate layers, reorder, blend and adjust each one.' },
  { icon: RotateCw, title: 'Pick up where you left off', text: 'Your draft and undo history save in this browser. Bookmark a document to return to it.' },
  { icon: Download, title: 'Ready to share', text: 'Export PNG, JPEG, WebP or a flattened PSD composite with a preview and file size, or download an editable PixelForge project with its layers and undo history.' },
  { icon: ShieldCheck, title: 'Your photos stay with you', text: 'Edit locally without an account. Optional private cloud projects use your existing Cheaply sign-in.' },
];

export default function HomePage() {
  const { member, checking } = useMember();
  const [draft] = useState(() => { try { const id = localStorage.getItem('pixelforge:last-draft'); return id && /^[a-f0-9-]{36}$/.test(id) ? id : null; } catch { return null; } });
  return <main className="home-page">
    <header className="home-header"><BrandLockup home /><div className="home-account"><AccountMenu member={member} checking={checking} /><a className="home-small-link" href="/editor?new=1">Open editor <ArrowRight size={16} /></a></div></header>
    <section className="home-hero">
      <div className="hero-copy"><span className="home-eyebrow">FREE TO CREATE. YOURS TO KEEP.</span><h1>A little edit.<br /><em>A big difference.</em></h1><p>Create with editable layers, text and shapes. Refine your photos, keep every element adjustable, and return to your work whenever you like.</p><div className="home-actions"><a className="home-primary" href="/editor?new=1">Start editing <ArrowRight size={18} /></a>{draft && <a className="home-secondary" href={'/editor#draft=' + draft}>Continue saved draft</a>}</div><span className="home-promise">100% free · No account needed · Cloud saving is optional</span></div>
      <div className="hero-art" aria-hidden="true"><div className="art-bar"><i /><i /><i /><span>Make it your own</span></div><div className="art-landscape"><div className="art-sun" /><div className="art-mountain" /><div className="art-water" /><span className="art-label">a fresh perspective</span></div><div className="art-tools"><span>Crop</span><span>Adjust</span><span>Text</span><span>Export ↗</span></div></div>
    </section>
    {member && <ProjectLibrary key={member.id} member={member} />}
    <section className="home-features" aria-labelledby="features-heading"><div className="home-section-heading"><span className="home-eyebrow">LESS FRICTION. MORE CREATING.</span><h2 id="features-heading">The tools you need,<br />right in your browser.</h2></div><div className="feature-grid">{features.map(({ icon: Icon, title, text }) => <article key={title}><span className="feature-icon"><Icon size={23} /></span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="home-bottom"><h2>One image. Endless possibilities.</h2><p>Start for free. Save a draft. Come back when inspiration strikes.</p><a className="home-primary" href="/editor?new=1">Create something <ArrowRight size={18} /></a></section>
    <footer className="home-footer"><span>PixelForge by Cheaply</span><p>Drafts autosave in this browser. Sign in and choose Save to my projects for a private cloud copy. Clearing browser data or using private browsing can remove drafts. Export a copy to keep your work.</p><a href="https://www.cheaply.fr/pages/apps">More free Cheaply tools ↗</a></footer>
  </main>;
}
