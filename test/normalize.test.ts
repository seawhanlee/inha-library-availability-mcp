import { describe, expect, it } from 'vitest';
import { availabilityInputSchema } from '../src/types.js';
import { cleanHtml, diceSimilarity, normalizeDoi, normalizeIdentifier, normalizeQuery, normalizeText } from '../src/normalize.js';

describe('input and normalization', () => {
  it('accepts one material and applies the candidate default', () => {
    const parsed = availabilityInputSchema.parse({ materials: { title: '  책  ' } });
    expect(parsed.maxCandidates).toBe(5);
  });

  it('accepts batches of 20 but rejects 21', () => {
    expect(availabilityInputSchema.safeParse({ materials: Array.from({ length: 20 }, (_, i) => ({ title: `t${i}` })) }).success).toBe(true);
    expect(availabilityInputSchema.safeParse({ materials: Array.from({ length: 21 }, (_, i) => ({ title: `t${i}` })) }).success).toBe(false);
  });

  it('normalizes identifiers, DOI prefixes, Unicode, authors, and years', () => {
    const query = normalizeQuery({ title: 'Ａ—B', authors: 'Kim, Mina; Lee, Hana', year: '2024', isbn: '978-1-23-X', doi: 'https://doi.org/10.1000/ABC' });
    expect(normalizeText(query.title)).toBe('a b');
    expect(query.authors).toEqual(['Kim, Mina', 'Lee, Hana']);
    expect(query.year).toBe(2024);
    expect(query.isbn).toBe('978123X');
    expect(query.doi).toBe('10.1000/abc');
    expect(normalizeIdentifier(' 1234-567X ')).toBe('1234567X');
    expect(normalizeDoi('doi: 10.1/Test')).toBe('10.1/test');
  });

  it('cleans EDS HTML and decodes entities', () => {
    expect(cleanHtml('<highlight>A &amp; B</highlight><br/>Next')).toBe('A & B; Next');
  });

  it('computes stable Dice scores', () => {
    expect(diceSimilarity('Exact!', 'exact')).toBe(1);
    expect(diceSimilarity('abcdefghij', 'abcdefxhij')).toBeGreaterThan(0.75);
  });
});
