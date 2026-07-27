# Development and releases

## Repository layout

```text
src/
  adapters/
    catalog.ts       Inha Pyxis search, detail, and holdings adapter
    eds.ts           EBSCO guest-token and search adapter
  config.ts          Environment-backed defaults
  http.ts            Timeout, retry, and memory cache utilities
  index.ts           Stdio executable entrypoint
  match.ts           Identifier/title/author/year matching
  normalize.ts       Metadata and HTML normalization
  server.ts          MCP tool registration
  service.ts         Source coordination and aggregation
  types.ts           Zod schemas and result types
test/
  fixtures/          Sanitized deterministic upstream responses
  *.test.ts          Unit, adapter, service, HTTP, and MCP tests
docs/                User and maintainer documentation
```

## Local workflow

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run TypeScript directly over stdio |
| `npm run inspect` | Launch MCP Inspector against the source server |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:live` | Run opt-in live Inha/EBSCO smoke tests |
| `npm pack --dry-run` | Review files that npm will publish |

Do not use `console.log` in runtime server code. stdout carries MCP protocol messages; diagnostics must use `console.error`.

## Tests

Normal CI is deterministic and does not depend on external uptime. Sanitized fixtures cover:

- available and checked-out catalog holdings;
- EBSCO full-text and citation-only records;
- empty and malformed responses;
- matching thresholds and identifier normalization;
- partial source failures and conservative aggregation;
- request retry/timeout and cache behavior;
- MCP discovery, valid calls, and invalid arguments;
- stable batch ordering.

Live tests are gated by `INHA_LIVE_TEST=1` and should not replace fixtures:

```sh
npm run test:live
```

When an upstream response shape changes, sanitize a minimal example before committing it. Remove personal data, session tokens, cookies, and licensed content.

## Adding or changing output fields

Update all of the following together:

1. TypeScript interfaces in `src/types.ts`;
2. `availabilityOutputSchema` in `src/types.ts`;
3. aggregation or adapter mapping code;
4. fixture-backed tests;
5. [tool reference](tool-reference.md).

The MCP SDK validates structured output against the registered schema, so interface-only changes are insufficient.

## Release process

CI runs on Node.js 20, 22, and 24. npm publication uses GitHub Actions and npm Trusted Publishing; no npm write token is stored in GitHub.

1. Start from a clean, up-to-date `main` branch.
2. Update the version in both `package.json` and `package-lock.json`.
3. Run typecheck, tests, build, and `npm pack --dry-run`.
4. Merge the release change to `main` through a reviewed pull request.
5. Create a GitHub release named `v<version>`.
6. Monitor `.github/workflows/publish.yml`.
7. Verify the npm version, `latest` dist-tag, and provenance attestation.

The workflow runs `scripts/verify-release-tag.mjs` and refuses a release tag that does not exactly match `package.json`.

Trusted Publisher configuration:

| Field | Value |
| --- | --- |
| Package | `inha-library-availability-mcp` |
| GitHub owner | `seawhanlee` |
| Repository | `inha-library-availability-mcp` |
| Workflow | `publish.yml` |
| Environment | `npm` |
| Allowed action | `npm publish` |

## Dependency updates

Dependabot checks npm and GitHub Actions weekly. Treat MCP beta SDK upgrades as API changes: read the upstream migration notes, run MCP-level tests, and inspect the generated tool schema before merging.
