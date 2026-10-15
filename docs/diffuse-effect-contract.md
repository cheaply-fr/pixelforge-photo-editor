# Diffuse effect contract

PixelForge exposes **Filter → Stylize → Diffuse…** as a local,
nondestructive effect. It stores `filterEffects: { type: "diffuse", amount,
radius }` on the editable layer and blends each visible pixel toward a
deterministic four-neighbour average at the configured bounded radius.

The renderer never mutates the source asset. It preserves alpha and hidden RGB
in transparent pixels, clamps radius to the shared filter bounds, treats amount
zero as an identity, and remains editable through undo, local drafts and project
export. This is a predictable local diffusion approximation, not Photoshop's
exact stochastic filter or color-management implementation.

Pure tests cover deterministic output, identity behavior, source immutability
and alpha preservation. Desktop/mobile browser tests cover menu availability,
pixel change, source-asset retention and reload persistence.
