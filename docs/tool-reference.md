# Tool reference

## `check_inha_library_availability`

Checks physical holdings in Inha's catalog and electronic listings exposed through Inha's public EBSCO EDS integration. The tool performs discovery only; it does not borrow, reserve, authenticate, or download material.

## Input

```ts
interface Input {
  materials: MaterialQuery | MaterialQuery[]; // one item or 1–20 items
  maxCandidates?: number;                     // integer 1–10, default 5
}

interface MaterialQuery {
  title: string;                              // required, 1–500 characters
  authors?: string | string[];                // up to 20 array entries
  year?: number | string;                     // four digits, 1000–3000
  type?: 'book' | 'ebook' | 'article' | 'journal' | 'thesis' | 'other';
  isbn?: string;
  issn?: string;
  doi?: string;
}
```

`title` is always required, including when an identifier is supplied. ISBN hyphens, DOI URL prefixes, punctuation, case, and Unicode-width differences are normalized before matching.

### Single book

```json
{
  "materials": {
    "title": "해리 포터.2, 죽음의 성물",
    "authors": "J. K. 롤링",
    "year": 2020,
    "type": "book",
    "isbn": "978-89-8392-808-5"
  }
}
```

### Mixed batch

```json
{
  "materials": [
    {
      "title": "A known book",
      "authors": ["First Author"],
      "isbn": "9781234567890"
    },
    {
      "title": "A known article",
      "authors": "Second Author",
      "year": 2024,
      "doi": "https://doi.org/10.1000/example"
    }
  ],
  "maxCandidates": 5
}
```

Batch results preserve input order. At most four batch items are checked concurrently by default.

## Output

The MCP response contains both:

- `content`: a short text summary intended for a model;
- `structuredContent`: the complete machine-readable result.

Top-level shape:

```ts
interface StructuredResult {
  results: MaterialAvailabilityResult[];
}
```

Each material result contains:

| Field | Meaning |
| --- | --- |
| `query` | Normalized query used for matching |
| `status` | Conservative aggregate availability status |
| `confidence` | `high`, `medium`, or `low` |
| `match` | Best confirmed source record, when one exists |
| `physicalHoldings` | Copy-level branch, location, call number, and circulation information |
| `electronicFindings` | EDS/catalog electronic access observations and links |
| `alternatives` | Other confirmed or ambiguous candidates |
| `warnings` | Source failures or integration-change guidance |
| `checkedAt` | ISO 8601 point-in-time timestamp |
| `verificationUrl` | Direct Inha search URL for manual checking |

### Aggregate status

| Status | Interpretation |
| --- | --- |
| `available_now` | A physical copy is explicitly `READY`/대출가능, or an electronic record exposes a full-text link |
| `held_but_unavailable` | A confirmed physical record exists, but no available copy was found |
| `listed_access_uncertain` | A confirmed electronic citation/listing exists without a confirmed full-text link |
| `not_found` | Both sources responded and no plausible match was found |
| `ambiguous` | One or more plausible candidates require human verification |
| `unknown` | An upstream failure prevents a reliable absence conclusion |

`not_found` is intentionally strict. If either required source fails and no positive match exists, the status is `unknown` instead.

### Electronic access status

| Status | Interpretation |
| --- | --- |
| `full_text_listed` | The record exposes a full-text/access link |
| `citation_only` | Metadata exists, but no full-text link was exposed |
| `login_required_or_network_restricted` | The link indicates institutional authentication or network restrictions |
| `not_found` | EBSCO responded without a confirmed matching record |
| `unknown` | EBSCO could not be checked reliably |

An electronic result can make the aggregate status `available_now` while its access status warns that login may be required. “Available” means Inha exposes an access link, not that off-campus anonymous access is guaranteed.

### Example structured result

```json
{
  "results": [
    {
      "query": {
        "title": "Example Book",
        "authors": ["Author One"],
        "year": 2024,
        "isbn": "9781234567890"
      },
      "status": "available_now",
      "confidence": "high",
      "match": {
        "source": "catalog",
        "sourceId": "12345",
        "title": "Example Book",
        "authors": ["Author One"],
        "year": 2024,
        "isbn": "9781234567890",
        "detailUrl": "https://lib.inha.ac.kr/search/all-collections/12345",
        "matchScore": 1,
        "matchReason": "Exact ISBN match"
      },
      "physicalHoldings": [
        {
          "branch": "정석학술정보관",
          "location": "3F 자료실",
          "callNumber": "QA 76 E9",
          "circulationCode": "READY",
          "circulationText": "대출가능",
          "available": true
        }
      ],
      "electronicFindings": [
        {
          "source": "ebsco",
          "accessStatus": "not_found",
          "fullTextLinks": []
        }
      ],
      "alternatives": [],
      "warnings": [],
      "checkedAt": "2026-07-27T07:00:00.000Z",
      "verificationUrl": "https://lib.inha.ac.kr/search"
    }
  ]
}
```

## Error behavior

Invalid tool arguments are returned as an MCP tool error before the handler runs. Upstream HTTP, timeout, malformed-response, and integration failures are ordinary structured results with `warnings`; they are not tool errors because a partial catalog or EBSCO result may still be useful.
