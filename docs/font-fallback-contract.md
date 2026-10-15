# Font fallback disclosure contract

PixelForge keeps text editing local and editable when a requested family is
not available in the browser. The Type menu's **Manage Missing Fonts** command
checks only the bounded built-in family list (`Arial`, `Georgia`, `Courier New`
and `Verdana`) through the browser `FontFaceSet` API. Each family is reported as
available or **Fallback active**; the dialog does not download, install or send
font files, text content or document pixels to a provider.

The text inspector repeats the result for the selected family so a user can
see when the browser will substitute a fallback while continuing to edit the
same preference and layer metadata. Availability is a browser capability, not
a promise that a particular operating system has identical font metrics. A
malformed, overlong or unavailable family fails closed to the fallback state.

The contract is intentionally bounded: provider-backed font libraries, font
installation, full OpenType shaping/metrics, language-specific fallback chains
and automatic font replacement remain future work. The pure contract tests
cover normalization, shorthand construction, positive/negative checks and
browser-check failures. The desktop/mobile browser test forces an unavailable
font surface, verifies the dialog and inspector disclosure, and confirms the
editable family survives reload without an upload.
