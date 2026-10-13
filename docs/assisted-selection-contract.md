# Subject and Sky selection contract

`Select > Subject` and `Select > Sky` provide deterministic, offline selection
proxies. Subject compares opaque pixels with the mean opaque border colour and
applies a bounded centre bias. Sky examines the upper frame for blue/bright
pixels and fades at a bounded horizon. Both operations return a canvas-sized
alpha mask, multiply coverage by source alpha, preserve hidden RGB, and compose
through the existing Replace/Add/Subtract/Intersect selection algebra.

The result is explicitly labelled **local offline proxy** in the editor. It is
not semantic object recognition, hair/edge reconstruction, a cloud model, or a
claim of Photoshop equivalence. No pixels leave the browser. Invalid
dimensions, channel values, thresholds, softness and horizon values fail
closed before allocation. The mask is an ordinary project asset, so undo,
reload, portable project export and selection composition retain the existing
data-safety guarantees.

Unit coverage exercises contrast and blue upper-frame fixtures, transparency,
determinism and invalid-input guards. Desktop and mobile browser coverage
exercises both menu commands, mask asset creation and project reload.
