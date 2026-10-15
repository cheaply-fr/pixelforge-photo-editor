const DICTIONARY = new Set([
  'a', 'about', 'all', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'canvas',
  'color', 'content', 'document', 'edit', 'for', 'from', 'hello', 'image',
  'in', 'is', 'it', 'layer', 'local', 'new', 'of', 'on', 'or', 'pixel',
  'project', 'safe', 'select', 'text', 'the', 'this', 'to', 'tool', 'with',
  'your', 'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
  'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore',
  'et', 'dolore', 'magna', 'aliqua',
]);

export type SpellingHint = { word: string; count: number };

export function findSpellingHints(text: string): SpellingHint[] {
  if (typeof text !== 'string') throw new Error('Text must be a string');
  const counts = new Map<string, number>();
  for (const token of text.toLocaleLowerCase().match(/[a-z][a-z'’-]{1,63}/g) ?? []) {
    const word = token.replace(/[’']/g, '').replace(/[-–—]/g, '');
    if (!word || DICTIONARY.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([word, count]) => ({ word, count }));
}
