/**
 * Pure model for the in-app prompt dialog (src/PromptDialog.tsx), which
 * replaces every window.prompt in the editor. A request lists typed fields;
 * the dialog keeps each field's raw text, validates it on every change and
 * only resolves with parsed values once every field is valid.
 *
 * DOM-free so tests/prompt-form.test.mjs can cover parsing and validation.
 */

export type PromptOption = { value: string; label: string };

type FieldBase = {
  /** Key of the field in the resolved values object. */
  id: string;
  /** Visible label; also the accessible name of the control. */
  label: string;
  /** Optional hint shown under the control. */
  hint?: string;
};

export type PromptTextField = FieldBase & {
  type: 'text';
  value: string;
  /** Reject empty or whitespace-only input. */
  required?: boolean;
  maxLength?: number;
  /** Extra check; return an error message, or null when the text is valid. */
  validate?: (text: string) => string | null;
};

export type PromptNumberField = FieldBase & {
  type: 'number';
  value: number | string;
  min?: number;
  max?: number;
  /** Whole numbers only. */
  integer?: boolean;
  /** Unit shown after the control (px, %…). */
  suffix?: string;
};

export type PromptSelectField = FieldBase & {
  type: 'select';
  value: string;
  options: readonly PromptOption[];
};

export type PromptCheckboxField = FieldBase & {
  type: 'checkbox';
  value: boolean;
};

export type PromptField = PromptTextField | PromptNumberField | PromptSelectField | PromptCheckboxField;

export type PromptRequest = {
  title: string;
  /** Optional sentence under the title. */
  description?: string;
  fields: readonly PromptField[];
  /** Submit button text (default "OK"). */
  submitLabel?: string;
};

/** Raw control state: text for text/number/select fields, booleans for checkboxes. */
export type PromptRawValues = Record<string, string | boolean>;
export type PromptValue = string | number | boolean;
export type PromptValues = Record<string, PromptValue>;

/**
 * Parse a typed number. Accepts an optional sign and a decimal point or comma
 * ("-12", "1.5", "1,5", ".5"); returns NaN for anything else, including empty
 * input, exponents, hex and Infinity.
 */
export function parsePromptNumber(text: string): number {
  const trimmed = text.trim();
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(trimmed)) return NaN;
  return Number(trimmed.replace(',', '.'));
}

/** The inline message for an invalid number field. */
export function promptNumberError(field: Pick<PromptNumberField, 'min' | 'max' | 'integer'>): string {
  const kind = field.integer ? 'a whole number' : 'a number';
  if (field.min !== undefined && field.max !== undefined) return `Enter ${kind} from ${field.min} to ${field.max}.`;
  if (field.min !== undefined) return `Enter ${kind} of at least ${field.min}.`;
  if (field.max !== undefined) return `Enter ${kind} of at most ${field.max}.`;
  return `Enter ${kind}.`;
}

/** The control's starting state for each field. */
export function initialPromptValues(fields: readonly PromptField[]): PromptRawValues {
  const values: PromptRawValues = {};
  for (const field of fields) {
    if (field.type === 'checkbox') values[field.id] = field.value === true;
    else if (field.type === 'select')
      values[field.id] = field.options.some((option) => option.value === field.value)
        ? field.value
        : (field.options[0]?.value ?? '');
    else values[field.id] = String(field.value);
  }
  return values;
}

/** Validate one field's raw value; returns an error message or null. */
export function validatePromptField(field: PromptField, raw: string | boolean | undefined): string | null {
  if (field.type === 'checkbox') return null;
  const text = typeof raw === 'string' ? raw : '';
  if (field.type === 'select')
    return field.options.some((option) => option.value === text) ? null : 'Choose one of the listed options.';
  if (field.type === 'text') {
    if (field.required && !text.trim()) return `${field.label} cannot be empty.`;
    if (field.maxLength !== undefined && text.length > field.maxLength)
      return `Use ${field.maxLength} characters or fewer.`;
    return field.validate ? field.validate(text) : null;
  }
  const value = parsePromptNumber(text);
  const outOfRange = (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max);
  if (!Number.isFinite(value) || outOfRange || (field.integer && !Number.isInteger(value)))
    return promptNumberError(field);
  return null;
}

/** Errors for every invalid field, keyed by field id (empty when all are valid). */
export function validatePromptForm(fields: readonly PromptField[], raw: PromptRawValues): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const error = validatePromptField(field, raw[field.id]);
    if (error) errors[field.id] = error;
  }
  return errors;
}

/**
 * Parse every field into its result value (numbers as numbers, checkboxes as
 * booleans, text and selects as strings). Returns null while any field is
 * invalid, so the dialog can never resolve with unchecked input.
 */
export function parsePromptValues(fields: readonly PromptField[], raw: PromptRawValues): PromptValues | null {
  if (Object.keys(validatePromptForm(fields, raw)).length) return null;
  const values: PromptValues = {};
  for (const field of fields) {
    const value = raw[field.id];
    if (field.type === 'checkbox') values[field.id] = value === true;
    else if (field.type === 'number') values[field.id] = parsePromptNumber(String(value));
    else values[field.id] = String(value ?? '');
  }
  return values;
}

/** Sentence-case a machine value for display: "soft-light" becomes "Soft light". */
export function sentenceCase(value: string): string {
  const spaced = value.replace(/[-_]+/g, ' ');
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : spaced;
}

/** Turn a list of string choices into select options. */
export function promptOptions(values: readonly string[], label: (value: string) => string = sentenceCase): PromptOption[] {
  return values.map((value) => ({ value, label: label(value) }));
}

/**
 * Parse a Perspective Warp / Vanishing Point quad: four "x,y" points
 * separated by semicolons. Returns null unless there are exactly four finite
 * pairs.
 */
export function parseQuadPoints(text: string): Array<{ x: number; y: number }> | null {
  const points = text.split(';').map((entry) => entry.split(',').map((value) => value.trim()));
  if (points.length !== 4) return null;
  const parsed: Array<{ x: number; y: number }> = [];
  for (const point of points) {
    if (point.length !== 2) return null;
    const [x, y] = point.map((value) => (value === '' ? NaN : Number(value)));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    parsed.push({ x, y });
  }
  return parsed;
}

export const MAX_PUPPET_PROMPT_PINS = 8;

export type PuppetPinInput = { x: number; y: number; dx: number; dy: number };

/**
 * Parse Puppet Warp pins: "x,y,dx,dy" groups separated by semicolons.
 * Returns the pins, or an error message for malformed or non-finite groups
 * and for more than eight pins.
 */
export function parsePuppetPinText(text: string): { pins: PuppetPinInput[] } | { error: string } {
  const pins: PuppetPinInput[] = [];
  for (const group of text.split(';')) {
    const values = group.split(',').map((value) => (value.trim() === '' ? NaN : Number(value.trim())));
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value)))
      return { error: 'Puppet Warp needs x,y,dx,dy values for each pin' };
    pins.push({ x: values[0], y: values[1], dx: values[2], dy: values[3] });
  }
  if (!pins.length || pins.length > MAX_PUPPET_PROMPT_PINS) return { error: 'Puppet Warp accepts one to eight pins' };
  return { pins };
}
