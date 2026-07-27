# Installation and client setup

This server uses the local MCP `stdio` transport. An MCP client starts the process, sends protocol messages through stdin, and reads responses from stdout. You do not run a web server or configure a listening port.

## Requirements

- Node.js 20 or newer
- Internet access to `lib.inha.ac.kr` and `widgets.ebscohost.com`
- An MCP-compatible client

No Inha account or library credentials are required. Electronic links returned by the server may still require institutional authentication when opened.

## Option 1: run with npx

This is the simplest installation because npm downloads and caches the published package automatically:

```json
{
  "mcpServers": {
    "inha-library": {
      "command": "npx",
      "args": ["-y", "inha-library-availability-mcp@1.0.1"]
    }
  }
}
```

Pinning the version makes client behavior reproducible. Change `1.0.1` deliberately when upgrading, or use `@latest` if automatic upgrades are preferred.

## Option 2: global npm installation

Install the command:

```sh
npm install --global inha-library-availability-mcp
```

Then configure the client:

```json
{
  "mcpServers": {
    "inha-library": {
      "command": "inha-library-availability-mcp"
    }
  }
}
```

If the client cannot find the command, run `npm prefix --global` and ensure the corresponding global executable directory is on the client's `PATH`.

## Option 3: build from source

```sh
git clone https://github.com/seawhanlee/inha-library-availability-mcp.git
cd inha-library-availability-mcp
npm ci
npm run build
```

Configure the client with an absolute path:

```json
{
  "mcpServers": {
    "inha-library": {
      "command": "node",
      "args": ["/absolute/path/to/inha-library-availability-mcp/dist/index.js"]
    }
  }
}
```

Windows example:

```json
{
  "mcpServers": {
    "inha-library": {
      "command": "node",
      "args": ["C:\\Users\\your-name\\inha-library-availability-mcp\\dist\\index.js"]
    }
  }
}
```

Paths in JSON use escaped backslashes. Restart the MCP client after changing its configuration.

## Client-specific configuration shapes

### Codex

```toml
[mcp_servers.inha_library]
command = "npx"
args = ["-y", "inha-library-availability-mcp@1.0.1"]
```

### Claude Desktop and Cursor

Both accept the generic `mcpServers` JSON shape shown above. Add the `inha-library` entry alongside existing servers rather than replacing the entire configuration file.

## Environment variables

Environment overrides can be supplied by the MCP client. For example:

```json
{
  "mcpServers": {
    "inha-library": {
      "command": "npx",
      "args": ["-y", "inha-library-availability-mcp@1.0.1"],
      "env": {
        "INHA_SOURCE_TIMEOUT_MS": "12000",
        "INHA_CACHE_TTL_MS": "600000"
      }
    }
  }
}
```

Available variables:

| Variable | Default | Purpose |
| --- | ---: | --- |
| `INHA_CATALOG_BASE_URL` | `https://lib.inha.ac.kr/pyxis-api` | Pyxis API base URL |
| `INHA_CATALOG_COLLECTION_ID` | `1` | Catalog collection searched |
| `INHA_SEARCH_URL` | `https://lib.inha.ac.kr/search` | Human verification link |
| `INHA_EDS_WIDGET_URL` | Public EBSCO widget | EDS proxy endpoint |
| `INHA_EDS_KEY` | Inha public encrypted key | Override when Inha changes its integration |
| `INHA_EDS_PROFILE` | Inha public EDS profile | Override when the profile changes |
| `INHA_EDS_SESSION_KEY` | `0,0,1,0,0,0` | Public widget capability/session key |
| `INHA_SOURCE_TIMEOUT_MS` | `8000` | Timeout for an upstream request |
| `INHA_CACHE_TTL_MS` | `300000` | In-memory query-cache lifetime |
| `INHA_BATCH_CONCURRENCY` | `4` | Maximum simultaneous batch items |

## Verify the installation

From a source checkout, launch MCP Inspector:

```sh
npm run inspect
```

For a published installation:

```sh
npx @modelcontextprotocol/inspector npx -y inha-library-availability-mcp@1.0.1
```

Connect, open the Tools panel, and call `check_inha_library_availability` with:

```json
{
  "materials": {
    "title": "해리 포터.2, 죽음의 성물",
    "authors": "롤링",
    "year": 2020
  }
}
```

## Update or uninstall

Global installation:

```sh
npm update --global inha-library-availability-mcp
npm uninstall --global inha-library-availability-mcp
```

Source installation:

```sh
git pull --ff-only
npm ci
npm run build
```

Restart the MCP client after an update.
