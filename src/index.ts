#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';

export { createServer } from './server.js';
export { AvailabilityService } from './service.js';

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  void serveStdio(() => createServer());
  console.error('Inha Library Availability MCP server running on stdio');
}
