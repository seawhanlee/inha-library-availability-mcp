import type { AppConfig } from '../config.js';
import { fetchJson, MemoryCache, type FetchLike } from '../http.js';
import { cleanHtml, extractYear, normalizeDoi, normalizeIdentifier, splitAuthors } from '../normalize.js';
import type { MaterialQuery, PhysicalHolding, SourceCandidate, SourceSearchResult } from '../types.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : undefined;
}

function text(value: unknown): string | undefined {
  const cleaned = cleanHtml(value);
  return cleaned || undefined;
}

function catalogHolding(value: unknown): PhysicalHolding | undefined {
  const item = object(value);
  if (!item) return undefined;
  const branch = object(item.branch);
  const location = object(item.location);
  const circulation = object(item.circulationState);
  const circulationCode = text(circulation?.code ?? item.cStateCode);
  const circulationText = text(circulation?.name ?? item.cState);
  const locationName = text(location?.name);
  const callNumber = text(item.callNo ?? item.volume);
  const barcode = text(item.barcode);
  const dueDate = text(item.dueDate);
  if (!text(branch?.name) && !circulationCode && !circulationText) return undefined;
  return {
    branch: text(branch?.name) ?? 'Inha Library',
    ...(locationName ? { location: locationName } : {}),
    ...(callNumber ? { callNumber } : {}),
    ...(barcode ? { barcode } : {}),
    ...(circulationCode ? { circulationCode } : {}),
    ...(circulationText ? { circulationText } : {}),
    ...(dueDate ? { dueDate } : {}),
    available: circulationCode?.toUpperCase() === 'READY' || circulationText === '대출가능'
  };
}

function flattenItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const grouped = object(data);
  return grouped ? Object.values(grouped).flatMap((value) => Array.isArray(value) ? value : []) : [];
}

function findMarcDoi(content: unknown): string | undefined {
  if (typeof content !== 'string') return undefined;
  const doi = content.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0];
  return normalizeDoi(doi);
}

export function parseCatalogCandidate(
  value: unknown,
  holdings: PhysicalHolding[] = [],
  baseUrl = 'https://lib.inha.ac.kr'
): SourceCandidate | undefined {
  const item = object(value);
  if (!item) return undefined;
  const id = String(item.id ?? item.biblioId ?? '').trim();
  const title = text(item.titleStatement ?? item.title);
  if (!id || !title) return undefined;
  const biblioType = object(item.biblioType);
  const materialType = object(item.materialType) ?? object(biblioType?.materialType);
  const fallbackHoldings = Array.isArray(item.branchVolumes)
    ? item.branchVolumes.map((entry) => {
        const volume = object(entry);
        if (!volume) return undefined;
        const code = text(volume.cStateCode);
        const state = text(volume.cState);
        const callNumber = text(volume.volume);
        return {
          branch: text(volume.name) ?? 'Inha Library',
          ...(callNumber ? { callNumber } : {}),
          ...(code ? { circulationCode: code } : {}),
          ...(state ? { circulationText: state } : {}),
          available: code?.toUpperCase() === 'READY' || state === '대출가능'
        } satisfies PhysicalHolding;
      }).filter((entry): entry is PhysicalHolding => Boolean(entry))
    : [];
  const isbn = normalizeIdentifier(item.isbn);
  const issn = normalizeIdentifier(item.issn);
  const doi = normalizeDoi(item.doi) ?? findMarcDoi(item.content);
  const year = extractYear(item.publishYear ?? item.publication);
  const type = text(materialType?.name ?? biblioType?.name);
  return {
    source: 'catalog', sourceId: id, title,
    authors: splitAuthors(item.author ?? item.authors),
    ...(year ? { year } : {}),
    ...(type ? { type } : {}),
    ...(isbn ? { isbn } : {}), ...(issn ? { issn } : {}), ...(doi ? { doi } : {}),
    detailUrl: `${baseUrl}/search/all-collections/${encodeURIComponent(id)}`,
    physicalHoldings: holdings.length > 0 ? holdings : fallbackHoldings
  };
}

export class CatalogAdapter {
  private readonly cache: MemoryCache<SourceSearchResult>;

  constructor(private readonly config: AppConfig, private readonly fetchFn: FetchLike = fetch) {
    this.cache = new MemoryCache(config.cacheTtlMs);
  }

  search(query: MaterialQuery, maxCandidates: number): Promise<SourceSearchResult> {
    return this.cache.getOrCreate(JSON.stringify({ query, maxCandidates }), () => this.searchUncached(query, maxCandidates));
  }

  private async getJson(path: string, params: Record<string, string | number | boolean> = {}): Promise<unknown> {
    const url = new URL(path, `${this.config.catalogBaseUrl}/`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    return fetchJson(this.fetchFn, url, { headers: { Accept: 'application/json', 'User-Agent': 'inha-library-availability-mcp/1.0' } }, this.config.timeoutMs);
  }

  private async identifierId(query: MaterialQuery): Promise<string | undefined> {
    const identifier = query.isbn ? { isbn: query.isbn } : query.issn ? { issn: query.issn } : undefined;
    if (!identifier) return undefined;
    const response = object(await this.getJson('biblio-by-codes', identifier));
    return response?.success === true && response.data !== undefined ? String(response.data) : undefined;
  }

  private async detailCandidate(id: string, seed?: unknown): Promise<SourceCandidate | undefined> {
    const [detailResult, itemsResult] = await Promise.allSettled([
      this.getJson(`1/biblios/${encodeURIComponent(id)}`, { isForPyxis3: true }),
      this.getJson(`1/biblios/${encodeURIComponent(id)}/items`, { isForPyxis3: true })
    ]);
    let record = seed;
    if (detailResult.status === 'fulfilled') {
      const envelope = object(detailResult.value);
      const data = object(envelope?.data);
      if (Array.isArray(data?.list) && data.list[0]) record = { ...object(seed), ...object(data.list[0]), id };
    }
    const holdings = itemsResult.status === 'fulfilled'
      ? flattenItems(object(itemsResult.value)?.data).map(catalogHolding).filter((item): item is PhysicalHolding => Boolean(item))
      : [];
    return parseCatalogCandidate(record, holdings, new URL(this.config.catalogBaseUrl).origin);
  }

  private async searchUncached(query: MaterialQuery, maxCandidates: number): Promise<SourceSearchResult> {
    try {
      let list: unknown[] = [];
      const exactId = await this.identifierId(query);
      const response = object(await this.getJson(`1/collections/${this.config.catalogCollectionId}/search`, {
        all: `k|a|${query.title}`, max: maxCandidates, offset: 0, facet: false, fuzzy: false, isForPyxis3: true
      }));
      const data = object(response?.data);
      if (Array.isArray(data?.list)) list = data.list;
      if (exactId && !list.some((item) => String(object(item)?.id) === exactId)) list.unshift({ id: exactId, titleStatement: query.title });
      const unique = list.filter((item, index, all) => all.findIndex((other) => String(object(other)?.id) === String(object(item)?.id)) === index).slice(0, maxCandidates);
      const candidates = (await Promise.all(unique.map((item) => this.detailCandidate(String(object(item)?.id), item))))
        .filter((item): item is SourceCandidate => Boolean(item));
      return { candidates, failed: false };
    } catch (error) {
      return { candidates: [], failed: true, warning: `Inha catalog unavailable: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
}
