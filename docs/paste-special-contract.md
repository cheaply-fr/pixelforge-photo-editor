# Paste Special contract

`Edit → Paste Special…` operates on PixelForge's private layer clipboard. It
does not read or upload the operating-system clipboard and it never mutates the
copied layer or its source asset.

The dialog exposes three bounded local placements:

- **Paste in Place** preserves the copied affine matrix.
- **Paste at Center** preserves scale, rotation and shear, translating the
  copied layer's local painted centre to the destination canvas centre.
- **Paste into Selection** is available only when a selection exists and the
  clipboard contains a raster or smart-object layer. It adds a canvas-space
  nondestructive layer mask generated from the current selection.

Every successful paste inserts one unlocked layer and one undoable history
state. A missing clipboard, stale asset, full layer stack, unsupported layer
kind or malformed placement fails without changing the document. The centered
placement is a deterministic affine approximation; it does not claim
Photoshop's full clipboard format, document-coordinate or vector clipboard
interchange. Pure placement and invalid-input coverage lives in
`tests/paste-special.test.mjs`; desktop/mobile UI, mask and project round-trip
coverage lives in `tests/browser/paste-special.spec.ts`.
