export const tableCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const normalizeSearch = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const compact = (value: string) => normalizeSearch(value).replace(/[^a-z0-9]/g, '');
export function searchTerms(query: string): string[] {
  // Keep references (including pasted filenames) together. A space in “RS 418806”
  // is equivalent to the hyphen in “RS-418806”. Ordinary words remain separate.
  const value = normalizeSearch(query).replace(/\b([a-z]{1,4})\s+(?=\d)/g, '$1-');
  return (value.match(/[a-z0-9]+(?:[-_./]+[a-z0-9]+)*/g) || [])
    .flatMap(term => /\d/.test(term) ? [compact(term)] : term.match(/[a-z]+/g) || []);
}

function searchIndex(text: string) {
  let value = '', offset = 0;
  const starts: number[] = [], ends: number[] = [];
  // Keep offsets in the original text so accent folding cannot shift a mark.
  for (const character of text) {
    const folded = compact(character);
    for (const letter of folded) {
      value += letter; starts.push(offset); ends.push(offset + character.length);
    }
    if (!folded && /\p{M}/u.test(character) && ends.length) ends[ends.length - 1] = offset + character.length;
    offset += character.length;
  }
  const boundaries: Array<{ value: string; offset: number }> = [];
  let compactOffset = 0;
  for (const part of normalizeSearch(text).matchAll(/[a-z]+|[0-9]+/g)) {
    boundaries.push({ value: part[0], offset: compactOffset });
    compactOffset += part[0].length;
  }
  return { value, starts, ends, boundaries };
}

function matchRanges(index: ReturnType<typeof searchIndex>, terms: string[]) {
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    const identifier = /\d/.test(term);
    for (const boundary of index.boundaries) {
      // Words match from their start. Identifiers also ignore separators within
      // this field, so RS418806 matches RS-418806 without matching “rs” in Halvorsen.
      if (identifier ? index.value.startsWith(term, boundary.offset) : boundary.value.startsWith(term)) {
        ranges.push([index.starts[boundary.offset], index.ends[boundary.offset + term.length - 1]]);
      }
    }
  }
  return ranges;
}

export function matchesSearch(fields: string[], terms: string[]) {
  if (!terms.length) return true;
  const indices = fields.map(searchIndex);
  return terms.every(term => indices.some(index => matchRanges(index, [term]).length > 0));
}

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const ranges = matchRanges(searchIndex(text), terms);
  if (!ranges.length) return <>{text}</>;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  let cursor = 0;
  return <>{merged.map(([start, end]) => { const before = text.slice(cursor, start); cursor = end; return <span key={start}>{before}<mark>{text.slice(start, end)}</mark></span>; })}{text.slice(cursor)}</>;
}
