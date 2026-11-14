import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  initialPromptValues,
  parsePromptValues,
  validatePromptForm,
  type PromptField,
  type PromptRawValues,
  type PromptRequest,
  type PromptValues,
} from './promptForm';

/**
 * Accessible in-app replacement for window.prompt: a modal form with typed
 * fields (text, number, select, checkbox). Enter submits, Escape or Cancel
 * cancels, invalid numbers show an inline error and disable submit. Built on
 * the native <dialog> like the other editor dialogs, so focus is trapped and
 * editor shortcuts stay off while it is open.
 */
export function PromptDialog({
  request,
  submit,
  cancel,
  opened,
}: {
  request: PromptRequest;
  submit: (values: PromptValues) => void;
  cancel: () => void;
  /** Called once on open with the element focused just before the dialog took focus. */
  opened?: (previous: Element | null) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const baseId = useId();
  const [raw, setRaw] = useState<PromptRawValues>(() => initialPromptValues(request.fields));
  const errors = validatePromptForm(request.fields, raw);
  const valid = Object.keys(errors).length === 0;
  // Fixed for the life of one request (the hook keys each request).
  const openedOnce = useRef(opened);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    openedOnce.current?.(document.activeElement);
    if (!element.open) element.showModal();
    // Like window.prompt, the first field starts focused with its text selected.
    const first = element.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
    first?.focus();
    if (first instanceof HTMLInputElement && first.type === 'text') first.select();
  }, []);
  const set = (id: string, value: string | boolean) => setRaw((current) => ({ ...current, [id]: value }));
  // Enter on a select or checkbox submits too, as it does in a text field.
  const submitOnEnter = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    form.current?.requestSubmit();
  };
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  return (
    <dialog
      ref={dialog}
      className="editor-dialog prompt-dialog"
      aria-labelledby={titleId}
      aria-describedby={request.description ? descriptionId : undefined}
      aria-modal="true"
      data-testid="prompt-dialog"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <form
        ref={form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const values = parsePromptValues(request.fields, raw);
          if (values) submit(values);
        }}
      >
        <h2 id={titleId}>{request.title}</h2>
        {request.description && <p id={descriptionId}>{request.description}</p>}
        {request.fields.map((field) => (
          <PromptFieldControl
            key={field.id}
            field={field}
            id={`${baseId}-${field.id}`}
            value={raw[field.id]}
            error={errors[field.id]}
            set={(value) => set(field.id, value)}
            submitOnEnter={submitOnEnter}
          />
        ))}
        <div className="dialog-actions">
          <button type="button" onClick={cancel}>Cancel</button>
          <button type="submit" disabled={!valid}>{request.submitLabel ?? 'OK'}</button>
        </div>
      </form>
    </dialog>
  );
}

function PromptFieldControl({
  field,
  id,
  value,
  error,
  set,
  submitOnEnter,
}: {
  field: PromptField;
  id: string;
  value: string | boolean | undefined;
  error: string | undefined;
  set: (value: string | boolean) => void;
  submitOnEnter: (event: KeyboardEvent<HTMLElement>) => void;
}) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [field.hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  if (field.type === 'checkbox')
    return (
      <div className="prompt-dialog-field prompt-dialog-check">
        <input id={id} type="checkbox" checked={value === true} aria-describedby={describedBy} onKeyDown={submitOnEnter} onChange={(event) => set(event.target.checked)} />
        <label htmlFor={id}>{field.label}</label>
        {field.hint && <small id={hintId}>{field.hint}</small>}
      </div>
    );
  let control: ReactNode;
  if (field.type === 'select')
    control = (
      <select id={id} value={String(value ?? '')} aria-describedby={describedBy} aria-invalid={error ? true : undefined} onKeyDown={submitOnEnter} onChange={(event) => set(event.target.value)}>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  else
    control = (
      <input
        id={id}
        type="text"
        inputMode={field.type === 'number' && field.min !== undefined && field.min >= 0 ? 'decimal' : undefined}
        autoComplete="off"
        spellCheck={field.type === 'text' ? undefined : false}
        maxLength={field.type === 'text' ? field.maxLength : undefined}
        value={String(value ?? '')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => set(event.target.value)}
      />
    );
  return (
    <div className="prompt-dialog-field">
      <label htmlFor={id}>{field.label}</label>
      <span className="prompt-dialog-control">
        {control}
        {field.type === 'number' && field.suffix && <span className="prompt-dialog-suffix" aria-hidden="true">{field.suffix}</span>}
      </span>
      {field.hint && <small id={hintId}>{field.hint}</small>}
      {error && <p id={errorId} role="alert" className="resize-error prompt-dialog-error">{error}</p>}
    </div>
  );
}

type PendingPrompt = {
  key: number;
  request: PromptRequest;
  resolve: (values: PromptValues | null) => void;
  /** The element that was focused when the prompt was requested. */
  opener: Element | null;
  /** Focused element when the dialog opened (e.g. a menu trigger after its menu closed). */
  fallback: Element | null;
};

/**
 * Promise-based prompt: `await ask({...})` resolves with the parsed field
 * values, or null when the person cancels. Render `dialog` somewhere in the
 * calling component. A new request cancels any prompt still open, and focus
 * goes back to the opener (or the nearest still-connected fallback) on close.
 */
export function usePromptDialog(): {
  ask: (request: PromptRequest) => Promise<PromptValues | null>;
  dialog: ReactNode;
} {
  const [pending, setPending] = useState<PendingPrompt | null>(null);
  const current = useRef<PendingPrompt | null>(null);
  const sequence = useRef(0);
  const restoreFocus = useRef<Element[] | null>(null);
  const ask = useCallback((request: PromptRequest) => new Promise<PromptValues | null>((resolve) => {
    current.current?.resolve(null);
    const next: PendingPrompt = {
      key: ++sequence.current,
      request,
      resolve,
      opener: typeof document === 'undefined' ? null : document.activeElement,
      fallback: null,
    };
    current.current = next;
    setPending(next);
  }), []);
  const finish = useCallback((values: PromptValues | null) => {
    const active = current.current;
    if (!active) return;
    current.current = null;
    restoreFocus.current = [active.opener, active.fallback].filter((item): item is Element => item !== null);
    setPending(null);
    active.resolve(values);
  }, []);
  useEffect(() => {
    if (pending || !restoreFocus.current) return;
    const candidates = restoreFocus.current;
    restoreFocus.current = null;
    const target = candidates.find((item) => item instanceof HTMLElement && item.isConnected && item !== document.body);
    if (target instanceof HTMLElement) target.focus({ preventScroll: true });
  }, [pending]);
  // An unmounted caller can never see the answer; settle it as cancelled.
  useEffect(() => () => current.current?.resolve(null), []);
  const dialog = pending ? (
    <PromptDialog
      key={pending.key}
      request={pending.request}
      submit={(values) => finish(values)}
      cancel={() => finish(null)}
      opened={(previous) => { if (current.current) current.current.fallback = previous; }}
    />
  ) : null;
  return { ask, dialog };
}
