import { lazy, Suspense, useState, type CSSProperties } from 'react';
import { FONT_CATEGORIES, FONT_CATEGORY_LABELS, FONT_LIBRARY, SYSTEM_FONTS, fontFamilyKind } from './fontLibrary';
import { sharedFontLoader } from './fontLoader';

const FontPicker = lazy(() => import('./FontPicker'));

const GROUPS = FONT_CATEGORIES.map((category) => ({
  category,
  families: FONT_LIBRARY.filter((font) => font.category === category).map((font) => font.family),
})).filter((group) => group.families.length);

/**
 * Compact family chooser: a native select (every system and library family,
 * grouped by category; keyboard/touch friendly and screen-reader native) plus
 * a "Browse" button opening the searchable FontPicker with previews.
 * Unknown families from imported documents stay selected and are disclosed.
 */
export default function FontFamilySelect({
  value,
  onChange,
  label,
  className = 'text-input',
  optionStyle,
  disabled = false,
}: {
  value: string;
  onChange: (family: string) => void;
  label: string;
  className?: string;
  optionStyle?: (family: string) => CSSProperties | undefined;
  disabled?: boolean;
}) {
  const [browsing, setBrowsing] = useState(false);
  const unknown = fontFamilyKind(value) === 'unknown';
  const choose = (family: string) => {
    if (fontFamilyKind(family) === 'library') void sharedFontLoader().ensure(family, { priority: 'high' });
    onChange(family);
  };
  return (
    <span className="font-family-select">
      <select aria-label={label} className={className || undefined} value={value} disabled={disabled} onChange={(event) => choose(event.target.value)}>
        {unknown && (
          <option value={value}>
            {value} (missing)
          </option>
        )}
        <optgroup label="System">
          {SYSTEM_FONTS.map((family) => (
            <option key={family} value={family} style={optionStyle?.(family)}>
              {family}
            </option>
          ))}
        </optgroup>
        {GROUPS.map((group) => (
          <optgroup key={group.category} label={FONT_CATEGORY_LABELS[group.category]}>
            {group.families.map((family) => (
              <option key={family} value={family}>
                {family}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <button type="button" className="font-browse-button" aria-label={`Browse fonts for ${label}`} title="Browse fonts" disabled={disabled} onClick={() => setBrowsing(true)}>
        Aa
      </button>
      {browsing && (
        <Suspense fallback={null}>
          <FontPicker value={value} onChange={choose} close={() => setBrowsing(false)} title={`${label}`} />
        </Suspense>
      )}
    </span>
  );
}
