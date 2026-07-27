import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { AvailabilityService, type AvailabilitySources } from '../src/service.js';
import type { SourceCandidate, SourceSearchResult } from '../src/types.js';

const catalogCandidate = (available: boolean): SourceCandidate => ({
  source: 'catalog', sourceId: 'book-1', title: 'Exact Book', authors: ['Author One'], year: 2020,
  detailUrl: 'https://lib.inha.ac.kr/search/all-collections/book-1', physicalHoldings: [{
    branch: 'Main', circulationCode: available ? 'READY' : 'CHARGED',
    circulationText: available ? '대출가능' : '대출중', available
  }]
});

const electronicCandidate = (withLink: boolean): SourceCandidate => ({
  source: 'ebsco', sourceId: 'edb:1', title: 'Exact Article', authors: ['Author One'], year: 2020,
  detailUrl: 'https://lib.inha.ac.kr/search/eds/edb%3A1', physicalHoldings: [],
  electronic: {
    source: 'ebsco', sourceId: 'edb:1', title: 'Exact Article',
    accessStatus: withLink ? 'login_required_or_network_restricted' : 'citation_only',
    fullTextLinks: withLink ? [{ url: 'https://search.ebscohost.com/fulltext/1', label: 'PDF' }] : []
  }
});

const source = (result: SourceSearchResult) => ({ search: async () => result });
const service = (catalog: SourceSearchResult, eds: SourceSearchResult) => new AvailabilityService(
  { ...loadConfig({}), concurrency: 4 }, { catalog: source(catalog), eds: source(eds) } satisfies AvailabilitySources
);

describe('availability aggregation', () => {
  it('marks a READY physical copy available', async () => {
    const result = await service({ candidates: [catalogCandidate(true)], failed: false }, { candidates: [], failed: false })
      .check({ materials: { title: 'Exact Book', authors: 'Author One', year: 2020 }, maxCandidates: 5 });
    expect(result.results[0]).toMatchObject({ status: 'available_now', confidence: 'high' });
  });

  it('marks matching checked-out holdings unavailable', async () => {
    const result = await service({ candidates: [catalogCandidate(false)], failed: false }, { candidates: [], failed: false })
      .check({ materials: { title: 'Exact Book', authors: 'Author One', year: 2020 }, maxCandidates: 5 });
    expect(result.results[0]?.status).toBe('held_but_unavailable');
  });

  it('marks an explicit electronic full-text link available even when login may be required', async () => {
    const result = await service({ candidates: [], failed: false }, { candidates: [electronicCandidate(true)], failed: false })
      .check({ materials: { title: 'Exact Article', authors: 'Author One', year: 2020 }, maxCandidates: 5 });
    expect(result.results[0]).toMatchObject({ status: 'available_now' });
    expect(result.results[0]?.electronicFindings[0]).toMatchObject({ accessStatus: 'login_required_or_network_restricted' });
  });

  it('marks an electronic citation without a full-text link as uncertain', async () => {
    const result = await service({ candidates: [], failed: false }, { candidates: [electronicCandidate(false)], failed: false })
      .check({ materials: { title: 'Exact Article', authors: 'Author One', year: 2020 }, maxCandidates: 5 });
    expect(result.results[0]).toMatchObject({ status: 'listed_access_uncertain', confidence: 'medium' });
  });

  it('does not turn a partial EDS outage into not_found', async () => {
    const result = await service({ candidates: [], failed: false }, { candidates: [], failed: true, warning: 'EDS down' })
      .check({ materials: { title: 'Missing' }, maxCandidates: 5 });
    expect(result.results[0]).toMatchObject({ status: 'unknown', warnings: ['EDS down'] });
    expect(result.results[0]?.electronicFindings[0]?.accessStatus).toBe('unknown');
  });

  it('returns ambiguous for conflicting editions', async () => {
    const candidate = { ...catalogCandidate(false), year: 2019 };
    const result = await service({ candidates: [candidate], failed: false }, { candidates: [], failed: false })
      .check({ materials: { title: 'Exact Book', authors: 'Author One', year: 2020 }, maxCandidates: 5 });
    expect(result.results[0]?.status).toBe('ambiguous');
    expect(result.results[0]?.alternatives).toHaveLength(1);
  });

  it('preserves stable ordering with four concurrent batch workers', async () => {
    const delayed = { search: async (query: { title: string }) => {
      await new Promise((resolve) => setTimeout(resolve, query.title === 'first' ? 15 : 1));
      return { candidates: [], failed: false };
    } };
    const instance = new AvailabilityService({ ...loadConfig({}), concurrency: 4 }, { catalog: delayed, eds: delayed });
    const result = await instance.check({ materials: [{ title: 'first' }, { title: 'second' }, { title: 'third' }], maxCandidates: 5 });
    expect(result.results.map((item) => item.query.title)).toEqual(['first', 'second', 'third']);
  });
});
