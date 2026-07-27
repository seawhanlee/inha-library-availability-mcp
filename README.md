# Inha Library Availability MCP Server

[![CI](https://github.com/seawhanlee/inha-library-availability-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/seawhanlee/inha-library-availability-mcp/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/inha-library-availability-mcp)](https://www.npmjs.com/package/inha-library-availability-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A local stdio [Model Context Protocol](https://modelcontextprotocol.io/) server that checks point-in-time availability in Inha University Library's public systems.

It combines:

- physical catalog records and live circulation states from Inha's public Pyxis catalog;
- article and e-book listings from Inha's public EBSCO EDS guest integration.

It does not log in, reserve or borrow materials, bypass network restrictions, or download protected content.

## Documentation

- [Installation and MCP client setup](docs/installation.md)
- [Tool and result reference](docs/tool-reference.md)
- [Architecture and matching behavior](docs/architecture.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Development and releases](docs/development.md)

## Requirements and setup

- Node.js 20 or newer
- npm

```sh
npm install
npm run build
npm test
```

Install the published package globally with:

```sh
npm install --global inha-library-availability-mcp
```

For a no-install setup, configure an MCP client to launch:

```sh
npx -y inha-library-availability-mcp@1.0.1
```

Run the stdio server with either:

```sh
npm run dev
node dist/index.js
```

Do not type requests into the server manually: an MCP host launches it and communicates over stdin/stdout. Diagnostics go only to stderr.

## Tool

The server exposes one tool: `check_inha_library_availability`.

```json
{
  "materials": [
    {
      "title": "A known title",
      "authors": ["First Author"],
      "year": 2024,
      "type": "article",
      "doi": "10.1000/example"
    },
    {
      "title": "A known book",
      "isbn": "978-1-234-56789-0"
    }
  ],
  "maxCandidates": 5
}
```

`materials` may be one object or an array of 1–20 objects. `title` is required. Optional fields are `authors`, `year`, `type`, `isbn`, `issn`, and `doi`. `maxCandidates` is 1–10 and defaults to 5.

Every result includes a status, confidence, confirmed match when one exists, physical holdings, electronic findings, alternatives, source warnings, a timestamp, and an Inha verification URL. The status values are:

- `available_now`: a `READY`/대출가능 physical copy or explicit electronic full-text link was found;
- `held_but_unavailable`: a matching physical record has no currently available copy;
- `listed_access_uncertain`: an electronic citation/subscription listing exists but access was not confirmed;
- `not_found`: all queried sources responded and no plausible match was found;
- `ambiguous`: plausible candidates need user verification;
- `unknown`: one or more required upstream checks failed and absence cannot be concluded.

Electronic links may still require an Inha login or campus network. Results are point-in-time observations.

## Host configuration

See the [installation guide](docs/installation.md) for npm, `npx`, source builds, Windows examples, environment variables, updates, and uninstallation.

Build first, then replace `/absolute/path/to/Book Search MCP` below with this repository's absolute path.

### Codex

Add a stdio MCP server to your Codex configuration using the command and arguments below (the surrounding configuration format may vary by Codex version):

```toml
[mcp_servers.inha_library]
command = "node"
args = ["/absolute/path/to/Book Search MCP/dist/index.js"]
```

### Claude Desktop

Add this entry under `mcpServers` in Claude Desktop's configuration:

```json
{
  "mcpServers": {
    "inha-library": {
      "command": "node",
      "args": ["/absolute/path/to/Book Search MCP/dist/index.js"]
    }
  }
}
```

### Cursor

Add the same stdio definition to Cursor's MCP configuration:

```json
{
  "mcpServers": {
    "inha-library": {
      "command": "node",
      "args": ["/absolute/path/to/Book Search MCP/dist/index.js"]
    }
  }
}
```

To exercise the server directly with MCP Inspector:

```sh
npm run inspect
```

## Configuration

Defaults track Inha's public guest-facing integration. Override them if the institution changes its endpoints/profile:

| Variable | Default / purpose |
| --- | --- |
| `INHA_CATALOG_BASE_URL` | `https://lib.inha.ac.kr/pyxis-api` |
| `INHA_CATALOG_COLLECTION_ID` | `1` |
| `INHA_SEARCH_URL` | `https://lib.inha.ac.kr/search` |
| `INHA_EDS_WIDGET_URL` | EBSCO encrypted-key guest widget URL |
| `INHA_EDS_KEY` | Public encrypted key embedded in Inha's website |
| `INHA_EDS_PROFILE` | Inha's public EDS profile |
| `INHA_EDS_SESSION_KEY` | EDS widget session capability string |
| `INHA_SOURCE_TIMEOUT_MS` | `8000` |
| `INHA_CACHE_TTL_MS` | `300000` (five minutes) |
| `INHA_BATCH_CONCURRENCY` | `4` |

Each source request has an eight-second default timeout and one retry for transient failures. Query results are cached in memory for five minutes; restarting the process clears the cache.

## Development and tests

```sh
npm run typecheck
npm run build
npm test
```

Normal tests use committed sanitized fixtures and never depend on Inha or EBSCO uptime. Optional live smoke tests are explicitly gated:

```sh
npm run test:live
```

The MCP TypeScript v2 package is currently beta; dependency versions are pinned in `package.json` and `package-lock.json` so upstream API changes do not silently alter this server.

## Releases

GitHub Actions runs typechecking, tests, builds, and package verification on Node.js 20, 22, and 24 for every pull request and push to `main`.

Publishing a GitHub release whose tag matches `v<package.json version>` triggers `.github/workflows/publish.yml`. The workflow uses npm Trusted Publishing (OIDC) to publish the public package with provenance and does not require a long-lived npm token. Configure the package's trusted publisher with:

- npm package: `inha-library-availability-mcp`
- GitHub owner: `seawhanlee`
- GitHub repository: `inha-library-availability-mcp`
- workflow filename: `publish.yml`
- environment: `npm`
- allowed action: `npm publish`

The release job intentionally refuses tags that do not exactly match the package version.
