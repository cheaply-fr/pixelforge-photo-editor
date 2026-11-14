# PixelForge documentation

This folder holds the technical documentation for PixelForge, the free, local-first browser photo editor at <https://photoeditor.cheaply.fr>. End-user help lives in the Help Center (`/help`, sources in [`../help/`](../help/), authoring rules in [`knowledge-base.md`](knowledge-base.md)).

## How the docs are organised

| Kind | Where | Purpose |
| --- | --- | --- |
| Technical guides | `docs/<topic>.md` (below) | How the system is built, tested, released and secured. Kept current with the code. |
| Feature contracts | `docs/<feature>-contract.md` | One per feature: behaviour, limits, persistence and the tests that enforce it. See [the contract convention](developer-guide.md#6-contract-docs). |
| Product and roadmap | `product-scope.md`, `*-roadmap.md`, audits, handoff | Direction and history. Dated status can be stale. |
| Repository root | [`../README.md`](../README.md), [`../CONTRIBUTING.md`](../CONTRIBUTING.md), [`../CHANGELOG.md`](../CHANGELOG.md), [`../CLAUDE.md`](../CLAUDE.md) | Landing page, contribution rules, release history, agent guide. |

**Source of truth.** When a document disagrees with source, tests, CI or the live `/release.json`, the code and evidence win. Fix the document in the same pull request.

## Start here

| If you want to… | Read |
| --- | --- |
| Understand the system | [Architecture](architecture.md) |
| Set up, code and add features | [Developer guide](developer-guide.md#6-contract-docs) |
| Run or write tests | [Testing](testing.md) |
| Ship, verify or roll back a release | [Operations runbook](operations.md), then [deployment infrastructure](deployment.md) |
| Review threats, privacy and limits | [Security and privacy](security-and-privacy.md) |
| Read or write persisted files | [Data formats](data-formats.md), [layer document format](layer-document-format.md) |
| Contribute a change | [`../CONTRIBUTING.md`](../CONTRIBUTING.md) |
| See what changed | [`../CHANGELOG.md`](../CHANGELOG.md) |

## Complete index

Every Markdown file in `docs/` appears exactly once below, grouped by area. `product-research.txt` holds raw product research notes and is not indexed as a guide.

### Technical guides

Start here for how the system is built, tested, shipped and secured.

| Document | Title |
| --- | --- |
| [`architecture.md`](architecture.md) | PixelForge architecture |
| [`developer-guide.md`](developer-guide.md) | Developer guide |
| [`testing.md`](testing.md) | Testing |
| [`operations.md`](operations.md) | Release and operations runbook |
| [`deployment.md`](deployment.md) | Google Cloud deployment |
| [`security-and-privacy.md`](security-and-privacy.md) | Security and privacy |
| [`data-formats.md`](data-formats.md) | PixelForge data formats |
| [`reusable-application-architecture.md`](reusable-application-architecture.md) | Reusable application architecture and delivery blueprint |
| [`knowledge-base.md`](knowledge-base.md) | Help Center (knowledge base) |

### Document model and layers

Frames, layer kinds, groups, masks, smart objects and layer commands.

| Document | Title |
| --- | --- |
| [`layer-document-format.md`](layer-document-format.md) | Editable layer milestone — version 2 |
| [`new-document-contract.md`](new-document-contract.md) | New document contract |
| [`group-compositing-contract.md`](group-compositing-contract.md) | Isolated group compositing contract |
| [`layer-alignment-contract.md`](layer-alignment-contract.md) | Layer alignment and distribution contract |
| [`layer-arrange-contract.md`](layer-arrange-contract.md) | Layer Arrange contract |
| [`layer-links-contract.md`](layer-links-contract.md) | Generic layer links contract |
| [`layer-lock-contract.md`](layer-lock-contract.md) | Layer lock contract |
| [`layer-mask-contract.md`](layer-mask-contract.md) | Raster layer-mask contract |
| [`layer-merge-contract.md`](layer-merge-contract.md) | Merge Layers contract |
| [`layer-merge-visible-contract.md`](layer-merge-visible-contract.md) | Merge Visible contract |
| [`layer-pixel-budget-contract.md`](layer-pixel-budget-contract.md) | Layer pixel budget, automatic content-bounds storage and Trim Layer to Content |
| [`layer-search-contract.md`](layer-search-contract.md) | Find Layers contract |
| [`layer-selection-contract.md`](layer-selection-contract.md) | Multi-layer selection contract |
| [`linked-layer-selection-contract.md`](linked-layer-selection-contract.md) | Select Linked Layers contract |
| [`layer-styles-contract.md`](layer-styles-contract.md) | Layer Styles milestone contract |
| [`layers-panel-interaction-contract.md`](layers-panel-interaction-contract.md) | Layers panel interaction contract |
| [`clipping-mask-contract.md`](clipping-mask-contract.md) | Clipping mask contract |
| [`vector-mask-contract.md`](vector-mask-contract.md) | Vector mask contract |
| [`smart-objects-contract.md`](smart-objects-contract.md) | Embedded Smart Object contract |
| [`smart-filters-contract.md`](smart-filters-contract.md) | Smart Filters contract |
| [`artboard-replacement-contract.md`](artboard-replacement-contract.md) | Artboard smart-object replacement contract |
| [`adjustment-layers-contract.md`](adjustment-layers-contract.md) | Adjustment layer contract |
| [`reference-image-contract.md`](reference-image-contract.md) | Reference image contract |
| [`audio-annotation-contract.md`](audio-annotation-contract.md) | Audio Annotation contract |
| [`color-mode-contract.md`](color-mode-contract.md) | Image mode contract |
| [`color-profile-conversion-contract.md`](color-profile-conversion-contract.md) | Color profile assignment and conversion contract |
| [`color-settings-contract.md`](color-settings-contract.md) | Color Settings contract |

### Selections and masking

Marquee/lasso/assisted selections, refinement and mask extraction.

| Document | Title |
| --- | --- |
| [`assisted-selection-contract.md`](assisted-selection-contract.md) | Subject and Sky selection contract |
| [`object-selection-contract.md`](object-selection-contract.md) | Object Selection contract |
| [`quick-selection-contract.md`](quick-selection-contract.md) | Quick Selection contract |
| [`magnetic-lasso-contract.md`](magnetic-lasso-contract.md) | Magnetic Lasso contract |
| [`similar-selection-contract.md`](similar-selection-contract.md) | Local Similar Selection contract |
| [`color-region-contract.md`](color-region-contract.md) | Colour region contract (Magic Wand and Fill) |
| [`selection-brush-contract.md`](selection-brush-contract.md) | Selection Brush contract |
| [`selection-composition-contract.md`](selection-composition-contract.md) | Raster selection composition contract |
| [`selection-feather-contract.md`](selection-feather-contract.md) | Selection Feather contract |
| [`selection-outline-contract.md`](selection-outline-contract.md) | Selection outline contract |
| [`selection-refinement-contract.md`](selection-refinement-contract.md) | Selection refinement contract |
| [`select-and-mask-contract.md`](select-and-mask-contract.md) | Select and Mask contract |
| [`stroke-selection-contract.md`](stroke-selection-contract.md) | Stroke Selection contract |
| [`mask-all-objects-contract.md`](mask-all-objects-contract.md) | Mask All Objects contract |
| [`mask-refinement-contract.md`](mask-refinement-contract.md) | Background-removal mask refinement contract |
| [`matting-contract.md`](matting-contract.md) | Matting contract |
| [`background-removal-contract.md`](background-removal-contract.md) | PixelForge local background-removal contract |
| [`text-mask-contract.md`](text-mask-contract.md) | Type Mask contract |

### Painting and retouching

Brushes, erasers, healing, cloning, tonal and content-aware tools.

| Document | Title |
| --- | --- |
| [`brush-tool-contract.md`](brush-tool-contract.md) | Brush, eraser, clone and healing contract |
| [`brush-build-up-contract.md`](brush-build-up-contract.md) | Brush Build-up contract |
| [`brush-dynamics-contract.md`](brush-dynamics-contract.md) | Brush dynamics contract |
| [`brush-flow-contract.md`](brush-flow-contract.md) | Brush flow contract |
| [`brush-presets-contract.md`](brush-presets-contract.md) | Brush Presets contract |
| [`custom-brush-presets-contract.md`](custom-brush-presets-contract.md) | Custom brush presets contract |
| [`brush-pressure-contract.md`](brush-pressure-contract.md) | Brush pressure curve contract |
| [`brush-secondary-contract.md`](brush-secondary-contract.md) | Secondary brush tip contract |
| [`brush-smoothing-contract.md`](brush-smoothing-contract.md) | Brush smoothing contract |
| [`brush-texture-contract.md`](brush-texture-contract.md) | Brush texture contract |
| [`brush-wet-edges-contract.md`](brush-wet-edges-contract.md) | Brush Wet Edges contract |
| [`eraser-tool-contract.md`](eraser-tool-contract.md) | Background Eraser and Magic Eraser contract |
| [`adjustment-brush-contract.md`](adjustment-brush-contract.md) | Adjustment Brush contract |
| [`art-history-brush-contract.md`](art-history-brush-contract.md) | Art History Brush contract |
| [`mixer-history-brush-contract.md`](mixer-history-brush-contract.md) | Mixer Brush and History Brush contract |
| [`smudge-tool-contract.md`](smudge-tool-contract.md) | Smudge tool contract |
| [`retouch-tools-contract.md`](retouch-tools-contract.md) | Blur and Sharpen brush contract |
| [`tonal-tool-contract.md`](tonal-tool-contract.md) | Dodge, Burn and Sponge contract |
| [`color-replacement-contract.md`](color-replacement-contract.md) | Color Replacement tool contract |
| [`red-eye-contract.md`](red-eye-contract.md) | Red Eye contract |
| [`spot-healing-contract.md`](spot-healing-contract.md) | Spot Healing / Remove contract |
| [`patch-tool-contract.md`](patch-tool-contract.md) | Patch Tool contract |
| [`pattern-stamp-contract.md`](pattern-stamp-contract.md) | Pattern Stamp contract |
| [`custom-pattern-presets-contract.md`](custom-pattern-presets-contract.md) | Custom pattern presets contract |
| [`content-aware-cleanup-contract.md`](content-aware-cleanup-contract.md) | Constrained Content-Aware Cleanup contract |
| [`content-aware-move-contract.md`](content-aware-move-contract.md) | Content-Aware Move contract |
| [`content-aware-scale-contract.md`](content-aware-scale-contract.md) | Content-Aware Scale contract |
| [`paint-symmetry-contract.md`](paint-symmetry-contract.md) | Paint symmetry contract |
| [`gradient-mode-contract.md`](gradient-mode-contract.md) | Gradient mode contract |
| [`edit-fill-contract.md`](edit-fill-contract.md) | Edit > Fill… contract |
| [`fade-contract.md`](fade-contract.md) | Edit → Fade contract |
| [`generative-fill-contract.md`](generative-fill-contract.md) | Local Generative Fill contract |
| [`generate-image-contract.md`](generate-image-contract.md) | Generate Image contract |
| [`generative-upscale-contract.md`](generative-upscale-contract.md) | Generative Upscale contract |
| [`prompt-to-edit-contract.md`](prompt-to-edit-contract.md) | Local Prompt to Edit contract |

### Type

Text layers, fonts and typographic features.

| Document | Title |
| --- | --- |
| [`type-tool-contract.md`](type-tool-contract.md) | Type tool contract |
| [`text-tool-font-contract.md`](text-tool-font-contract.md) | Text tool font contract |
| [`text-on-path-contract.md`](text-on-path-contract.md) | Editable text-on-path contract |
| [`text-warp-contract.md`](text-warp-contract.md) | Editable Warp Text contract |
| [`text-replace-contract.md`](text-replace-contract.md) | Editable text replacement contract |
| [`text-language-contract.md`](text-language-contract.md) | Text language options contract |
| [`vertical-type-contract.md`](vertical-type-contract.md) | Vertical type contract |
| [`open-type-contract.md`](open-type-contract.md) | OpenType presentation contract |
| [`type-style-presets-contract.md`](type-style-presets-contract.md) | Default type styles contract |
| [`update-text-layers-contract.md`](update-text-layers-contract.md) | Update All Text Layers contract |
| [`spellcheck-contract.md`](spellcheck-contract.md) | Check Spelling contract |
| [`font-library-contract.md`](font-library-contract.md) | Font library contract |
| [`font-fallback-contract.md`](font-fallback-contract.md) | Font fallback disclosure contract |
| [`font-preview-size-contract.md`](font-preview-size-contract.md) | Font Preview Size contract |

### Vector and paths

Pen, paths, shapes and vector conversion.

| Document | Title |
| --- | --- |
| [`path-tool-contract.md`](path-tool-contract.md) | Pen and Path layer contract |
| [`path-edit-tools-contract.md`](path-edit-tools-contract.md) | Path Selection and anchor-editing tools contract |
| [`work-path-contract.md`](work-path-contract.md) | Work Path contract |
| [`shape-tools-contract.md`](shape-tools-contract.md) | Shape tools contract (U family) |
| [`custom-shape-presets-contract.md`](custom-shape-presets-contract.md) | Custom shape preset contract |
| [`convert-to-shape-contract.md`](convert-to-shape-contract.md) | Convert to Shape contract |
| [`cookie-cutter-contract.md`](cookie-cutter-contract.md) | Cookie Cutter contract |

### Adjustments

Image > Adjustments and analysis.

| Document | Title |
| --- | --- |
| [`adjustments-menu-contract.md`](adjustments-menu-contract.md) | Image Adjustments chooser contract |
| [`auto-adjustment-contract.md`](auto-adjustment-contract.md) | Auto adjustment contract |
| [`curves-adjustment-contract.md`](curves-adjustment-contract.md) | Curves adjustment contract |
| [`levels-adjustment-contract.md`](levels-adjustment-contract.md) | Levels adjustment contract |
| [`histogram-contract.md`](histogram-contract.md) | Histogram analysis contract |
| [`apply-image-contract.md`](apply-image-contract.md) | Apply Image contract |
| [`camera-raw-filter-contract.md`](camera-raw-filter-contract.md) | Camera Raw Filter contract |

### Filters and effects

Filter menu effects, blur galleries, distortions, render and stylize.

| Document | Title |
| --- | --- |
| [`filter-gallery-contract.md`](filter-gallery-contract.md) | Filter Gallery contract |
| [`blur-effects-contract.md`](blur-effects-contract.md) | Local blur effects contract |
| [`field-blur-contract.md`](field-blur-contract.md) | Field Blur contract |
| [`tilt-shift-effect-contract.md`](tilt-shift-effect-contract.md) | Tilt-Shift Blur Gallery contract |
| [`path-spin-blur-contract.md`](path-spin-blur-contract.md) | Path Blur and Spin Blur contract |
| [`add-noise-effect-contract.md`](add-noise-effect-contract.md) | Add Noise effect contract |
| [`ai-denoise-effect-contract.md`](ai-denoise-effect-contract.md) | AI Denoise effect contract |
| [`ai-sharpen-effect-contract.md`](ai-sharpen-effect-contract.md) | AI Sharpen effect contract |
| [`color-halftone-effect-contract.md`](color-halftone-effect-contract.md) | Color Halftone effect contract |
| [`crystallize-effect-contract.md`](crystallize-effect-contract.md) | Crystallize effect contract |
| [`deinterlace-effect-contract.md`](deinterlace-effect-contract.md) | De-Interlace filter contract |
| [`despeckle-effect-contract.md`](despeckle-effect-contract.md) | Despeckle effect contract |
| [`difference-clouds-effect-contract.md`](difference-clouds-effect-contract.md) | Difference Clouds filter contract |
| [`clouds-effect-contract.md`](clouds-effect-contract.md) | Render Clouds contract |
| [`diffuse-effect-contract.md`](diffuse-effect-contract.md) | Diffuse effect contract |
| [`displace-effect-contract.md`](displace-effect-contract.md) | Displace filter contract |
| [`dust-scratches-effect-contract.md`](dust-scratches-effect-contract.md) | Dust & Scratches effect contract |
| [`emboss-effect-contract.md`](emboss-effect-contract.md) | Stylize → Emboss effect contract |
| [`facet-effect-contract.md`](facet-effect-contract.md) | Facet effect contract |
| [`fibers-effect-contract.md`](fibers-effect-contract.md) | Fibers filter contract |
| [`flame-effect-contract.md`](flame-effect-contract.md) | Flame filter contract |
| [`fragment-effect-contract.md`](fragment-effect-contract.md) | Fragment filter contract |
| [`gradient-map-effect-contract.md`](gradient-map-effect-contract.md) | Gradient Map effect contract |
| [`high-pass-effect-contract.md`](high-pass-effect-contract.md) | High Pass effect contract |
| [`lens-correction-effect-contract.md`](lens-correction-effect-contract.md) | Lens Correction filter contract |
| [`lens-flare-effect-contract.md`](lens-flare-effect-contract.md) | Lens Flare filter contract |
| [`light-rays-filter-contract.md`](light-rays-filter-contract.md) | Light Rays filter contract |
| [`liquify-effect-contract.md`](liquify-effect-contract.md) | Liquify effect contract |
| [`median-effect-contract.md`](median-effect-contract.md) | Median effect contract |
| [`mezzotint-effect-contract.md`](mezzotint-effect-contract.md) | Mezzotint effect contract |
| [`neural-filters-effect-contract.md`](neural-filters-effect-contract.md) | Neural Filters effect contract |
| [`ntsc-colors-effect-contract.md`](ntsc-colors-effect-contract.md) | NTSC Colors effect contract |
| [`picture-frame-effect-contract.md`](picture-frame-effect-contract.md) | Picture Frame effect contract |
| [`pinch-effect-contract.md`](pinch-effect-contract.md) | Local Pinch effect contract |
| [`pointillize-effect-contract.md`](pointillize-effect-contract.md) | Pointillize filter contract |
| [`polar-coordinates-effect-contract.md`](polar-coordinates-effect-contract.md) | Polar Coordinates filter contract |
| [`reduce-noise-effect-contract.md`](reduce-noise-effect-contract.md) | Reduce Noise effect contract |
| [`reflection-removal-effect-contract.md`](reflection-removal-effect-contract.md) | Reflection Removal effect contract |
| [`ripple-effect-contract.md`](ripple-effect-contract.md) | Ripple effect contract |
| [`sharpen-edges-effect-contract.md`](sharpen-edges-effect-contract.md) | Sharpen Edges effect contract |
| [`sharpen-more-effect-contract.md`](sharpen-more-effect-contract.md) | Sharpen More effect contract |
| [`shear-effect-contract.md`](shear-effect-contract.md) | Linear local Shear milestone |
| [`smart-sharpen-effect-contract.md`](smart-sharpen-effect-contract.md) | Smart Sharpen effect contract |
| [`solarize-effect-contract.md`](solarize-effect-contract.md) | Solarize effect contract |
| [`spherize-effect-contract.md`](spherize-effect-contract.md) | Local Spherize effect contract |
| [`tree-effect-contract.md`](tree-effect-contract.md) | Render → Tree effect contract |
| [`twirl-effect-contract.md`](twirl-effect-contract.md) | Twirl effect contract |
| [`unsharp-mask-effect-contract.md`](unsharp-mask-effect-contract.md) | Unsharp Mask effect contract |
| [`wave-effect-contract.md`](wave-effect-contract.md) | Local Wave effect contract |
| [`wind-effect-contract.md`](wind-effect-contract.md) | Wind effect contract |
| [`zigzag-effect-contract.md`](zigzag-effect-contract.md) | ZigZag filter contract |
| [`adaptive-wide-angle-contract.md`](adaptive-wide-angle-contract.md) | Adaptive Wide Angle contract |
| [`perspective-warp-contract.md`](perspective-warp-contract.md) | Perspective Warp contract |
| [`puppet-warp-contract.md`](puppet-warp-contract.md) | Puppet Warp contract |
| [`vanishing-point-contract.md`](vanishing-point-contract.md) | Vanishing Point contract |

### Import and export

File formats in and out, clipboard and batch output.

| Document | Title |
| --- | --- |
| [`export-contract.md`](export-contract.md) | PixelForge image export contract |
| [`svg-export-contract.md`](svg-export-contract.md) | SVG export contract |
| [`svg-import-contract.md`](svg-import-contract.md) | SVG import contract |
| [`css-export-contract.md`](css-export-contract.md) | Copy CSS contract |
| [`pdf-import-contract.md`](pdf-import-contract.md) | PDF import contract |
| [`psd-import-contract.md`](psd-import-contract.md) | PSD/PSB composite import contract |
| [`tiff-import-contract.md`](tiff-import-contract.md) | TIFF composite import contract |
| [`paste-special-contract.md`](paste-special-contract.md) | Paste Special contract |
| [`metadata-privacy-contract.md`](metadata-privacy-contract.md) | File Info and export privacy contract |
| [`image-batch-contract.md`](image-batch-contract.md) | PixelForge multi-input batch export contract |
| [`crop-slice-contract.md`](crop-slice-contract.md) | Crop, Frame and Slice contract |

### Storage, drafts and cloud

Local persistence, project bundles, history and optional cloud.

| Document | Title |
| --- | --- |
| [`draft-storage-contract.md`](draft-storage-contract.md) | Durable local draft storage |
| [`portable-project-bundle-contract.md`](portable-project-bundle-contract.md) | Portable editable project bundle v3 |
| [`tiled-layer-assets-contract.md`](tiled-layer-assets-contract.md) | Tiled, Blob-backed layer assets |
| [`history-purge-contract.md`](history-purge-contract.md) | Undo history purge contract |
| [`history-timeline-contract.md`](history-timeline-contract.md) | History timeline contract |
| [`cloud-conflict-contract.md`](cloud-conflict-contract.md) | Authenticated cloud conflict recovery |
| [`cheaply-auth-optional.md`](cheaply-auth-optional.md) | Optional Cheaply Auth migration |
| [`actions-contract.md`](actions-contract.md) | Local action recipe contract |
| [`tool-presets-contract.md`](tool-presets-contract.md) | Tool presets contract |

### Performance and rendering

Budgets, workers and render/sync behaviour.

| Document | Title |
| --- | --- |
| [`performance-budgets.md`](performance-budgets.md) | Performance budgets and current limits |
| [`worker-render-contract.md`](worker-render-contract.md) | Worker document-render contract |
| [`streaming-contract.md`](streaming-contract.md) | Rendering and sync contract |
| [`accessibility-performance.md`](accessibility-performance.md) | Accessibility and motion contract |

### UI shell and interaction

Toolbar, menus, sidebar, shortcuts, view and navigation.

| Document | Title |
| --- | --- |
| [`toolbar-contract.md`](toolbar-contract.md) | Compact toolbar and tool-family contract |
| [`toolbar-settings-contract.md`](toolbar-settings-contract.md) | Toolbar settings contract |
| [`contextual-sidebar-contract.md`](contextual-sidebar-contract.md) | Contextual properties sidebar contract |
| [`sidebar-autoscroll-contract.md`](sidebar-autoscroll-contract.md) | Properties sidebar auto-scroll contract |
| [`scrollbar-contract.md`](scrollbar-contract.md) | Scrollbar contract |
| [`menu-preferences-contract.md`](menu-preferences-contract.md) | Menu visibility preference contract |
| [`command-search-contract.md`](command-search-contract.md) | Command search contract |
| [`command-shortcuts-contract.md`](command-shortcuts-contract.md) | Custom command shortcut contract |
| [`keyboard-shortcuts.md`](keyboard-shortcuts.md) | Keyboard shortcuts |
| [`keyboard-shortcuts-dialog-contract.md`](keyboard-shortcuts-dialog-contract.md) | Keyboard shortcuts dialog contract |
| [`screen-modes-contract.md`](screen-modes-contract.md) | Screen modes contract |
| [`view-zoom-contract.md`](view-zoom-contract.md) | View zoom contract |
| [`navigation-tool-options-contract.md`](navigation-tool-options-contract.md) | Navigation, sampling, measurement and crop tool options |
| [`measurement-contract.md`](measurement-contract.md) | Sampling and measurement contract |

### Operations and analytics

Hosting, offline shell and measurement.

| Document | Title |
| --- | --- |
| [`offline-pwa.md`](offline-pwa.md) | Offline and installable shell |
| [`analytics.md`](analytics.md) | Cheaply PixelForge analytics |

### Product, roadmap and history

Scope, roadmaps, audits and handoff notes. Dated status in these files may be stale; source, tests and live release evidence take precedence.

| Document | Title |
| --- | --- |
| [`product-scope.md`](product-scope.md) | PixelForge product direction |
| [`roadmap-progress-rubric.md`](roadmap-progress-rubric.md) | Roadmap progress rubric |
| [`menu-roadmap.md`](menu-roadmap.md) | Photoshop menu and workflow roadmap |
| [`tool-roadmap.md`](tool-roadmap.md) | Pixel professional toolbar roadmap |
| [`top-ten-tools-roadmap.md`](top-ten-tools-roadmap.md) | Ten high-use Photoshop workflows |
| [`remaining-implementation-goal.md`](remaining-implementation-goal.md) | PixelForge remaining implementation goal |
| [`tool-audit-2026-11.md`](tool-audit-2026-11.md) | Toolbar audit on production — 2026-11-09 |
| [`claude-code-handoff.md`](claude-code-handoff.md) | PixelForge development handoff for Claude Code |
