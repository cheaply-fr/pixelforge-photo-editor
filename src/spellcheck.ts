/**
 * Local spelling hints for Edit > Check Spelling (docs/spellcheck-contract.md).
 *
 * The common-English list (src/spellcheckWords.ts) is loaded lazily with
 * loadSpellingDictionary(); the small built-in set below covers the editor's
 * own vocabulary and the Paste Lorem Ipsum placeholder. Lookups accept regular
 * English inflections of a known base word, so "golden", "hours", "edited" and
 * "quickly" are not flagged. Nothing leaves the device.
 */
const BUILT_IN_WORDS = [
  'a', 'about', 'all', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'canvas',
  'color', 'content', 'document', 'edit', 'for', 'from', 'hello', 'image',
  'in', 'is', 'it', 'layer', 'local', 'new', 'of', 'on', 'or', 'pixel',
  'project', 'safe', 'select', 'text', 'the', 'this', 'to', 'tool', 'with',
  'your', 'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
  'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore',
  'et', 'dolore', 'magna', 'aliqua',
];

export type SpellingDictionary = ReadonlySet<string>;

export const BUILT_IN_SPELLING_DICTIONARY: SpellingDictionary = new Set(BUILT_IN_WORDS);

export function createSpellingDictionary(...lists: string[]): SpellingDictionary {
  const words = new Set(BUILT_IN_WORDS);
  for (const list of lists)
    for (const word of list.split(/\s+/)) if (word) words.add(word.toLocaleLowerCase().replace(/[’']/g, ''));
  return words;
}

let loading: Promise<SpellingDictionary> | undefined;

/** Load the bundled common-English list once (a separate lazy chunk). */
export function loadSpellingDictionary(): Promise<SpellingDictionary> {
  loading ??= import('./spellcheckWords.ts')
    .then(({ COMMON_ENGLISH_WORDS, IRREGULAR_ENGLISH_WORDS }) =>
      createSpellingDictionary(COMMON_ENGLISH_WORDS, IRREGULAR_ENGLISH_WORDS),
    )
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

const VOWELS = /[aeiouy]/;

/** Base-word candidates for a regular inflection (golden → gold, hours → hour). */
export function inflectionStems(word: string): string[] {
  const stems = new Set<string>();
  const add = (stem: string) => {
    if (stem.length >= 2 && VOWELS.test(stem)) stems.add(stem);
  };
  const variants = (stem: string) => {
    add(stem);
    add(`${stem}e`);
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) add(stem.slice(0, -1));
    if (stem.endsWith('i')) add(`${stem.slice(0, -1)}y`);
    if (stem.endsWith('ck')) add(stem.slice(0, -1));
  };
  const suffixes = [
    's', 'es', 'ed', 'd', 'ing', 'er', 'ers', 'est', 'ly', 'ally', 'ness', 'ment', 'ments',
    'ful', 'less', 'able', 'ible', 'en', 'ish', 'y', 'ion', 'ions', 'ation', 'ity', 'al', 'ic',
  ];
  for (const suffix of suffixes)
    if (word.length > suffix.length + 1 && word.endsWith(suffix)) variants(word.slice(0, -suffix.length));
  for (const prefix of ['un', 're', 'pre', 'non', 'over', 'under', 'out', 'mis', 'dis', 'sub', 'super', 'multi', 'auto'])
    if (word.length > prefix.length + 2 && word.startsWith(prefix)) add(word.slice(prefix.length));
  stems.delete(word);
  return [...stems];
}

/** True for a known word or a regular inflection (up to two affixes) of one. */
export function isKnownWord(word: string, dictionary: SpellingDictionary, depth = 0): boolean {
  if (dictionary.has(word)) return true;
  if (depth >= 2) return false;
  return inflectionStems(word).some((stem) => isKnownWord(stem, dictionary, depth + 1));
}

export type SpellingHint = { word: string; count: number };

export function findSpellingHints(
  text: string,
  dictionary: SpellingDictionary = BUILT_IN_SPELLING_DICTIONARY,
): SpellingHint[] {
  if (typeof text !== 'string') throw new Error('Text must be a string');
  const counts = new Map<string, number>();
  for (const match of text.matchAll(/[A-Za-z][A-Za-z'’-]{1,63}/g)) {
    const original = match[0];
    // Acronyms such as RGB or HDR are not dictionary words.
    if (original.length <= 5 && original === original.toLocaleUpperCase()) continue;
    for (const part of original.toLocaleLowerCase().replace(/[’']s$/, '').split(/[-–—]+/)) {
      const word = part.replace(/[’']/g, '');
      if (word.length < 2 || isKnownWord(word, dictionary)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([word, count]) => ({ word, count }));
}
