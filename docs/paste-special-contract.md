# Paste Special contract

`Edit → Paste Special…` operates on PixelForge's private layer clipboard. It
does not read or upload the operating-system clipboard (OS image paste is
described below) and it never mutates the
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

## Operating-system clipboard images

When the private layer clipboard is empty, an image on the operating-system
clipboard is pasted as one new raster layer named `Pasted image.<ext>`:

- **Ctrl/Cmd+V** is handled by a `paste` listener on the document. It was
  previously attached to the editor root, so a paste while focus was on
  `<body>` (after load, or after a menu or dialog closed) never reached it.
  Text fields keep native paste. If no `paste` event arrives within 300 ms of
  the shortcut (some embedded browsers), PixelForge reads
  `navigator.clipboard.read()` instead.
- **Edit → Paste Image from Clipboard** always uses
  `navigator.clipboard.read()`. An unsupported API, a denied permission or a
  clipboard without an image produces a specific message and leaves the
  document unchanged.

When the layer clipboard holds a copied layer, Ctrl/Cmd+V pastes that layer
and the OS clipboard is ignored. Image bytes are decoded locally through the
normal import path and never uploaded. Coverage: `tests/clipboard-image.test.mjs`
and `tests/browser/os-clipboard-paste.spec.ts` (desktop and mobile, with real
Chromium clipboard permissions).
