import { describe, expect, it } from 'vitest';
import { evaluateCandidate } from '../src/match.js';
import type { MaterialQuery, SourceCandidate } from '../src/types.js';

const baseQuery: MaterialQuery = { title: 'Reliable Distributed Systems', authors: ['Mina Kim'], year: 2024 };
const baseCandidate: SourceCandidate = {
  source: 'catalog', sourceId: '1', title: 'Reliable Distributed Systems', authors: ['Kim, Mina'],
  year: 2024, isbn: '9781234567890', detailUrl: 'https://example.test/1', physicalHoldings: []
};

describe('candidate matching', () => {
  it('confirms exact identifiers', () => {
    expect(evaluateCandidate({ ...baseQuery, isbn: '978-1-234-56789-0' }, baseCandidate)).toMatchObject({ confirmed: true, score: 1, reason: 'Exact ISBN match' });
  });

  it('confirms exact titles only when supplied metadata agrees', () => {
    expect(evaluateCandidate(baseQuery, baseCandidate).confirmed).toBe(true);
    expect(evaluateCandidate({ ...baseQuery, year: 2020 }, baseCandidate)).toMatchObject({ confirmed: false, ambiguous: true });
  });

  it('marks scores from 0.75 through 0.89 ambiguous', () => {
    const result = evaluateCandidate({ title: 'abcdefghij', authors: [] }, { ...baseCandidate, title: 'abcdefxhij', authors: [] });
    expect(result.score).toBeGreaterThanOrEqual(0.75);
    expect(result.score).toBeLessThan(0.9);
    expect(result.ambiguous).toBe(true);
  });
});
