import { useEffect, useRef, useState } from 'react';
import { PROMPT_TO_EDIT_MAX_PROMPT } from './promptToEdit';

export default function PromptToEditDialog({
  close,
  apply,
}: {
  close: () => void;
  apply: (prompt: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [prompt, setPrompt] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  }, []);
  return (
    <dialog ref={dialog} className="editor-dialog prompt-to-edit-dialog" aria-labelledby="prompt-to-edit-title" onCancel={close}>
      <form onSubmit={(event) => { event.preventDefault(); apply(prompt); }}>
        <h2 id="prompt-to-edit-title">Prompt to Edit</h2>
        <p>
          Enter a short instruction for the private local adjustment parser. It changes only
          editable adjustment metadata; no image, prompt or account data leaves this browser.
        </p>
        <label>
          Local edit instruction
          <textarea
            aria-label="Prompt to Edit instruction"
            value={prompt}
            maxLength={PROMPT_TO_EDIT_MAX_PROMPT}
            rows={4}
            placeholder="Make it warmer and slightly brighter…"
            onChange={(event) => setPrompt(event.target.value)}
          />
        </label>
        <small>Supported examples: brighten, darken, increase contrast, saturate, grayscale, warm, cool, sharpen, soften, and hue rotate.</small>
        <div className="dialog-actions">
          <button type="button" onClick={close}>Cancel</button>
          <button type="submit">Apply local edit</button>
        </div>
      </form>
    </dialog>
  );
}
