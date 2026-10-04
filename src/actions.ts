/**
 * Local, deterministic action recipes.
 *
 * An action stores command identifiers and the small set of explicit
 * parameters that a command needs.  It never stores pixels, object URLs or
 * credentials, so recording remains safe for anonymous editing and can be
 * persisted in localStorage without turning a recipe into a second project
 * file.  Commands are replayed by the editor, which remains the authority for
 * document validation, undo history and locked-layer guards.
 */

export const ACTIONS_VERSION = 1 as const;
export const MAX_ACTION_SETS = 32;
export const MAX_ACTION_STEPS = 64;
export const MAX_ACTION_NAME = 120;
export const MAX_ACTION_LABEL = 160;
export const MAX_ACTION_COMMAND = 80;
export const MAX_ACTION_FILE_BYTES = 256 * 1024;

export type ActionParameter = string | number | boolean | null;

export type ActionStep = {
  id: string;
  command: string;
  label: string;
  parameters?: Record<string, ActionParameter>;
};

export type ActionSet = {
  version: typeof ACTIONS_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  steps: ActionStep[];
};

export type ActionReplayFailure = {
  index: number;
  step: ActionStep;
  error: string;
};

export type ActionReplayResult = {
  completed: number;
  failure?: ActionReplayFailure;
};

export const REPLAYABLE_ACTION_COMMANDS = new Set([
  'reset',
  'auto-tone',
  'auto-contrast',
  'auto-color',
  'filter-original',
  'filter-vivid',
  'filter-mono',
  'filter-warm',
  'filter-cool',
  'filter-box-blur',
  'filter-gaussian-blur',
  'filter-motion-blur',
  'filter-radial-blur',
  'filter-field-blur',
  'filter-tilt-shift',
  'filter-mosaic',
  'filter-color-halftone',
  'filter-ripple',
  'filter-twirl',
  'filter-clear-effect',
  'rotate-left',
  'rotate-right',
  'flip-h',
  'flip-v',
  'select-all',
  'deselect',
  'invert-selection',
  'invert-layer-mask',
  'toggle-layer-mask',
  'remove-layer-mask',
  'merge-visible',
  'flatten',
]);

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

const safeText = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  !Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

const safeId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 160 &&
  /^[A-Za-z0-9_-]+$/.test(value);

const safeDate = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 64 && !Number.isNaN(Date.parse(value));

const validParameter = (value: unknown): value is ActionParameter =>
  value === null ||
  (typeof value === 'string' && value.length <= 1024) ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  typeof value === 'boolean';

function utf8Bytes(value: string): number {
  return typeof TextEncoder === 'function'
    ? new TextEncoder().encode(value).byteLength
    : value.length;
}

function fallbackId(prefix: string): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function')
    return `${prefix}-${cryptoObject.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function actionId(): string {
  return fallbackId('action');
}

export function actionStepId(): string {
  return fallbackId('step');
}

export function normalizeActionName(name: string): string {
  const trimmed = Array.from(name, (character) =>
    character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
      ? ' '
      : character,
  )
    .join('')
    .trim()
    .replace(/\s+/g, ' ');
  if (!trimmed) return 'Untitled action';
  return trimmed.slice(0, MAX_ACTION_NAME);
}

export function createActionSet(name: string, id = actionId(), now = new Date()): ActionSet {
  const timestamp = now.toISOString();
  const action: ActionSet = {
    version: ACTIONS_VERSION,
    id,
    name: normalizeActionName(name),
    createdAt: timestamp,
    updatedAt: timestamp,
    steps: [],
  };
  if (!validActionSet(action)) throw new TypeError('Invalid action set');
  return action;
}

export function validActionStep(value: unknown): value is ActionStep {
  if (!record(value)) return false;
  if (
    !exactKeys(value, ['id', 'command', 'label', 'parameters']) ||
    !safeId(value.id) ||
    !safeText(value.command, MAX_ACTION_COMMAND) ||
    !REPLAYABLE_ACTION_COMMANDS.has(value.command) ||
    !safeText(value.label, MAX_ACTION_LABEL)
  )
    return false;
  if (value.parameters === undefined) return true;
  if (!record(value.parameters)) return false;
  return Object.keys(value.parameters).length <= 16 && Object.entries(value.parameters).every(
    ([key, parameter]) =>
      /^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(key) && validParameter(parameter),
  );
}

export function validActionSet(value: unknown): value is ActionSet {
  if (!record(value)) return false;
  return (
    exactKeys(value, ['version', 'id', 'name', 'createdAt', 'updatedAt', 'steps']) &&
    value.version === ACTIONS_VERSION &&
    safeId(value.id) &&
    safeText(value.name, MAX_ACTION_NAME) &&
    safeDate(value.createdAt) &&
    safeDate(value.updatedAt) &&
    Array.isArray(value.steps) &&
    value.steps.length <= MAX_ACTION_STEPS &&
    value.steps.every(validActionStep) &&
    new Set(value.steps.map((step) => step.id)).size === value.steps.length
  );
}

export function validActionSets(value: unknown): value is ActionSet[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ACTION_SETS &&
    value.every(validActionSet) &&
    new Set(value.map((action) => action.id)).size === value.length
  );
}

export function appendActionStep(
  action: ActionSet,
  command: string,
  label: string,
  parameters?: Record<string, ActionParameter>,
  id = actionStepId(),
  now = new Date(),
): ActionSet {
  if (!validActionSet(action)) throw new TypeError('Invalid action set');
  if (!REPLAYABLE_ACTION_COMMANDS.has(command))
    throw new RangeError('This command cannot be recorded as an action');
  if (action.steps.length >= MAX_ACTION_STEPS)
    throw new RangeError(`An action can contain at most ${MAX_ACTION_STEPS} steps`);
  const step: ActionStep = {
    id,
    command,
    label: normalizeActionName(label).slice(0, MAX_ACTION_LABEL),
    ...(parameters ? { parameters } : {}),
  };
  if (!validActionStep(step)) throw new TypeError('Invalid action step');
  return { ...action, steps: [...action.steps, step], updatedAt: now.toISOString() };
}

export function removeActionStep(action: ActionSet, index: number, now = new Date()): ActionSet {
  if (!validActionSet(action)) throw new TypeError('Invalid action set');
  if (!Number.isInteger(index) || index < 0 || index >= action.steps.length)
    return action;
  return {
    ...action,
    steps: action.steps.filter((_, stepIndex) => stepIndex !== index),
    updatedAt: now.toISOString(),
  };
}

export function renameAction(action: ActionSet, name: string, now = new Date()): ActionSet {
  if (!validActionSet(action)) throw new TypeError('Invalid action set');
  return { ...action, name: normalizeActionName(name), updatedAt: now.toISOString() };
}

export function serializeActionSets(actions: ActionSet[]): string {
  if (!validActionSets(actions)) throw new TypeError('Invalid action sets');
  const serialized = JSON.stringify({ version: ACTIONS_VERSION, actions });
  if (utf8Bytes(serialized) > MAX_ACTION_FILE_BYTES)
    throw new RangeError('Action recipe file exceeds the 256 KB safety limit');
  return serialized;
}

export function parseActionSets(value: string): ActionSet[] {
  if (typeof value !== 'string' || utf8Bytes(value) > MAX_ACTION_FILE_BYTES)
    throw new TypeError('Action recipe file exceeds the 256 KB safety limit');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError('Action recipe file is not valid JSON');
  }
  if (!record(parsed) || !exactKeys(parsed, ['version', 'actions']) || parsed.version !== ACTIONS_VERSION || !validActionSets(parsed.actions))
    throw new TypeError('Action recipe file is invalid or unsupported');
  return parsed.actions;
}

export async function replayActionSet(
  action: ActionSet,
  execute: (step: ActionStep) => void | Promise<void>,
  signal?: AbortSignal,
): Promise<ActionReplayResult> {
  if (!validActionSet(action)) throw new TypeError('Invalid action set');
  let completed = 0;
  for (let index = 0; index < action.steps.length; index += 1) {
    if (signal?.aborted) {
      return {
        completed,
        failure: { index, step: action.steps[index], error: 'Action replay cancelled' },
      };
    }
    const step = action.steps[index];
    try {
      await execute(step);
      completed += 1;
    } catch (error) {
      return {
        completed,
        failure: {
          index,
          step,
          error: error instanceof Error && error.message ? error.message.slice(0, 240) : 'Action step failed',
        },
      };
    }
  }
  return { completed };
}
