# Changelog

PixelForge deploys continuously from `main`: the latest `main` commit that passes
CI is deployed to <https://photoeditor.cheaply.fr> (a newer push cancels an
in-flight run, so not every merge gets its own deploy). There are no tagged
releases, so entries below are grouped by merge date (UTC), newest first, and
link the merged pull requests. The deployed revision (version, commit and build
time) is visible at [`/release.json`](https://photoeditor.cheaply.fr/release.json).

Versions come from `scripts/release-version.mjs`: a production deploy from
`main` is versioned `<major>.<minor>.<CI run number>` (major and minor from
`package.json`, so numbers increase but have gaps), while pull request, other
CI and local builds get `-pr.<n>`, `-ci.<run>` or `-dev` pre-release suffixes
plus the short commit SHA.

## 2026-11-13

### Added
- Edit > Stroke Selection… dialog with width, colour, location, opacity and blend mode (#266)
- Edit > Fill can use Pattern contents, including a new Mesh pattern (#264)
- Light Rays shows an on-canvas guide for the extent of the rays (#261)
- Document bar gains a Save draft button; "Save local copy" is renamed Duplicate draft (#262)

### Fixed
- Painting ends strokes whose pointer release was lost, keeps previewing while the pane is hidden, and never fits zoom to an empty 0×0 stage (#263)
- Empty selections no longer fill the whole layer; quick fills; Gaussian Blur and feather now go up to 1000 px (#260)
- Light Rays renders on transparency by default, so rays show on empty layers (#259)

### Performance
- Large drafts reopen from their saved preview, and per-layer frame-space work is cached (#267)
- Faster feathered selections on large documents (#265)

### Developer
- CI runs the browser test suite in six shards (#268)

## 2026-11-12

### Added
- Full SVG support: layered SVG export and editable SVG import (#257)

### Fixed
- Painting-session fixes: filters limited to the selection, Lens Flare fill, instant empty-layer insert, Move to Position, and sub-tool marks (#256)

### Performance
- Large drafts: filtered layers processed on-device, a reopen preview and faster Lens Flare; also fixes the Star field trail (#258)

## 2026-11-10

### Added
- Layer thumbnails, picking a layer from the canvas, layer opacity kept in sync, and faster painting on documents with few layers (#255)

### Fixed
- Removed a duplicate Image > Resize menu entry (#153)

## 2026-11-09

### Added
- Type tool overhaul: rich-text engine with versioned runs, paragraph layout and caret model; on-canvas editing, a Type tool family, and Character/Paragraph panels (#243, #244)
- Contextual properties sidebar that shows only the active tool's options, a "More panels" strip, a phone sheet, and Layers footer actions (#245)
- Self-hosted font library (146 families plus icon and symbol fonts), a font picker and a Glyphs panel (#238)
- Tool presets: per-tool option snapshots with Reset Tool / Reset All Tools (#233)
- Rounded Rectangle and Custom Shape tools in the shape (U) family (#231)
- Path Selection, Add/Delete Anchor Point and Convert Point tools (#232)
- Layers panel drag-and-drop reorder, row delete, row menu and file drops (#237)
- Silk strands brush mode: twisting ribbons of fine strands from a single drag (#240)
- Smudge tool options: carried paint, Strength, modes, sampling and tip options (#239)
- Audio Annotation tool for short local audio notes (#241)
- Multi-point Curves are fully editable, and selection feather accepts decimals (#235)

### Changed
- Redesigned landing page with a live editor demo and free-first messaging (#253)
- Thin, auto-hiding scrollbars; tool labels are no longer text-selectable (#246)
- The app version now increments on every deploy from `main` (#229)

### Fixed
- Fixes from the production toolbar audit (bugs B-01–B-12, improvements I-01–I-27) (#254)
- The Text section's Font and Size controls now change the selected, existing text layer (#249, #251)
- Bare tool-option dropdowns and buttons are styled consistently; the Text reveal is guarded (#250)
- Hidden panel text no longer stretches or shifts the editor page (#247)
- Every coalesced pointer sample is applied for all stroke tools, so strokes drawn in a hidden pane are complete (#230)
- The editor no longer flashes on each canvas click and stroke (#228)

### Performance
- Incremental renders for layer delete, reorder and visibility changes using multiple prefix snapshots (#236)

### Developer
- Docs: production toolbar audit, Photoshop 7 toolbox chart audit, and fix wave 5 record (#242, #248, #252)

## 2026-11-08

### Added
- Paint Symmetry now works for Stroke Path, Mixer and History brushes, Clone and Healing (#220)
- Brush and Pencil blend mode, stored in brush presets (#218)
- The properties sidebar auto-scrolls to the section of the activated tool (#224)

### Changed
- Difference Clouds is smooth over transparency, and Levels allows reversed output (#227)
- New layers and duplicates are inserted above the selection; composites are reused for empty-layer add/delete and clipped-layer reorder (#222)

### Fixed
- Gaussian, Box, Motion and Lens Blur now affect brush-stroke layers (#226)
- Clipping masks survive Rasterize, merge and arrange, and clipped rows are shown in the Layers panel (#223)
- Filter stacking, mask-aware layer styles, directional Inner Shadow, rasterizing styles, live-filter speed and Light Rays units (#215)
- Lost gradient/brush strokes, clipping groups, Save Selection, the Fill dialog and the update notice (#216)

### Performance
- Dirty-rectangle tiled commits and a decoded-tile cache (#221)
- Retouch tools (Dodge, Burn, Sponge, Smudge, Blur, Sharpen, Mixer, History) process only the brush window on each pointer move (#225)
- Many-layer paintings stay interactive: worker stroke previews, cached tiled/styled layers, and pass-aware cache eviction (#217)

### Developer
- Local Playwright runs are isolated per port and output directory (#219)

## 2026-11-07

### Added
- Huge layered projects: up to 512 layers, device-aware 1-gigapixel / 1 GiB budgets, and content-bounded paint layers (#193)
- Painting Size from 1 to 5000 px with perceptual control and fast large dabs (#187)
- Undo/redo history ten times larger, sized to the device (#189)
- Paint Symmetry for Brush, Pencil and Eraser (#210)
- Stroke Path with Brush, with simulated pressure tapers (#212)
- Filter > Render > Light Rays (a bounded local approximation) (#211)
- Brush colour dynamics and a brush preset library (#209)
- Sparse brush stamping, count/jitter, pen lift and gradient modes (#194)
- Selection-confined Spot Healing and Patch, live gradient preview, and symmetric count jitter (#201)
- Backdrop-blended outer effects, Gaussian shadow falloff, and in-place editing of stacked filters (#204)
- 26 layer blend modes, Outer/Inner Glow, and style bounds for large documents (#197)
- Filter stacks on raster layers and precise on-canvas filter centres (#199)
- Reference / guide image overlay that is never exported (#200)
- An explanation of the layer pixel budget, plus Trim Layer to Content (#183)

### Fixed
- An unavailable sign-in service is explained instead of linked to (#180)
- Perspective and Puppet Warp work in canvas space on layers with stored bounds; stroke commit baseline fixed (#207)
- Pasting images from the OS clipboard, and hardened export downloads (#198)
- Retouch tools are confined to the selection, Alt-click clone sources are kept, and Mask from Selection consumes the selection (#196)
- Brush, Pencil, Eraser and mask painting are confined to the active selection (#184)
- Lasso selections that go off-canvas are clipped instead of rejected (#182)
- Gradient's transparent end fades from the adjacent colour (#181)

### Performance
- Tiled, Blob-backed layer assets, so large-layer commits encode only touched tiles (#213)
- Parallel filter worker pool for heavy neighbourhood filters, with tile cancellation, halo-free bands and pre-warming (#205, #206)
- Faster opening, reloading and re-rendering of large projects; Apply Image grows stored-bounds layers (#203)
- Faster Smart, Surface, Shape, Lens, Radial, Spin and Path Blur, and Reduce Noise (#202)
- Committed stroke pixels stay warm for the next stroke and the render worker (#195)
- Radius-independent Gaussian blur, faster median filters, and a render watchdog scaled to the work (#191)
- Live stroke previews are coalesced and identity canvas filters skipped (#190)
- Incremental local draft saves with content-addressed assets (#186)
- Layer-local filter output and decoded sources are cached across renders (#185)

### Developer
- Roadmap docs: large-document painting findings and fix waves 2–4 (#188, #192, #208, #214)

## 2026-11-04

### Added
- File > New… dialog with size presets and background choice (#177)
- Photoshop-style colour Render Clouds (#176)
- True pixel zoom for the editor view (#174)

### Fixed
- Gradient and Paint Bucket are confined to the active selection (#179)
- Add Noise samples are unsigned and zero-mean (#178)

### Developer
- Layer-styles browser test fingerprints canvas pixels (#175)

## 2026-11-03

### Fixed
- The editor stays inside windows 681–1240 px wide (#173)
- Rasterizing a layer bakes in its live filter effects (#172)
- Every toolbar tool has a distinct icon (#171)

### Developer
- Project handoff documentation for Claude Code (#170)

## 2026-10-27

### Developer
- Validation of batch manifest metadata (#169)

## 2026-10-26

### Added
- Explicit colour profile conversion on export (#161), also applied to batch exports (#166)
- Batch manifests preserve document metadata (#168)
- Bounded Liquify modes (#163)

### Changed
- Wet brush strokes are interpolated between segments (#162)

### Developer
- Test and browser-shard execution is time-bounded in CI (#164)
- Docs: reconciled deployment evidence and marked the profile export milestone shipped (#165, #167)

## 2026-10-25

### Developer
- Docs: aligned the roadmap with the deployed release (#159, #160)

## 2026-10-24

### Fixed
- Toolbar icon alignment and empty grid gaps (#154)

### Developer
- Docs: reconciled roadmap release evidence and removed a stale release-gate statement (#155, #156, #157, #158)

## 2026-10-20

### Developer
- CI cancels superseded workflow runs (#152)

## 2026-10-19

### Developer
- CI uses a stable browser worker budget; latest protected release evidence recorded (#150, #151)

## 2026-10-17

### Fixed
- Restored complete, categorized keyboard rebinding for toolbar and menu commands (#149)

## 2026-10-15

### Added
- Bounded OpenType text controls (#138)
- Bounded Puppet Warp workflow (#137)

### Developer
- Weighted roadmap progress rubric (#136)

## 2026-10-13

### Added
- Sharpen filters: non-destructive Unsharp Mask, Sharpen More, Sharpen Edges and Smart Sharpen (#130, #131, #132, #133)
- Stylize filters: Emboss and non-destructive Find Edges (#126, #129)
- Seeded Render Tree filter (#128)
- Offline Subject and Sky selections (#127)
- Select > Modify > Feather workflow (#134)

### Fixed
- Compact categorized toolbar layout (#135)

## 2026-10-12

### Added
- Copy Merged (#125), Stroke selection (#124), Image > Duplicate (#123), Type layer rasterization (#122) and 180° image rotation (#121) are now available
- Browser clipboard images paste as editable layers (#119)
- NTSC Colors filter (#117)

### Changed
- SVG and PDF import limits are disclosed (#118)

### Fixed
- Native clipboard paste events are preserved (#120)

## 2026-10-11

### Added
- Render filters: Fibers (#105), seeded Clouds (#109), Picture Frame (#107), Flame (#108) and Lens Flare (#106)
- Non-destructive De-Interlace filter (#116)
- Photoshop-style Lock Layers command (#115)
- Portable project bundle format v3 (#114)
- Editable vector masks (#113)
- Bounded Art History Brush (#112)
- Editable file metadata with a privacy contract (#110)
- Photoshop-style screen modes (#111)

### Changed
- Conditional TIFF import support is disclosed (#102)

## 2026-10-10

### Added
- Pixelate filters: editable Mezzotint (#99) and Color Halftone (#98), non-destructive Facet (#97) and Fragment (#96)
- Blur Gallery: editable Tilt-Shift (#95), pin-based Field Blur (#94), and editable Path Blur and Spin Blur (#90)
- Difference Clouds render filter (#104)
- Merge Visible (#93) and merging contiguous selected layers (#89)
- Non-destructive Type Mask selections (#92)
- Photoshop-style layer Arrange commands (#91)
- Persistent Rotate View tool (#86)
- Progress reporting for tiled renders (#88)

### Changed
- Pointillize actions are replayable (#100)
- More local effects can use bounded tiled rendering (#101)

### Fixed
- Analytics keeps the canonical gtag queue arguments (#87)

## 2026-10-09

### Added
- Distort filters: Shear (#66), Polar Coordinates (#67), ZigZag (#68) and Displace (#69)
- Pixelate filters: Pointillize (#70) and non-destructive Crystallize (#73)
- Lens Correction filter (#71) with direction controls (#72)
- Blur filters: tonal Surface Blur (#64) and diamond Shape Blur (#65)
- Deterministic Quick Selection tool (#85)
- Non-destructive Adjustment Brush (#84)
- Mixer Brush and History Brush workflows (#82)
- Embedded Smart Object layers (#80)
- Non-destructive adjustment layers (#79)
- Slice Select tool and isolated Frame artboards (#76)

### Changed
- Hardened tiled-rendering telemetry and worker lifecycle (#83)

### Fixed
- Content Security Policy allows PixelForge analytics collection (#75)

### Performance
- Overlap-aware tiled pixel compositor (#74) and bounded tiled blur rendering (#77)

### Developer
- Docs: refreshed layer-format claims and aligned worker/tiled rendering contracts (#78, #81)

## 2026-10-08

### Added
- Blur filters: edge-preserving Smart Blur (#63), Iris Blur (#62) and Lens Blur (#61)
- Smooth selection refinement (#60)
- Freeform Pen paths (#59)
- Bézier handle editing with Direct Selection (#58)

## 2026-10-07

### Added
- Blur More filter preset (#55)

### Changed
- Hardened the Ripple distortion effect (#56)

### Fixed
- Render cancellation, bitmap ownership and import safety (#57)

## 2026-10-06

### Added
- Average Blur filter (#54)
- Editable solid fill layers (#53)
- Local Focus Area selection (#52)
- Select > Similar (#50)

## 2026-10-05

### Added
- Consent-gated analytics (#51)
- Spherize filter, with hardened folder (group) invariants (#49)
- Layer grouping and composed selections hardened (#48); isolated group blend compositing (#45)
- Cubic path editing and bounded tile-cache reuse (#47)
- Multi-layer selection (#46) and Merge Layers (#44)
- Non-destructive mask refinement tools (#43)
- Non-destructive Levels output range (#42)
- Wave filter, Border selection and Layer Styles (#41)

## 2026-10-04

### Added
- Constrained content-aware cleanup and parameterized batch Actions (#40)
- Durable drafts, Pinch filter and Magnetic Lasso (#39)
- Patch tool and tiled render planning (#38)
- Non-destructive Spot Healing and local Actions (#37)
- Ten high-use Photoshop workflows (#36)
- Motion Blur and export of the active artboard (#35)
- Selection brush, artboards and bounded tile scheduling (#34)
- Pattern Stamp, Red Eye and render progress (#33)
- Cancellable worker document rendering and draft recovery (#32)
- Perspective Crop, slices and non-destructive blur effects (#31)
- Crop confirmation, non-destructive filter effects, layer alignment and release status (#30)
- More selection, measurement, crop and shape tools (#29)
- Free Transform, format disclosures and operation diagnostics (#28)

## 2026-10-03

### Added
- Release status and worker-based export (#27)
- Account profile and local batch export (#26)
- Offline recovery and local background removal (#25)
- Responsive toolbar, layer masks and persistence validation (#24)
- Auto Tone, Auto Contrast and Auto Color (#23)
- Smudge and Pen/Path tools (#22)
- Dodge, Burn and Sponge tools (#21)
- Background Eraser and Magic Eraser (#20)
- Pressure-aware radial brush and retouching tools (#18)
- Canvas Size, Trim and Reveal All (#17)
- Image Size workflow (#16)
- Curves, Quick Mask and saved selections (#15)
- Color Balance and Sharpen/Noise adjustments (#14)
- Hue/Saturation, batch history export and selection transforms (#13)
- Editable typography and keyboard-accessible menus (#12)
- Editable vector shapes, Levels and target-size exports (#11)

### Changed
- Hardened brush edge and pressure handling (#19)

## 2026-10-02

### Added
- Polygonal selection and Photoshop-style workflow menus (#10)
- Offline install shell and persisted layer groups (#9)
- Editable ellipses and PixelForge branding (#7), using the official Cheaply logo beside the Pixel companion mark (#8)
- Editable layers and versioned document recovery (#6)
- Cloud-save conflicts are recovered without overwriting either version (#5)
- Precise resizing and portable project backups (#4)
- Launch on Google Cloud with draft recovery and private projects (#3)

## 2026-09-08

### Developer
- Documented the optional Cheaply Auth rollout (#1)
