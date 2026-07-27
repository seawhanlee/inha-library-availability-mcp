import * as z from 'zod/v4';

export const materialQuerySchema = z.object({
  title: z.string().trim().min(1).max(500),
  authors: z.union([
    z.string().trim().min(1),
    z.array(z.string().trim().min(1)).min(1).max(20)
  ]).optional(),
  year: z.union([
    z.number().int().min(1000).max(3000),
    z.string().regex(/^\d{4}$/)
  ]).optional(),
  type: z.enum(['book', 'ebook', 'article', 'journal', 'thesis', 'other']).optional(),
  isbn: z.string().trim().min(1).optional(),
  issn: z.string().trim().min(1).optional(),
  doi: z.string().trim().min(1).optional()
});

export const availabilityInputSchema = z.object({
  materials: z.union([
    materialQuerySchema,
    z.array(materialQuerySchema).min(1).max(20)
  ]),
  maxCandidates: z.number().int().min(1).max(10).default(5)
});

export type MaterialQueryInput = z.infer<typeof materialQuerySchema>;
export type AvailabilityInput = z.infer<typeof availabilityInputSchema>;

export interface MaterialQuery {
  title: string;
  authors: string[];
  year?: number;
  type?: MaterialQueryInput['type'];
  isbn?: string;
  issn?: string;
  doi?: string;
}

export type AvailabilityStatus =
  | 'available_now'
  | 'held_but_unavailable'
  | 'listed_access_uncertain'
  | 'not_found'
  | 'ambiguous'
  | 'unknown';

export type Confidence = 'high' | 'medium' | 'low';
export type ElectronicAccessStatus =
  | 'full_text_listed'
  | 'citation_only'
  | 'login_required_or_network_restricted'
  | 'not_found'
  | 'unknown';

export interface MatchMetadata {
  source: 'catalog' | 'ebsco';
  sourceId: string;
  title: string;
  authors: string[];
  year?: number;
  type?: string;
  isbn?: string;
  issn?: string;
  doi?: string;
  detailUrl: string;
  matchScore: number;
  matchReason: string;
}

export interface PhysicalHolding {
  branch: string;
  location?: string;
  callNumber?: string;
  barcode?: string;
  circulationCode?: string;
  circulationText?: string;
  dueDate?: string;
  available: boolean;
}

export interface FullTextLink {
  url: string;
  label?: string;
  type?: string;
}

export interface ElectronicFinding {
  source: 'ebsco' | 'catalog';
  sourceId?: string;
  title?: string;
  accessStatus: ElectronicAccessStatus;
  fullTextLinks: FullTextLink[];
  detailUrl?: string;
  note?: string;
}

export interface AlternativeCandidate extends MatchMetadata {}

export interface MaterialAvailabilityResult {
  query: MaterialQuery;
  status: AvailabilityStatus;
  confidence: Confidence;
  match?: MatchMetadata;
  physicalHoldings: PhysicalHolding[];
  electronicFindings: ElectronicFinding[];
  alternatives: AlternativeCandidate[];
  warnings: string[];
  checkedAt: string;
  verificationUrl: string;
}

export interface AvailabilityStructuredResult {
  results: MaterialAvailabilityResult[];
}

export interface SourceCandidate {
  source: 'catalog' | 'ebsco';
  sourceId: string;
  title: string;
  authors: string[];
  year?: number;
  type?: string;
  isbn?: string;
  issn?: string;
  doi?: string;
  detailUrl: string;
  physicalHoldings: PhysicalHolding[];
  electronic?: ElectronicFinding;
}

export interface SourceSearchResult {
  candidates: SourceCandidate[];
  warning?: string;
  failed: boolean;
}

export const matchMetadataSchema = z.object({
  source: z.enum(['catalog', 'ebsco']), sourceId: z.string(), title: z.string(),
  authors: z.array(z.string()), year: z.number().optional(), type: z.string().optional(),
  isbn: z.string().optional(), issn: z.string().optional(), doi: z.string().optional(),
  detailUrl: z.string(), matchScore: z.number(), matchReason: z.string()
});

export const availabilityOutputSchema = z.object({
  results: z.array(z.object({
    query: z.object({
      title: z.string(), authors: z.array(z.string()), year: z.number().optional(),
      type: z.enum(['book', 'ebook', 'article', 'journal', 'thesis', 'other']).optional(),
      isbn: z.string().optional(), issn: z.string().optional(), doi: z.string().optional()
    }),
    status: z.enum(['available_now', 'held_but_unavailable', 'listed_access_uncertain', 'not_found', 'ambiguous', 'unknown']),
    confidence: z.enum(['high', 'medium', 'low']),
    match: matchMetadataSchema.optional(),
    physicalHoldings: z.array(z.object({
      branch: z.string(), location: z.string().optional(), callNumber: z.string().optional(),
      barcode: z.string().optional(), circulationCode: z.string().optional(),
      circulationText: z.string().optional(), dueDate: z.string().optional(), available: z.boolean()
    })),
    electronicFindings: z.array(z.object({
      source: z.enum(['ebsco', 'catalog']), sourceId: z.string().optional(), title: z.string().optional(),
      accessStatus: z.enum(['full_text_listed', 'citation_only', 'login_required_or_network_restricted', 'not_found', 'unknown']),
      fullTextLinks: z.array(z.object({ url: z.string(), label: z.string().optional(), type: z.string().optional() })),
      detailUrl: z.string().optional(), note: z.string().optional()
    })),
    alternatives: z.array(matchMetadataSchema),
    warnings: z.array(z.string()), checkedAt: z.string(), verificationUrl: z.string()
  }))
});
