# Smart Sharpen effect contract

`Filter → Sharpen → Smart Sharpen…` stores an editable `filterEffects` record
with `type: "smart-sharpen"`, bounded `amount` and bounded radius. Rendering
uses the existing alpha-weighted bilateral reference and adds local
high-frequency contrast only where the source differs materially from that
reference. This limits gain on broad tonal surfaces while retaining detail at
strong boundaries. Source assets, alpha and transparent RGB padding remain
unchanged and the metadata round-trips through the project model.

This is a deterministic local approximation, not Photoshop algorithm parity:
threshold, halo suppression, channel-specific controls and camera-aware
sharpening remain future work. Unit and desktop/mobile tests cover deterministic
pixels, flat-region behavior, source safety, alpha bounds, menu enablement and
reload persistence.
