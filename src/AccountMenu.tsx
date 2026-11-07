import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronDown, LogIn, LogOut, UserRound, Cloud, ShieldCheck, CloudOff, RotateCw } from 'lucide-react';
import { SIGN_IN, type Member } from './cloud';

/** The Marketplace owns the shared session; Pixel only links to its canonical routes. */
export const SIGN_OUT = 'https://marketplace.cheaply.fr/marketplace/auth/logout';
const PROFILE = 'https://marketplace.cheaply.fr/marketplace/profile';

function hashSeed(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function next(seed: number, step: number) {
  return (seed + Math.imul(step + 1, 2654435761)) >>> 0;
}

function avatarSeed(member: Member | null) {
  if (member) return `${member.id}:${member.name}`;
  try {
    const key = 'pixelforge:guest-avatar';
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  } catch {
    return 'guest-avatar';
  }
}

/** A small deterministic artistic avatar: no photo is uploaded or requested. */
function ArtisticAvatar({ seed, label }: { seed: string; label: string }) {
  const value = hashSeed(seed);
  const hue = value % 360;
  const accent = (hue + 82) % 360;
  const cells = Array.from({ length: 9 }, (_, index) => {
    const bit = (next(value, index) >>> 28) & 1;
    return bit ? 1 : 0;
  });
  return (
    <span
      className="account-avatar"
      aria-hidden="true"
      style={{
        '--avatar-hue': `${hue}`,
        '--avatar-accent': `${accent}`,
      } as CSSProperties}
    >
      <svg viewBox="0 0 40 40" role="presentation">
        <defs>
          <linearGradient id={`avatar-${value}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={`hsl(${hue} 88% 67%)`} />
            <stop offset="1" stopColor={`hsl(${accent} 78% 42%)`} />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="14" fill={`url(#avatar-${value})`} />
        {cells.map((on, index) => on ? (
          <rect
            key={index}
            x={8 + (index % 3) * 8}
            y={8 + Math.floor(index / 3) * 8}
            width="6"
            height="6"
            rx="2"
            fill="rgba(255,255,255,.78)"
          />
        ) : null)}
        <circle cx="29" cy="29" r="5" fill={`hsl(${accent} 72% 28% / .72)`} />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

export default function AccountMenu({
  member,
  checking = false,
  unavailable = false,
  retry,
}: {
  member: Member | null;
  checking?: boolean;
  /** The Cheaply account service could not be reached. */
  unavailable?: boolean;
  retry?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const seed = useMemo(() => avatarSeed(member), [member]);
  const name = checking ? 'Checking account…' : member?.name || 'Guest editor';
  const detail = member ? 'Cheaply account' : unavailable ? 'Sign-in unavailable · local only' : 'Anonymous · local only';

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus();
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={root}>
      <button
        type="button"
        className="account-trigger"
        aria-label={member ? `Open account menu for ${member.name}` : 'Open guest profile menu'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ArtisticAvatar seed={seed} label={name} />
        <span className="account-trigger-copy">
          <strong>{name}</strong>
          <small>{detail}</small>
        </span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="account-popup" role="menu" aria-label="Account menu">
          <div className="account-popup-identity">
            <ArtisticAvatar seed={seed} label={name} />
            <span>
              <strong>{name}</strong>
              <small>{member ? 'Signed in with Cheaply' : 'Your edits stay on this device'}</small>
            </span>
          </div>
          {member ? (
            <>
              <a role="menuitem" href="/#projects-heading" onClick={() => setOpen(false)}>
                <Cloud aria-hidden="true" /> My projects
              </a>
              <a role="menuitem" href={PROFILE} onClick={() => setOpen(false)}>
                <UserRound aria-hidden="true" /> Cheaply profile
              </a>
              <a role="menuitem" className="account-danger" href={SIGN_OUT}>
                <LogOut aria-hidden="true" /> Sign out
              </a>
            </>
          ) : (
            <>
              {unavailable ? (
                <>
                  <output className="account-popup-note account-unavailable">
                    <CloudOff aria-hidden="true" /> Sign-in is unavailable right now because the Cheaply account service is not responding. Your work is still saved on this device; download a project file to keep a backup.
                  </output>
                  <button
                    type="button"
                    role="menuitem"
                    className="account-primary"
                    disabled={checking}
                    onClick={() => retry?.()}
                  >
                    <RotateCw aria-hidden="true" /> {checking ? 'Checking…' : 'Try again'}
                  </button>
                </>
              ) : (
                <>
                  <p className="account-popup-note"><ShieldCheck aria-hidden="true" /> Editing is free without an account. Sign in only when you want private projects across devices.</p>
                  <a role="menuitem" className="account-primary" href={SIGN_IN}>
                    <LogIn aria-hidden="true" /> Sign in with Cheaply
                  </a>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
