# Generative Upscale contract

`Image → Generative Upscale…` is an enabled local approximation for creating a
larger editable document. It supports bounded 2× and 4× factors, rejects
dimensions above 16,000 pixels or 16 megapixels, and uses the existing
alpha-safe automatic or bilinear canvas resampler. Layer identities,
transforms, masks, selections and immutable source assets remain editable and
the operation is one undoable history frame.

The command is intentionally disclosed as an **offline approximation**. It
does not call an AI provider, upload document data, infer semantic content or
claim Adobe Generative Upscale parity. Four-times scaling is only offered when
the resulting document remains within the local resource budget. The browser
dialog previews dimensions, exposes the resampling method and supports Escape
cancellation without changing the draft.

Pure planner tests cover factor/method validation, input immutability and
dimension/pixel budgets. Desktop and mobile browser coverage verifies menu
discovery, disclosure, responsive bounds, apply/undo and cancellation. The
operation still requires the normal protected CI, merge, deployment and live
verification gates before it can be called shipped.
