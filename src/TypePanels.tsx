/**
 * Type tool options bar plus Character and Paragraph panels.
 *
 * Every control edits the current text selection while editing, the whole
 * active type layer otherwise, or the defaults for new type when no type
 * layer is active. Font choice is a plain family list (`fonts`) so a font
 * library can supply more families without changing this component.
 */
import { useState, type ReactNode } from 'react';
import {
  TextAlignCenter as AlignCenter,
  TextAlignJustify as AlignJustify,
  TextAlignStart as AlignLeft,
  TextAlignEnd as AlignRight,
  Check,
  List,
  ListOrdered,
  Pilcrow,
  Type,
  X,
} from 'lucide-react';
import type { CharacterStyle, ParagraphSettings, RunStyle, TextAntiAlias, TextFit, TextJustify, TextList } from './richText.ts';
import type { TypePreset } from './typePresets.ts';

export type CharacterView = { [K in keyof CharacterStyle]: CharacterStyle[K] | 'mixed' };
export type RunStylePatch = { [K in keyof RunStyle]?: RunStyle[K] | undefined };

export type TypeView = {
  source: 'session' | 'layer' | 'defaults';
  character: CharacterView;
  textAlign: 'left' | 'center' | 'right';
  antiAlias: TextAntiAlias;
  textMode?: 'point' | 'paragraph';
  orientation: 'horizontal' | 'vertical';
  paragraph: ParagraphSettings;
  fit: TextFit;
  direction: 'auto' | 'ltr' | 'rtl';
  locked: boolean;
  editing: boolean;
  mask: boolean;
};

export type TypeActions = {
  character: (patch: RunStylePatch) => void;
  layer: (patch: { textAlign?: 'left' | 'center' | 'right'; antiAlias?: TextAntiAlias; fit?: TextFit }) => void;
  paragraph: (patch: Partial<ParagraphSettings>) => void;
  direction: (direction: 'auto' | 'ltr' | 'rtl') => void;
  orientation: (orientation: 'horizontal' | 'vertical') => void;
  convert: (mode: 'point' | 'paragraph') => void;
  warp: () => void;
  commit: () => void;
  cancel: () => void;
  findReplace: () => void;
  spellcheck: () => void;
  insert: (text: string) => void;
  openGlyphs: () => boolean;
  presets: readonly TypePreset[];
  savePreset: (name: string) => void;
  applyPreset: (preset: TypePreset) => void;
  deletePreset: (name: string) => void;
};

const ANTI_ALIAS: { value: TextAntiAlias; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'sharp', label: 'Sharp' },
  { value: 'crisp', label: 'Crisp' },
  { value: 'strong', label: 'Strong' },
  { value: 'smooth', label: 'Smooth' },
];
const SPECIAL_CHARACTERS = ['©', '®', '™', '—', '–', '…', '•', '°', '€', '£', '¥', '¶', '§', '«', '»', '“', '”', '‘', '’', '→', '←', '★', '✓', '×', '÷', '±', '½', 'µ', 'π', 'Ω'];

const refocusEditor = (view: TypeView) => {
  if (!view.editing) return;
  // Let the change render first, then return typing to the canvas editor.
  window.setTimeout(() => document.querySelector<HTMLTextAreaElement>('.type-editor-input')?.focus({ preventScroll: true }), 0);
};

/** While editing, pressing a panel button keeps keyboard focus in the type. */
const keepEditorFocus = (view: TypeView) => (event: React.PointerEvent<HTMLElement>) => {
  if (view.editing && (event.target as Element).closest('button, summary')) event.preventDefault();
};

const styleValue = (character: CharacterView) => {
  const weight = character.fontWeight, italic = character.italic;
  if (weight === 'mixed' || italic === 'mixed') return 'mixed';
  return `${weight >= 600 ? 'bold' : 'regular'}${italic ? '-italic' : ''}`;
};
const styleFromValue = (value: string): RunStylePatch => ({
  fontWeight: value.startsWith('bold') ? 700 : 400,
  italic: value.endsWith('italic'),
});

/** Number field that applies on Enter, blur or spinner step (not every keystroke). */
function NumberField({
  label, value, min, max, step = 1, suffix, onApply, disabled,
}: {
  label: string; value: number | 'mixed'; min: number; max: number; step?: number; suffix?: string;
  onApply: (value: number) => void; disabled?: boolean;
}) {
  const shown = value === 'mixed' ? '' : String(Number(value.toFixed(3)));
  const apply = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed)) return;
    const bounded = Math.min(max, Math.max(min, parsed));
    if (bounded !== value) onApply(bounded);
  };
  return (
    <label className="type-field">
      <span>{label}</span>
      <input
        // Remount when the applied value changes so the field shows it.
        key={shown}
        type="number"
        aria-label={label}
        defaultValue={shown}
        placeholder={value === 'mixed' ? '—' : undefined}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => {
          // Spinner steps and arrow keys have no inputType; apply them live.
          const native = event.nativeEvent as InputEvent;
          if (!native.inputType) apply(event.target.value);
        }}
        onBlur={(event) => apply(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            apply(event.currentTarget.value);
          }
        }}
      />
      {suffix && <small>{suffix}</small>}
    </label>
  );
}

function Toggle({ label, pressed, onChange, children, disabled }: { label: string; pressed: boolean | 'mixed'; onChange: (next: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`type-toggle${pressed === true ? ' is-on' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed === 'mixed' ? 'mixed' : pressed}
      disabled={disabled}
      onClick={() => onChange(pressed !== true)}
    >
      {children}
    </button>
  );
}

function FontFamilySelect({ fonts, value, onChange, label, disabled }: { fonts: readonly string[]; value: string; onChange: (family: string) => void; label: string; disabled?: boolean }) {
  const options = value !== 'mixed' && !fonts.includes(value) ? [value, ...fonts] : fonts;
  return (
    <select aria-label={label} value={value === 'mixed' ? '' : value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {value === 'mixed' && <option value="">Mixed</option>}
      {options.map((font) => <option key={font} value={font} style={{ fontFamily: `"${font}"` }}>{font}</option>)}
    </select>
  );
}

export function TypeOptionsBar({
  view, actions, fonts, onTogglePanel, panelOpen,
}: {
  view: TypeView;
  actions: TypeActions;
  fonts: readonly string[];
  onTogglePanel: (panel: 'character' | 'paragraph') => void;
  panelOpen: { character: boolean; paragraph: boolean };
}) {
  const disabled = view.locked;
  const character = view.character;
  return (
    <div className="type-options-bar" role="toolbar" aria-label="Type options" data-type-keep="" data-testid="type-options-bar" onPointerDown={keepEditorFocus(view)} data-source={view.source}>
      <Type size={14} aria-hidden="true" />
      <FontFamilySelect label="Type font family" fonts={fonts} value={character.fontFamily} disabled={disabled} onChange={(fontFamily) => { actions.character({ fontFamily }); refocusEditor(view); }} />
      <select aria-label="Type font style" value={styleValue(character)} disabled={disabled} onChange={(event) => { actions.character(styleFromValue(event.target.value)); refocusEditor(view); }}>
        {styleValue(character) === 'mixed' && <option value="mixed">Mixed</option>}
        <option value="regular">Regular</option>
        <option value="regular-italic">Italic</option>
        <option value="bold">Bold</option>
        <option value="bold-italic">Bold Italic</option>
      </select>
      <NumberField label="Type font size" value={character.fontSize} min={1} max={1000} suffix="px" disabled={disabled} onApply={(fontSize) => actions.character({ fontSize })} />
      <select aria-label="Anti-aliasing" title="Anti-aliasing" value={view.antiAlias} disabled={disabled} onChange={(event) => { actions.layer({ antiAlias: event.target.value as TextAntiAlias }); refocusEditor(view); }}>
        {ANTI_ALIAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <fieldset className="type-segment" aria-label="Type alignment">
        {(['left', 'center', 'right'] as const).map((align) => (
          <Toggle key={align} label={`Align ${align}`} pressed={view.textAlign === align && view.paragraph.justify === 'none'} disabled={disabled} onChange={() => { actions.paragraph({ justify: 'none' }); actions.layer({ textAlign: align }); refocusEditor(view); }}>
            {align === 'left' ? <AlignLeft size={14} /> : align === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
          </Toggle>
        ))}
      </fieldset>
      <input type="color" aria-label="Type colour" title="Text colour" value={character.color === 'mixed' ? '#000000' : character.color} disabled={disabled} onChange={(event) => actions.character({ color: event.target.value })} />
      <button type="button" className="type-text-button" onClick={actions.warp} disabled={disabled || view.source === 'defaults'} title="Warp text">Warp</button>
      <Toggle label="Character panel" pressed={panelOpen.character} onChange={() => onTogglePanel('character')}><Type size={14} /></Toggle>
      <Toggle label="Paragraph panel" pressed={panelOpen.paragraph} onChange={() => onTogglePanel('paragraph')}><Pilcrow size={14} /></Toggle>
      {view.editing && (
        <span className="type-commit-group">
          <button type="button" className="type-icon-button" aria-label="Cancel type editing" title="Cancel (Escape)" onPointerDown={(event) => event.preventDefault()} onClick={actions.cancel}><X size={15} /></button>
          <button type="button" className="type-icon-button is-primary" aria-label="Commit type" title="Commit (Ctrl+Enter)" onPointerDown={(event) => event.preventDefault()} onClick={actions.commit}><Check size={15} /></button>
        </span>
      )}
    </div>
  );
}

export function TypePanels({
  view, actions, fonts, open, onOpenChange,
}: {
  view: TypeView;
  actions: TypeActions;
  fonts: readonly string[];
  open: { character: boolean; paragraph: boolean };
  onOpenChange: (panel: 'character' | 'paragraph', open: boolean) => void;
}) {
  const [presetName, setPresetName] = useState('');
  const [glyphsOpen, setGlyphsOpen] = useState(false);
  const disabled = view.locked;
  const c = view.character;
  const p = view.paragraph;
  const target = view.source === 'session' ? 'selected characters' : view.source === 'layer' ? 'the active type layer' : 'new type';
  const toggle = (label: string, pressed: boolean | 'mixed', patch: (next: boolean) => RunStylePatch, glyph: ReactNode) => (
    <Toggle label={label} pressed={pressed} disabled={disabled} onChange={(next) => { actions.character(patch(next)); refocusEditor(view); }}>{glyph}</Toggle>
  );
  const isOn = (value: unknown, on: unknown) => (value === 'mixed' ? 'mixed' : value === on);
  return (
    <div className="type-panels" data-type-keep="" data-testid="type-panels" onPointerDown={keepEditorFocus(view)}>
      <p className="adjust-note type-target" data-testid="type-panels-target">Editing {target}.</p>
      <details className="type-panel" open={open.character} onToggle={(event) => onOpenChange('character', event.currentTarget.open)}>
        <summary>Character</summary>
        <div className="type-grid">
          <div className="type-field type-wide"><span>Font</span>
            <FontFamilySelect label="Character font family" fonts={fonts} value={c.fontFamily} disabled={disabled} onChange={(fontFamily) => { actions.character({ fontFamily }); refocusEditor(view); }} />
          </div>
          <label className="type-field type-wide"><span>Style</span>
            <select aria-label="Character font style" value={styleValue(c)} disabled={disabled} onChange={(event) => { actions.character(styleFromValue(event.target.value)); refocusEditor(view); }}>
              {styleValue(c) === 'mixed' && <option value="mixed">Mixed</option>}
              <option value="regular">Regular</option>
              <option value="regular-italic">Italic</option>
              <option value="bold">Bold</option>
              <option value="bold-italic">Bold Italic</option>
            </select>
          </label>
          <NumberField label="Font size" value={c.fontSize} min={1} max={1000} suffix="px" disabled={disabled} onApply={(fontSize) => actions.character({ fontSize })} />
          <NumberField label="Leading" value={c.leading} min={0.5} max={4} step={0.05} suffix="×" disabled={disabled} onApply={(leading) => actions.character({ leading })} />
          <NumberField label="Tracking" value={c.tracking} min={-1000} max={2000} step={10} suffix="‰ em" disabled={disabled} onApply={(tracking) => actions.character({ tracking })} />
          <label className="type-field"><span>Kerning</span>
            <select aria-label="Kerning" value={c.kerning === 'mixed' ? '' : c.kerning} disabled={disabled} onChange={(event) => { actions.character({ kerning: event.target.value as CharacterStyle['kerning'] }); refocusEditor(view); }}>
              {c.kerning === 'mixed' && <option value="">Mixed</option>}
              <option value="auto">Auto</option>
              <option value="metrics">Metrics</option>
              <option value="none">None (0)</option>
            </select>
          </label>
          <NumberField label="Vertical scale" value={c.scaleY} min={10} max={1000} suffix="%" disabled={disabled} onApply={(scaleY) => actions.character({ scaleY })} />
          <NumberField label="Horizontal scale" value={c.scaleX} min={10} max={1000} suffix="%" disabled={disabled} onApply={(scaleX) => actions.character({ scaleX })} />
          <NumberField label="Baseline shift" value={c.baselineShift} min={-1000} max={1000} suffix="px" disabled={disabled} onApply={(baselineShift) => actions.character({ baselineShift })} />
          <label className="type-field"><span>Colour</span>
            <input type="color" aria-label="Character colour" value={c.color === 'mixed' ? '#000000' : c.color} disabled={disabled} onChange={(event) => actions.character({ color: event.target.value })} />
          </label>
        </div>
        <fieldset className="type-toggles" aria-label="Character attributes">
          {toggle('Faux bold', c.fontWeight === 'mixed' ? 'mixed' : c.fontWeight >= 600, (next) => ({ fontWeight: next ? 700 : 400 }), <b>B</b>)}
          {toggle('Italic', isOn(c.italic, true), (next) => ({ italic: next }), <i>I</i>)}
          {toggle('All caps', isOn(c.caps, 'all-caps'), (next) => ({ caps: next ? 'all-caps' : 'normal' }), <span>TT</span>)}
          {toggle('Small caps', isOn(c.caps, 'small-caps'), (next) => ({ caps: next ? 'small-caps' : 'normal' }), <span className="type-small-caps">Tt</span>)}
          {toggle('Superscript', isOn(c.script, 'superscript'), (next) => ({ script: next ? 'superscript' : 'normal' }), <span>T¹</span>)}
          {toggle('Subscript', isOn(c.script, 'subscript'), (next) => ({ script: next ? 'subscript' : 'normal' }), <span>T₁</span>)}
          {toggle('Underline', isOn(c.underline, true), (next) => ({ underline: next }), <u>U</u>)}
          {toggle('Strikethrough', isOn(c.strikethrough, true), (next) => ({ strikethrough: next }), <s>S</s>)}
        </fieldset>
        <div className="type-actions">
          <button type="button" disabled={disabled || view.source === 'defaults'} onClick={() => { actions.character({ italic: undefined, underline: undefined, strikethrough: undefined, tracking: undefined, baselineShift: undefined, script: undefined, caps: undefined, scaleX: undefined, scaleY: undefined, leading: undefined, kerning: undefined }); refocusEditor(view); }}>Reset character</button>
          <button type="button" disabled={!view.editing} onClick={() => { if (!actions.openGlyphs()) setGlyphsOpen((value) => !value); }}>Glyphs…</button>
        </div>
        {glyphsOpen && view.editing && (
          <fieldset className="type-glyphs" aria-label="Special characters">
            {SPECIAL_CHARACTERS.map((glyph) => (
              <button key={glyph} type="button" aria-label={`Insert ${glyph}`} onPointerDown={(event) => event.preventDefault()} onClick={() => actions.insert(glyph)}>{glyph}</button>
            ))}
          </fieldset>
        )}
      </details>
      <details className="type-panel" open={open.paragraph} onToggle={(event) => onOpenChange('paragraph', event.currentTarget.open)}>
        <summary>Paragraph</summary>
        <fieldset className="type-segment" aria-label="Paragraph alignment">
          {(['left', 'center', 'right'] as const).map((align) => (
            <Toggle key={align} label={`Paragraph align ${align}`} pressed={view.textAlign === align && p.justify === 'none'} disabled={disabled} onChange={() => { actions.paragraph({ justify: 'none' }); actions.layer({ textAlign: align }); refocusEditor(view); }}>
              {align === 'left' ? <AlignLeft size={14} /> : align === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
            </Toggle>
          ))}
          {(['left', 'center', 'right', 'all'] as const).map((justify) => (
            <Toggle key={justify} label={`Justify last ${justify}`} pressed={p.justify === justify} disabled={disabled} onChange={() => { actions.paragraph({ justify: justify as TextJustify }); refocusEditor(view); }}>
              <AlignJustify size={14} /><small>{justify === 'all' ? 'A' : justify[0].toUpperCase()}</small>
            </Toggle>
          ))}
        </fieldset>
        <div className="type-grid">
          <NumberField label="Indent left" value={p.indentLeft} min={-2000} max={2000} suffix="px" disabled={disabled} onApply={(indentLeft) => actions.paragraph({ indentLeft })} />
          <NumberField label="Indent right" value={p.indentRight} min={-2000} max={2000} suffix="px" disabled={disabled} onApply={(indentRight) => actions.paragraph({ indentRight })} />
          <NumberField label="First line indent" value={p.indentFirst} min={-2000} max={2000} suffix="px" disabled={disabled} onApply={(indentFirst) => actions.paragraph({ indentFirst })} />
          <NumberField label="Space before" value={p.spaceBefore} min={0} max={2000} suffix="px" disabled={disabled} onApply={(spaceBefore) => actions.paragraph({ spaceBefore })} />
          <NumberField label="Space after" value={p.spaceAfter} min={0} max={2000} suffix="px" disabled={disabled} onApply={(spaceAfter) => actions.paragraph({ spaceAfter })} />
          <label className="type-field"><span>Direction</span>
            <select aria-label="Paragraph direction" value={view.direction} disabled={disabled || view.source === 'defaults'} onChange={(event) => { actions.direction(event.target.value as TypeView['direction']); refocusEditor(view); }}>
              <option value="auto">Auto (language)</option>
              <option value="ltr">Left to right</option>
              <option value="rtl">Right to left</option>
            </select>
          </label>
          <label className="type-field"><span>Dynamic fit</span>
            <select aria-label="Dynamic text fit" value={view.fit} disabled={disabled || view.textMode !== 'paragraph'} onChange={(event) => { actions.layer({ fit: event.target.value as TextFit }); refocusEditor(view); }}>
              <option value="none">Off</option>
              <option value="shrink">Shrink to box</option>
              <option value="fit">Fit box</option>
            </select>
          </label>
          <label className="type-field"><span>Anti-alias</span>
            <select aria-label="Paragraph anti-aliasing" value={view.antiAlias} disabled={disabled} onChange={(event) => { actions.layer({ antiAlias: event.target.value as TextAntiAlias }); refocusEditor(view); }}>
              {ANTI_ALIAS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <fieldset className="type-segment" aria-label="Lists">
          {(['none', 'bullet', 'number'] as const).map((list) => (
            <Toggle key={list} label={list === 'none' ? 'No list' : list === 'bullet' ? 'Bulleted list' : 'Numbered list'} pressed={p.list === list} disabled={disabled} onChange={() => { actions.paragraph({ list: list as TextList }); refocusEditor(view); }}>
              {list === 'none' ? <span>¶</span> : list === 'bullet' ? <List size={14} /> : <ListOrdered size={14} />}
            </Toggle>
          ))}
        </fieldset>
        <div className="type-actions">
          <button type="button" disabled={disabled || view.source === 'defaults' || view.textMode === 'point'} onClick={() => actions.convert('point')}>Convert to Point Text</button>
          <button type="button" disabled={disabled || view.source === 'defaults' || view.textMode === 'paragraph' || view.orientation === 'vertical'} onClick={() => actions.convert('paragraph')}>Convert to Paragraph Text</button>
          <button type="button" disabled={disabled || view.source === 'defaults'} onClick={() => actions.orientation(view.orientation === 'vertical' ? 'horizontal' : 'vertical')}>
            {view.orientation === 'vertical' ? 'Make horizontal' : 'Make vertical'}
          </button>
          <button type="button" onClick={actions.findReplace}>Find &amp; Replace…</button>
          <button type="button" onClick={actions.spellcheck}>Check spelling…</button>
        </div>
      </details>
      <details className="type-panel">
        <summary>Type presets</summary>
        <div className="type-preset-save">
          <input aria-label="Type preset name" placeholder="Preset name" maxLength={40} value={presetName} onChange={(event) => setPresetName(event.target.value)} />
          <button type="button" disabled={!presetName.trim()} onClick={() => { actions.savePreset(presetName); setPresetName(''); }}>Save</button>
        </div>
        {actions.presets.length === 0 ? <p className="adjust-note">No presets saved on this device.</p> : (
          <ul className="type-preset-list">
            {actions.presets.map((preset) => (
              <li key={preset.name}>
                <button type="button" disabled={disabled} aria-label={`Apply type preset ${preset.name}`} onClick={() => { actions.applyPreset(preset); refocusEditor(view); }}>{preset.name}</button>
                <button type="button" aria-label={`Delete type preset ${preset.name}`} onClick={() => actions.deletePreset(preset.name)}><X size={12} /></button>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
