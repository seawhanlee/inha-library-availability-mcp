import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCatalogCandidate } from '../src/adapters/catalog.js';
import { parseEdsSearchResponse } from '../src/adapters/eds.js';

const fixture = (name: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')) as unknown;

describe('catalog adapter parsing', () => {
  it('parses available branch-volume summaries', () => {
    const envelope = fixture('catalog-available.json') as { data: { list: unknown[] } };
    const candidate = parseCatalogCandidate(envelope.data.list[0]);
    expect(candidate).toMatchObject({ sourceId: '1086448', isbn: '9788983928085', year: 2020 });
    expect(candidate?.physicalHoldings[0]).toMatchObject({ circulationCode: 'READY', available: true });
  });

  it('parses checked-out holdings conservatively', () => {
    const candidate = parseCatalogCandidate(fixture('catalog-checked-out.json'));
    expect(candidate?.physicalHoldings[0]).toMatchObject({ circulationCode: 'CHARGED', available: false });
  });

  it('rejects malformed records', () => {
    expect(parseCatalogCandidate({ id: 1 })).toBeUndefined();
  });
});

describe('EBSCO adapter parsing', () => {
  it('extracts metadata and explicit full-text links', () => {
    const [candidate] = parseEdsSearchResponse(fixture('eds-full-text.json'));
    expect(candidate).toMatchObject({ sourceId: 'asn:123', title: 'A & B: Reliable Systems', year: 2024, doi: '10.1000/example' });
    expect(candidate?.electronic?.fullTextLinks).toHaveLength(1);
    expect(candidate?.electronic?.accessStatus).toBe('login_required_or_network_restricted');
  });

  it('distinguishes citation-only records and empty responses', () => {
    const [candidate] = parseEdsSearchResponse(fixture('eds-citation-only.json'));
    expect(candidate?.electronic?.accessStatus).toBe('citation_only');
    expect(parseEdsSearchResponse(fixture('eds-empty.json'))).toEqual([]);
  });

  it('tolerates malformed envelopes as empty data', () => {
    expect(parseEdsSearchResponse({ nope: true })).toEqual([]);
  });
});
