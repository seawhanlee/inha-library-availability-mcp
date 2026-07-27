# Troubleshooting

## The MCP client reports that the server disconnected

Check Node.js and the command first:

```sh
node --version
npx -y inha-library-availability-mcp@1.0.1 </dev/null
```

Node.js must be version 20 or newer. When stdin closes, the server should exit normally after writing its startup message to stderr.

For source builds, confirm that the build exists:

```sh
npm ci
npm run build
node dist/index.js </dev/null
```

Use absolute paths in MCP configuration. JSON backslashes on Windows must be doubled.

## The client cannot find `inha-library-availability-mcp`

This usually means the global npm executable directory is not on the environment inherited by the desktop application. Either:

- use the `npx` configuration from the [installation guide](installation.md); or
- find the global prefix with `npm prefix --global` and add its executable directory to `PATH`.

GUI applications may need to be fully restarted after a `PATH` change.

## A result is `unknown`

`unknown` is intentional when an upstream source fails. Inspect the result's `warnings` array. Common causes include:

- temporary Inha or EBSCO downtime;
- network/DNS filtering;
- an expired or changed public EBSCO profile/key;
- a request timeout;
- an upstream response-format change.

Try the direct `verificationUrl`, retry after a few minutes, or increase the timeout:

```json
{
  "env": {
    "INHA_SOURCE_TIMEOUT_MS": "15000"
  }
}
```

The server never converts an upstream failure into `not_found`.

## EBSCO is unavailable but catalog results work

Physical and electronic sources fail independently. A catalog match remains usable and includes an EBSCO warning. If Inha has changed its public EDS integration, override:

```text
INHA_EDS_KEY
INHA_EDS_PROFILE
INHA_EDS_WIDGET_URL
```

Only use values publicly provided by Inha. Do not place personal credentials in these variables.

## An electronic link asks for login

This is expected. `available_now` for electronic material means Inha exposes a full-text/access link. Publisher licensing, off-campus proxy rules, or institutional login can still apply. Check `electronicFindings[].accessStatus` and `note`.

## A title is marked ambiguous

Provide more metadata:

1. ISBN, ISSN, or DOI;
2. author names;
3. publication year;
4. a complete title including subtitle or volume.

Conflicting editions or years deliberately remain ambiguous even when their titles are similar.

## A recent circulation change is not visible

Results are cached for five minutes by default. Restart the MCP process, wait for the cache to expire, or lower `INHA_CACHE_TTL_MS`. Avoid disabling caching permanently because every tool call reaches public upstream services.

## Inspect protocol calls

From the repository:

```sh
npm run inspect
```

Or against npm:

```sh
npx @modelcontextprotocol/inspector npx -y inha-library-availability-mcp@1.0.1
```

Server diagnostics appear on stderr. stdout must remain reserved for MCP JSON-RPC traffic.

## Reporting a problem

Open a [GitHub issue](https://github.com/seawhanlee/inha-library-availability-mcp/issues) with:

- Node.js version;
- operating system and MCP client;
- sanitized input (omit anything sensitive);
- returned status and warnings;
- whether the direct Inha search works.

Do not include npm tokens, cookies, login credentials, or private full-text URLs.
