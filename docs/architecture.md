# Architecture

## Request flow

```text
MCP client
   │  check_inha_library_availability
   ▼
Input validation and normalization
   │
   ├──────────────► Inha Pyxis catalog
   │                 search → bibliographic detail → copy holdings
   │
   └──────────────► Inha public EBSCO EDS widget
                     guest token → search results → access links
   │
   ▼
Candidate matching
   ▼
Conservative availability aggregation
   ▼
Text content + structuredContent
```

The stdio entrypoint is `src/index.ts`. `src/server.ts` registers the MCP tool, and `src/service.ts` coordinates the two source adapters.

## Source adapters

### Catalog

`src/adapters/catalog.ts` uses Inha's public Pyxis endpoints to:

1. look up ISBN or ISSN identifiers when supplied;
2. search the configured collection using the normalized title;
3. hydrate candidate bibliographic metadata;
4. fetch copy-level holdings and live circulation states.

`READY` or the Korean state `대출가능` is the only physical state interpreted as currently available. Unknown circulation states remain unavailable rather than being guessed.

### EBSCO EDS

`src/adapters/eds.ts` mirrors Inha's public guest integration:

1. request a short-lived guest token using Inha's published encrypted key/profile;
2. submit a title/author/DOI search;
3. normalize EDS metadata and full-text/custom links;
4. distinguish full-text, citation-only, and restricted-access findings.

The defaults are public integration values, not user credentials. If Inha changes its profile or encrypted key, the adapter returns a warning and the values can be overridden through environment variables.

## Matching rules

Matching is deliberately stricter than search ranking:

1. Exact normalized ISBN, ISSN, or DOI confirms a match.
2. An exact normalized title confirms a match when all supplied author/year metadata is present on the candidate and agrees. A title-only query can also confirm an exact title.
3. A title Dice similarity of at least `0.90` can confirm a non-exact title only with author overlap and exact supplied-year agreement.
4. Similarities from `0.75` through `0.89`, missing required agreement, or conflicting metadata are returned as ambiguous candidates.
5. Weaker candidates are ignored.

Normalization includes NFKC Unicode normalization, case folding, punctuation removal, whitespace collapse, ISBN/ISSN punctuation removal, DOI prefix removal, author tokenization, and year extraction.

## Aggregation priority

Confirmed evidence is aggregated in this order:

1. available physical copy or explicit electronic access link → `available_now`;
2. physical holdings without an available copy → `held_but_unavailable`;
3. electronic listing without confirmed access → `listed_access_uncertain`;
4. plausible candidates without confirmation → `ambiguous`;
5. source failure without positive evidence → `unknown`;
6. successful sources with no plausible candidate → `not_found`.

A source warning reduces confidence but does not discard positive evidence from another source.

## Resilience and performance

- Each HTTP request has an eight-second default timeout.
- Transient failures receive one retry.
- Search results are cached in memory for five minutes.
- Concurrent requests for the same cache key share one in-flight promise.
- Batch calls use four workers by default and preserve input order.
- All diagnostics use stderr because stdout is reserved for MCP protocol messages.

The cache is process-local and is cleared when the MCP server exits.

## Privacy and security boundary

The server:

- sends only the supplied bibliographic query to public Inha/EBSCO endpoints;
- does not accept or store Inha usernames, passwords, library card numbers, or cookies;
- does not bypass proxy, campus-network, or publisher authentication;
- does not download protected full text;
- does not perform borrowing, holds, renewals, or reservations.

Direct electronic links are returned for user verification. Opening such a link occurs outside the MCP server and may invoke Inha's normal authentication flow.
