/**
 * What the Text sidebar's top Font picker and Size slider show and edit.
 *
 * With no type layer selected they set the defaults for new type. While a
 * type edit is open or a text layer is selected they show and change that
 * type (like the Character panel below), so the two never disagree.
 */
export type TextSidebarSource = 'session' | 'layer' | 'defaults';

export type TextSidebarFields = {
  /** 'type' edits the session or active layer; 'defaults' edits new type. */
  target: 'type' | 'defaults';
  /** '' when the selected characters use several fonts. */
  fontFamily: string;
  fontSize: number;
  sizeMin: number;
  sizeMax: number;
  /** True when the selected characters use several sizes. */
  sizeMixed: boolean;
};

export const NEW_TYPE_SIZE_MIN = 16;
export const NEW_TYPE_SIZE_MAX = 160;

export function textSidebarFields(
  source: TextSidebarSource,
  // Values may be 'mixed' when the selected characters differ.
  character: { fontFamily?: string; fontSize?: number | 'mixed' },
  defaults: { fontFamily: string; fontSize: number },
): TextSidebarFields {
  if (source === 'defaults') {
    return {
      target: 'defaults',
      fontFamily: defaults.fontFamily,
      fontSize: defaults.fontSize,
      sizeMin: NEW_TYPE_SIZE_MIN,
      sizeMax: NEW_TYPE_SIZE_MAX,
      sizeMixed: false,
    };
  }
  const family = character.fontFamily;
  const size = character.fontSize;
  const sizeMixed = typeof size !== 'number' || !Number.isFinite(size);
  const fontSize = sizeMixed ? defaults.fontSize : Math.round(size);
  return {
    target: 'type',
    fontFamily: typeof family === 'string' && family !== 'mixed' ? family : '',
    fontSize,
    sizeMin: 1,
    sizeMax: Math.max(NEW_TYPE_SIZE_MAX, fontSize),
    sizeMixed,
  };
}
