# Crop, Frame and Slice contract

This contract defines the deterministic geometry needed by the Crop and Slice toolbar family. It is intentionally independent of React and the document history so a drag preview can be cancelled without changing a draft. The source RGBA buffer and document layer assets remain immutable; commands should commit a new history frame only after the user confirms the plan.

## Perspective Crop

`planPerspectiveCrop(canvasWidth, canvasHeight, { quad, width?, height? })` accepts four finite, convex corners in clockwise or counter-clockwise order. Corners must be inside the source canvas. Output dimensions are whole pixels, bounded by the same 16,000-pixel edge and 16-megapixel document limits used by the rest of PixelForge. When dimensions are omitted, the planner uses the rounded average lengths of opposite edges.

The returned `sourceFromOutput` homography maps the output rectangle's corners to the selected source corners. `warpPerspectiveRgba` samples that mapping into a fresh RGBA buffer with clamped nearest-neighbour sampling. This is a predictable local baseline for crop previews and exports; it does not claim bicubic reconstruction, content-aware fill, or mesh warp. Identity quads are a no-op plan and preserve every source byte.

## Frame placement

`planFramePlacement` calculates a rectangular placeholder's source crop and affine placement using `contain`, `cover`, or `stretch`. Contain centers the complete source and leaves letterbox space for a caller to render as transparent; cover center-crops the source to fill the frame; stretch maps both axes independently. `frameMask` creates a canvas-sized alpha mask, optionally with a bounded rounded corner radius. The mask contains no source pixels and is safe to persist as an intermediate frame asset.

## Slices

`planSlices` validates one to 256 whole, non-empty rectangles inside a canvas, requires non-empty unique IDs, and sanitizes names for local export. Overlapping slices are allowed because Slice and Slice Select workflows can intentionally create overlapping export regions. `extractSlices` copies each rectangle into an independent RGBA buffer in declaration order and never mutates the source. Plans contain only JSON-safe metadata and can be stored with a draft or project file; extracted pixel buffers must remain local until an explicit export action.

The editor exposes a deterministic single-slice workflow through the Slice toolbar button and Image → Slice tool. Dragging stages a pixel-aligned rectangle without changing document history; the preview accepts a validated name, can be cancelled with Escape or Cancel, and downloads a standalone PNG on demand. The renderer reads the current composite into an isolated surface and `extractSlices` copies the selected rows, so source layers, pixels, and undo state remain unchanged. Enter confirms the staged download, and the same pointer workflow works with touch input on the mobile layout.

## Test and release gates

The pure suite covers degenerate/folded quads, all four homography corners, identity and perspective pixel copies, fit modes, rounded masks, dimension and slice validation, source immutability and plan JSON round trips. `tests/browser/crop-slice.spec.ts` boots the editor in both desktop and mobile Playwright projects and covers the serializable plan/byte assertions plus toolbar/menu activation, drag preview, naming, cancel, download and source/history immutability. Deployment still requires the release and live-revision gates in [`tool-roadmap.md`](./tool-roadmap.md#extensive-test-contract).
