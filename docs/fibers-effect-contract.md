# Fibers filter contract

PixelForge's **Filter → Render → Fibers…** command is a bounded, deterministic
local approximation of Photoshop Fibers. It builds a seeded anisotropic,
multi-octave field whose narrow vertical bands are bent by an editable
variance control, then blends a neutral generated tone into visible source
pixels.

The effect stores `filterEffects.type = fibers` with bounded amount (0–100),
fiber scale/radius (0–64), variance (1–64), centre metadata and a uint32
random seed. Rendering always starts from the immutable layer asset. Alpha is
copied byte-for-byte and transparent pixels keep their hidden RGB bytes. A
zero amount or radius is an identity that still returns a detached buffer;
the canvas dimensions never expand.

The local command is undoable, survives local draft reload and project
import/export, and is allow-listed for deterministic local Action recording
and replay. Pure tests cover reproducibility, parameter bounds, source and
transparent-RGB safety, metadata round trips and Action serialization.
Desktop and mobile browser acceptance covers menu activation, inspector
editing, representative output changes, undo, reload, project round trips and
Action replay.

This slice does not claim Photoshop parity. Foreground/background colour
controls, exact stochastic distribution, selection/channel options and
wrap-around remain staged.
