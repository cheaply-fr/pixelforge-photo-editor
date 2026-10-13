# Editable text replacement contract

`Edit → Find and Replace Text…` operates only on editable `text` layers. It
opens a local dialog with non-empty Find text, a replacement (which may be
empty), Match case, and Whole words only options. Rasterized, vector, locked,
and hidden non-text content is left untouched.

The replacement helper escapes the search term before constructing a bounded
global regular expression. A successful operation creates one immutable,
undoable frame commit and reports the number of matches and changed layers.
An unmatched term does not create history. The text remains in the existing
versioned draft and portable project export, and browser acceptance verifies
the menu state, dialog controls, editable replacement, and project round trip
on desktop and mobile.
