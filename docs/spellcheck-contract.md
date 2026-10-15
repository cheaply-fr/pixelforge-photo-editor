# Check Spelling contract

`Edit > Check Spelling…` scans editable text layers locally and reports unique
unknown words with occurrence counts. It uses a bounded embedded English
dictionary, never uploads or persists text outside the existing local project,
and leaves every layer and pixel unchanged. The result is a hint list rather
than a complete language, grammar, or provider-backed spell checker.

The command is disabled when no editable text layer exists, is dismissible with
Escape or Close, and is covered by pure tokenizer/count tests and desktop/mobile
browser coverage that creates a misspelling through the existing editable text
workflow.
