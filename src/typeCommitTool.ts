/**
 * Which tool follows a committed type session.
 *
 * After new or edited type is committed deliberately (the ✓ button,
 * Ctrl+Enter, or a press outside the text), the editor switches to the Move
 * tool with the type layer still selected, so a drag moves the text straight
 * away. Nothing switches when the session was cancelled, when it ended
 * because the user already chose another tool, when focus merely left the
 * editor, before another session starts, or for Type Mask tools (their commit
 * becomes a selection, not a layer).
 */
export const TYPE_COMMIT_TRIGGERS = [
  'confirm',
  'shortcut',
  'click-outside',
  'focus-out',
  'tool-switch',
  'page-hide',
  'new-session',
  'command',
] as const;
export type TypeCommitTrigger = (typeof TYPE_COMMIT_TRIGGERS)[number];

/** Triggers that express "I am done typing" and hand the text to Move. */
export const TYPE_COMMIT_SWITCH_TRIGGERS: ReadonlySet<TypeCommitTrigger> = new Set([
  'confirm',
  'shortcut',
  'click-outside',
]);

/** Horizontal and Vertical Type (not the Type Mask tools). */
const LAYER_TYPE_TOOLS: ReadonlySet<string> = new Set(['text', 'vertical-text']);

export type TypeCommitOutcome = {
  trigger: TypeCommitTrigger;
  /** The session belonged to a Type Mask tool. */
  mask: boolean;
  /** A type layer with text remains after the commit. */
  layerKept: boolean;
  /** The tool active when the commit happened. */
  tool: string;
};

/** The tool to switch to after a commit, or undefined to stay. */
export function toolAfterTypeCommit(outcome: TypeCommitOutcome): 'move' | undefined {
  if (!TYPE_COMMIT_SWITCH_TRIGGERS.has(outcome.trigger)) return undefined;
  if (outcome.mask || !outcome.layerKept) return undefined;
  if (!LAYER_TYPE_TOOLS.has(outcome.tool)) return undefined;
  return 'move';
}
