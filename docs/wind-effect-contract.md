# Wind effect contract

PixelForge exposes **Filter → Stylize → Wind…** as a local, nondestructive
directional effect. It stores `filterEffects: { type: "wind", amount, radius,
angle }` on the editable layer and blends each visible pixel toward deterministic
source samples along the selected direction.

The implementation preserves source assets, alpha and hidden RGB in transparent
pixels. Amount, radius and angle are bounded by the shared filter metadata;
amount zero is an identity. The effect remains editable through undo, local
drafts and project export. This is a predictable local streak approximation,
not Photoshop's exact wind modes, edge treatment or channel-specific rendering.

Pure coverage checks directional output, determinism, identity behavior, source
immutability and alpha preservation. Desktop/mobile browser coverage checks the
menu command, editable angle, source-asset retention and reload persistence.
