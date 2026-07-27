import type { MaterialQuery, MaterialQueryInput } from './types.js';

const htmlEntities: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' '
};

export function cleanHtml(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<br\s*\/?>/gi, '; ')
    .replace(/<\/?(?:highlight|searchlink|relatesto|superscript|i|b|em|strong)(?:\s[^>]*)?>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
      if (entity[0] === '#') {
        const hex = entity[1]?.toLowerCase() === 'x';
        const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : '';
      }
      return htmlEntities[entity.toLowerCase()] ?? `&${entity};`;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeText(value: unknown): string {
  return cleanHtml(value)
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeIdentifier(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.normalize('NFKC').toUpperCase().replace(/[^0-9X]/g, '') || undefined;
}

export function normalizeDoi(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const normalized = decodeURIComponent(value.trim())
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/^doi\s*:\s*/i, '')
    .trim()
    .toLowerCase();
  return normalized || undefined;
}

export function extractYear(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string') return undefined;
  const match = value.match(/(?:^|\D)((?:1[5-9]|20|21)\d{2})(?:\D|$)/);
  return match?.[1] ? Number(match[1]) : undefined;
}

export function splitAuthors(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(splitAuthors).filter(Boolean);
  if (typeof value !== 'string') return [];
  return cleanHtml(value).split(/\s*(?:;|\||\band\b|\s\/\s)\s*/i).map((part) => part.trim()).filter(Boolean);
}

export function authorTokens(authors: string[]): Set<string> {
  return new Set(authors.flatMap((author) => normalizeText(author).split(' ')).filter((token) => token.length > 1));
}

export function normalizeQuery(input: MaterialQueryInput): MaterialQuery {
  const authors = input.authors === undefined ? [] : splitAuthors(input.authors);
  const isbn = normalizeIdentifier(input.isbn);
  const issn = normalizeIdentifier(input.issn);
  const doi = normalizeDoi(input.doi);
  return {
    title: cleanHtml(input.title),
    authors,
    ...(input.year !== undefined ? { year: Number(input.year) } : {}),
    ...(input.type ? { type: input.type } : {}),
    ...(isbn ? { isbn } : {}),
    ...(issn ? { issn } : {}),
    ...(doi ? { doi } : {})
  };
}

export function diceSimilarity(left: string, right: string): number {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const pair = a.slice(i, i + 2);
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const pair = b.slice(i, i + 2);
    const count = counts.get(pair) ?? 0;
    if (count > 0) {
      overlap += 1;
      counts.set(pair, count - 1);
    }
  }
  return (2 * overlap) / (a.length + b.length - 2);
}
