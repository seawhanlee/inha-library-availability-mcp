import type { AppConfig } from './config.js';
import { loadConfig } from './config.js';
import { CatalogAdapter } from './adapters/catalog.js';
import { EdsAdapter } from './adapters/eds.js';
import { evaluateCandidate, toMatchMetadata, type EvaluatedCandidate } from './match.js';
import { normalizeQuery } from './normalize.js';
import type {
  AvailabilityInput, AvailabilityStructuredResult, Confidence, ElectronicFinding,
  MaterialAvailabilityResult, MaterialQuery, SourceSearchResult
} from './types.js';

export interface AvailabilitySources {
  catalog: { search(query: MaterialQuery, maxCandidates: number): Promise<SourceSearchResult> };
  eds: { search(query: MaterialQuery, maxCandidates: number): Promise<SourceSearchResult> };
}

export class AvailabilityService {
  readonly config: AppConfig;
  readonly sources: AvailabilitySources;

  constructor(config: AppConfig = loadConfig(), sources?: AvailabilitySources) {
    this.config = config;
    this.sources = sources ?? { catalog: new CatalogAdapter(config), eds: new EdsAdapter(config) };
  }

  async check(input: AvailabilityInput): Promise<AvailabilityStructuredResult> {
    const raw = Array.isArray(input.materials) ? input.materials : [input.materials];
    const materials = raw.map(normalizeQuery);
    const results = await mapConcurrent(materials, this.config.concurrency, (query) => this.checkOne(query, input.maxCandidates));
    return { results };
  }

  private async checkOne(query: MaterialQuery, maxCandidates: number): Promise<MaterialAvailabilityResult> {
    const [catalog, eds] = await Promise.all([
      this.sources.catalog.search(query, maxCandidates),
      this.sources.eds.search(query, maxCandidates)
    ]);
    const warnings = [catalog.warning, eds.warning].filter((warning): warning is string => Boolean(warning));
    const evaluated = [...catalog.candidates, ...eds.candidates]
      .map((candidate) => evaluateCandidate(query, candidate))
      .sort((a, b) => b.score - a.score);
    const confirmed = evaluated.filter((item) => item.confirmed);
    const ambiguous = evaluated.filter((item) => item.ambiguous);
    const primary = choosePrimary(confirmed);
    const physicalHoldings = confirmed.flatMap((item) => item.candidate.physicalHoldings)
      .filter((holding, index, all) => all.findIndex((other) => JSON.stringify(other) === JSON.stringify(holding)) === index);
    const matchedElectronic = confirmed.flatMap((item) => item.candidate.electronic ? [item.candidate.electronic] : []);
    const electronicFindings: ElectronicFinding[] = matchedElectronic.length > 0
      ? matchedElectronic
      : [eds.failed
          ? { source: 'ebsco', accessStatus: 'unknown', fullTextLinks: [], note: eds.warning ?? 'EBSCO availability could not be checked.' }
          : { source: 'ebsco', accessStatus: 'not_found', fullTextLinks: [] }];

    let status: MaterialAvailabilityResult['status'];
    let confidence: Confidence;
    if (confirmed.some((item) => item.candidate.physicalHoldings.some((holding) => holding.available)) ||
        matchedElectronic.some((finding) => finding.accessStatus === 'full_text_listed' || finding.fullTextLinks.length > 0)) {
      status = 'available_now'; confidence = warnings.length > 0 ? 'medium' : 'high';
    } else if (physicalHoldings.length > 0) {
      status = 'held_but_unavailable'; confidence = warnings.length > 0 ? 'medium' : 'high';
    } else if (matchedElectronic.length > 0) {
      status = 'listed_access_uncertain'; confidence = warnings.length > 0 ? 'low' : 'medium';
    } else if (ambiguous.length > 0) {
      status = 'ambiguous'; confidence = 'low';
    } else if (catalog.failed || eds.failed) {
      status = 'unknown'; confidence = 'low';
    } else {
      status = 'not_found'; confidence = 'high';
    }

    const alternatives = evaluated
      .filter((item) => item !== primary && (item.ambiguous || item.confirmed))
      .slice(0, maxCandidates)
      .map(toMatchMetadata);
    return {
      query, status, confidence,
      ...(primary ? { match: toMatchMetadata(primary) } : {}),
      physicalHoldings, electronicFindings, alternatives, warnings,
      checkedAt: new Date().toISOString(), verificationUrl: this.config.inhaSearchUrl
    };
  }
}

function choosePrimary(confirmed: EvaluatedCandidate[]): EvaluatedCandidate | undefined {
  return [...confirmed].sort((a, b) => {
    const availableA = a.candidate.physicalHoldings.some((holding) => holding.available) || (a.candidate.electronic?.fullTextLinks.length ?? 0) > 0;
    const availableB = b.candidate.physicalHoldings.some((holding) => holding.available) || (b.candidate.electronic?.fullTextLinks.length ?? 0) > 0;
    return Number(availableB) - Number(availableA) || b.score - a.score;
  })[0];
}

export async function mapConcurrent<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index] as T, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export function summarize(result: AvailabilityStructuredResult): string {
  const labels: Record<MaterialAvailabilityResult['status'], string> = {
    available_now: 'available now', held_but_unavailable: 'held, but no available copy was confirmed',
    listed_access_uncertain: 'listed electronically; access is uncertain', not_found: 'not found',
    ambiguous: 'ambiguous match', unknown: 'could not be determined'
  };
  return result.results.map((item, index) => {
    const match = item.match ? ` — ${item.match.title}` : '';
    const warning = item.warnings.length ? ` (${item.warnings.length} source warning${item.warnings.length === 1 ? '' : 's'})` : '';
    return `${index + 1}. ${item.query.title}: ${labels[item.status]}${match}${warning}`;
  }).join('\n');
}
