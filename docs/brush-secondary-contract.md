# Secondary brush tip contract

Brush, Pencil, and Eraser expose an optional persisted **Secondary brush tip**
selected from the bounded local preset set. When the existing **Dual brush**
amount is above zero, the selected preset contributes a second deterministic
stamp at the same pointer position; the amount controls its opacity. `None` and
zero amount are exact legacy-compatible identities. The second tip uses the
same pressure, source offset, colour, mode, alpha rules, and undo commit as the
primary tip. Preset IDs are allow-listed and malformed persisted values fail
closed to `None`.
