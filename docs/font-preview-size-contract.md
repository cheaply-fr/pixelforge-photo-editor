# Font Preview Size contract

The Type menu's **Font Preview Size** command cycles `small`, `medium` and
`large`. The Text inspector exposes the same choice as a select control. The
setting only changes the browser font-picker option preview; it does not alter
the selected font, text-layer metrics, document pixels or project history.

The value is stored in the versioned local `Settings` envelope, defaults to
`medium`, and fails closed to that value when a bookmark or project contains an
unknown value. The mapping is deliberately bounded to 12, 16 and 22 CSS pixels
so a malformed project cannot create unbounded picker styles. No font files,
font metadata or remote provider data are uploaded.

Pure coverage is in `tests/font-preview.test.mjs`; desktop/mobile persistence
and menu cycling are covered by the Font Preview Size test in
`tests/browser/type-style-presets.spec.ts`.
