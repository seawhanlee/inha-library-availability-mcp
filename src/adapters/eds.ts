import type { AppConfig } from '../config.js';
import { fetchWithRetry, MemoryCache, type FetchLike } from '../http.js';
import { cleanHtml, extractYear, normalizeDoi, normalizeIdentifier, splitAuthors } from '../normalize.js';
import type { ElectronicFinding, FullTextLink, MaterialQuery, SourceCandidate, SourceSearchResult } from '../types.js';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
const string = (value: unknown): string | undefined => cleanHtml(value) || undefined;

function parsePossiblyJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; } catch { throw new Error('Malformed EBSCO response'); }
}

function itemValues(record: JsonObject): Map<string, string[]> {
  const values = new Map<string, string[]>();
  if (!Array.isArray(record.Items)) return values;
  for (const raw of record.Items) {
    const item = object(raw);
    const name = string(item?.Name)?.toLowerCase();
    const value = string(item?.Data);
    if (name && value) values.set(name, [...(values.get(name) ?? []), value]);
  }
  return values;
}

function collectLinks(record: JsonObject): FullTextLink[] {
  const links: FullTextLink[] = [];
  const fullText = object(record.FullText);
  const append = (raw: unknown, fallback?: string) => {
    const link = object(raw);
    const url = string(link?.Url ?? link?.URL ?? link?.url ?? fallback);
    if (!url || !/^https?:\/\//i.test(url)) return;
    const label = string(link?.Text ?? link?.Label ?? link?.title);
    const type = string(link?.Type ?? link?.type);
    links.push({
      url,
      ...(label ? { label } : {}),
      ...(type ? { type } : {})
    });
  };
  if (Array.isArray(fullText?.Links)) for (const link of fullText.Links) append(link, string(record.PLink));
  if (Array.isArray(fullText?.CustomLinks)) for (const link of fullText.CustomLinks) append(link);
  if (Array.isArray(record.CustomLinks)) for (const link of record.CustomLinks) append(link);
  const availability = String(object(fullText?.Text)?.Availability ?? fullText?.Availability ?? '');
  if (availability === '1' || availability.toLowerCase() === 'true') append({ Url: record.PLink, Text: 'EBSCO full text' });
  return links.filter((link, index, all) => all.findIndex((other) => other.url === link.url) === index);
}

export function parseEdsCandidate(value: unknown, inhaBaseUrl = 'https://lib.inha.ac.kr'): SourceCandidate | undefined {
  const record = object(value);
  if (!record) return undefined;
  const header = object(record.Header);
  const dbId = string(header?.DbId ?? record.DbId);
  const an = string(header?.An ?? record.An);
  const sourceId = dbId && an ? `${dbId}:${an}` : string(record.ResultId ?? record.id);
  const items = itemValues(record);
  const bibRecord = object(object(record.RecordInfo)?.BibRecord);
  const bibEntity = object(bibRecord?.BibEntity);
  const entityTitles = Array.isArray(bibEntity?.Titles) ? bibEntity.Titles : [];
  const entityTitle = string(object(entityTitles[0])?.TitleFull);
  const title = string(record.title) ?? items.get('title')?.[0] ?? entityTitle;
  if (!sourceId || !title) return undefined;
  const authorValues = items.get('author') ?? [];
  const links = collectLinks(record);
  const linkText = links.map((link) => `${link.label ?? ''} ${link.url}`).join(' ').toLowerCase();
  const restricted = /login|sign[ -]?in|authenticate|proxy|off.?campus|institutional access/.test(linkText);
  const accessStatus = links.length > 0
    ? (restricted ? 'login_required_or_network_restricted' : 'full_text_listed')
    : 'citation_only';
  const detailUrl = `${inhaBaseUrl}/search/eds/${encodeURIComponent(sourceId)}`;
  const isbn = normalizeIdentifier(record.ISBN ?? items.get('isbn')?.[0]);
  const issn = normalizeIdentifier(record.ISSN ?? items.get('issn')?.[0]);
  const doi = normalizeDoi(record.DOI ?? items.get('doi')?.[0]);
  const year = extractYear(record.PublicationDate ?? items.get('publicationdate')?.[0] ?? items.get('datepublished')?.[0]);
  const type = string(header?.PubType ?? header?.PubTypeId);
  const finding: ElectronicFinding = {
    source: 'ebsco', sourceId, title, accessStatus, fullTextLinks: links, detailUrl,
    ...(restricted ? { note: 'The listed link indicates that login or an institutional network may be required.' } : {})
  };
  return {
    source: 'ebsco', sourceId, title,
    authors: splitAuthors(record.author ?? authorValues),
    ...(year ? { year } : {}),
    ...(type ? { type } : {}),
    ...(isbn ? { isbn } : {}), ...(issn ? { issn } : {}), ...(doi ? { doi } : {}),
    detailUrl, physicalHoldings: [], electronic: finding
  };
}

export function parseEdsSearchResponse(value: unknown, inhaBaseUrl?: string): SourceCandidate[] {
  const root = object(value);
  const searchResult = object(root?.SearchResult);
  const data = object(searchResult?.Data);
  const records = Array.isArray(data?.Records) ? data.Records : Array.isArray(root?.records) ? root.records : [];
  return records.map((record) => parseEdsCandidate(record, inhaBaseUrl)).filter((candidate): candidate is SourceCandidate => Boolean(candidate));
}

export class EdsAdapter {
  private readonly cache: MemoryCache<SourceSearchResult>;

  constructor(private readonly config: AppConfig, private readonly fetchFn: FetchLike = fetch) {
    this.cache = new MemoryCache(config.cacheTtlMs);
  }

  search(query: MaterialQuery, maxCandidates: number): Promise<SourceSearchResult> {
    return this.cache.getOrCreate(JSON.stringify({ query, maxCandidates }), () => this.searchUncached(query, maxCandidates));
  }

  private async token(): Promise<string> {
    const url = new URL(this.config.edsWidgetUrl);
    url.searchParams.set('k', this.config.edsKey);
    url.searchParams.set('p', this.config.edsProfile);
    url.searchParams.set('s', this.config.edsSessionKey);
    url.searchParams.set('stk', 'get');
    const response = await fetchWithRetry(this.fetchFn, url, { method: 'POST', headers: { Accept: 'text/plain' } }, this.config.timeoutMs);
    const token = (await response.text()).trim();
    if (!token || token.startsWith('{')) throw new Error('EBSCO guest token was not issued');
    return token;
  }

  private async searchUncached(query: MaterialQuery, maxCandidates: number): Promise<SourceSearchResult> {
    try {
      const token = await this.token();
      const terms = [`query-1=AND,${encodeURIComponent(query.title)}`];
      if (query.authors[0]) terms.push(`query-2=AND,AU:${encodeURIComponent(query.authors[0])}`);
      if (query.doi) terms.push(`query-${terms.length + 1}=AND,DO:${encodeURIComponent(query.doi)}`);
      const q = `search?${terms.join('&')}&resultsperpage=${maxCandidates}&pagenumber=1&view=brief&highlight=n&includefacets=n`;
      const url = new URL(this.config.edsWidgetUrl);
      url.searchParams.set('q', q);
      url.searchParams.set('p', this.config.edsProfile);
      url.searchParams.set('s', this.config.edsSessionKey);
      url.searchParams.set('stk', token);
      const response = await fetchWithRetry(this.fetchFn, url, { headers: { Accept: 'application/json,text/plain' } }, this.config.timeoutMs);
      const body = parsePossiblyJson(await response.text());
      const candidates = parseEdsSearchResponse(body, new URL(this.config.catalogBaseUrl).origin).slice(0, maxCandidates);
      return { candidates, failed: false };
    } catch (error) {
      return { candidates: [], failed: true, warning: `EBSCO EDS unavailable: ${error instanceof Error ? error.message : String(error)}. Check INHA_EDS_KEY and INHA_EDS_PROFILE if the public integration changed.` };
    }
  }
}
