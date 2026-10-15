# Custom shape preset contract

Edit → Define Custom Shape… stores a bounded local preset for the active rectangle, ellipse, line or polygon tool. The preset contains a user label, shape kind and six-digit foreground colour; at most 32 presets are retained, labels are trimmed to 80 characters, malformed or duplicate identifiers are rejected during project restore, and no source image or remote provider is involved.

Selecting a saved shape preset in Tool options switches to its shape tool and colour. Presets are included in anonymous draft settings and portable project settings, so reload and download round trips keep the user’s local library. The operation does not create pixels until the user draws a shape, and the preset itself is not an editable layer. Unsupported Photoshop custom path libraries, imported shape files, arbitrary geometry kernels and cloud synchronization remain staged.

Acceptance evidence includes unit validation for malformed, duplicate and oversized settings plus desktop/mobile browser coverage for save, empty-name rejection, project export and reload discovery.
