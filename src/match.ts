import { authorTokens, diceSimilarity, normalizeDoi, normalizeIdentifier, normalizeText } from './normalize.js';
import type { MatchMetadata, MaterialQuery, SourceCandidate } from './types.js';

export interface EvaluatedCandidate {
  candidate: SourceCandidate;
  score: number;
  confirmed: boolean;
  ambiguous: boolean;
  reason: string;
}

function overlap(left: string[], right: string[]): boolean {
  const a = authorTokens(left);
  const b = authorTokens(right);
  return [...a].some((token) => b.has(token));
}

export function evaluateCandidate(query: MaterialQuery, candidate: SourceCandidate): EvaluatedCandidate {
  const identifiers: Array<[string, string | undefined, string | undefined]> = [
    ['ISBN', normalizeIdentifier(query.isbn), normalizeIdentifier(candidate.isbn)],
    ['ISSN', normalizeIdentifier(query.issn), normalizeIdentifier(candidate.issn)],
    ['DOI', normalizeDoi(query.doi), normalizeDoi(candidate.doi)]
  ];
  for (const [label, expected, actual] of identifiers) {
    if (expected && actual && expected === actual) {
      return { candidate, score: 1, confirmed: true, ambiguous: false, reason: `Exact ${label} match` };
    }
  }

  const similarity = diceSimilarity(query.title, candidate.title);
  const exactTitle = normalizeText(query.title) === normalizeText(candidate.title);
  const authorRequired = query.authors.length > 0;
  const authorAgrees = !authorRequired || overlap(query.authors, candidate.authors);
  const authorKnown = !authorRequired || candidate.authors.length > 0;
  const yearRequired = query.year !== undefined;
  const yearAgrees = !yearRequired || candidate.year === query.year;
  const yearKnown = !yearRequired || candidate.year !== undefined;
  const conflicting = (authorKnown && !authorAgrees) || (yearKnown && !yearAgrees);
  const metadataAgrees = authorAgrees && yearAgrees && authorKnown && yearKnown;

  if (exactTitle && metadataAgrees) {
    return { candidate, score: 1, confirmed: true, ambiguous: false, reason: 'Exact normalized title with supplied metadata agreement' };
  }
  if (!exactTitle && similarity >= 0.9 && authorRequired && authorAgrees && yearAgrees && yearKnown) {
    return { candidate, score: similarity, confirmed: true, ambiguous: false, reason: 'Strong title similarity with author overlap and year agreement' };
  }
  if (similarity >= 0.75 || (exactTitle && (!metadataAgrees || conflicting))) {
    return {
      candidate,
      score: Math.min(similarity, conflicting ? 0.89 : similarity),
      confirmed: false,
      ambiguous: true,
      reason: conflicting ? 'Similar title but supplied metadata conflicts' : 'Plausible match requiring user verification'
    };
  }
  return { candidate, score: similarity, confirmed: false, ambiguous: false, reason: 'Weak metadata match' };
}

export function toMatchMetadata(evaluated: EvaluatedCandidate): MatchMetadata {
  const candidate = evaluated.candidate;
  return {
    source: candidate.source, sourceId: candidate.sourceId, title: candidate.title,
    authors: candidate.authors, ...(candidate.year !== undefined ? { year: candidate.year } : {}),
    ...(candidate.type ? { type: candidate.type } : {}), ...(candidate.isbn ? { isbn: candidate.isbn } : {}),
    ...(candidate.issn ? { issn: candidate.issn } : {}), ...(candidate.doi ? { doi: candidate.doi } : {}),
    detailUrl: candidate.detailUrl, matchScore: Number(evaluated.score.toFixed(3)), matchReason: evaluated.reason
  };
}
