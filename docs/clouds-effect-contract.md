# Render Clouds contract

PixelForge exposes `Filter → Render → Clouds` as a bounded, nondestructive
local approximation of Photoshop Clouds. The command generates a deterministic
four-octave value-noise field from the persisted `seed` and blends a grayscale
texture into the visible pixels of the active layer.

`radius` is the largest noise scale (1–64 px), `amount` is the blend strength
(0–100), and `seed` is an unsigned 32-bit value. The source asset is never
replaced. Alpha bytes and RGB padding belonging to fully transparent pixels
remain unchanged, and the canvas dimensions never change. The same metadata
replays the same pixels after undo, local reload, project import, and worker
rendering.

This is intentionally not a claim of Photoshop's foreground/background color
mixing, turbulence controls, or exact procedural parity. The effect is local,
offline, deterministic, and safe to disclose as an approximation. A zero
amount or radius is an identity/no-op and does not create a history entry.

Required evidence:

- Pure tests cover determinism, seed/scale changes, identity controls, source
  immutability, alpha preservation, hidden RGB, tiny dimensions, and metadata
  validation.
- Desktop and mobile browser tests cover menu activation, editable scale and
  seed controls, representative pixel change, source-asset retention, local
  reload, project round trip, undo, and Action allow-list replay.
