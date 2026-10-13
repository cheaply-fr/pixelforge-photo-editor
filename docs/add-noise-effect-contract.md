# Add Noise effect contract

`Filter → Noise → Add Noise…` is an enabled nondestructive filter effect. It
stores a bounded amount, stable seed and optional monochromatic mode in the
active layer's `filterEffects` metadata. Rendering uses a deterministic seeded
uniform perturbation for each visible pixel; alpha and fully transparent RGB
padding remain byte-for-byte unchanged and the source asset is never mutated.

The effect is deliberately a local approximation. It does not claim
Photoshop's Gaussian/uniform distribution switch, film-grain model, clipping
controls, high-bit-depth processing or camera-noise simulation. Those remain
separate roadmap work. The UI and persistence contract is covered by pure
pixel/validation tests and desktop/mobile browser acceptance, including
reload, source retention and monochromatic control state.
