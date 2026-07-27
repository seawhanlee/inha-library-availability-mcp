#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';

export { createServer } from './server.js';
export { AvailabilityService } from './service.js';

export function isMainModule(moduleUrl: string, entryPoint = process.argv[1]): boolean {
  if (entryPoint === undefined) return false;
  return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(entryPoint);
}

if (isMainModule(import.meta.url)) {
  void serveStdio(() => createServer());
  console.error('Inha Library Availability MCP server running on stdio');
}
