import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createServer, TOOL_NAME } from '../src/server.js';
import { AvailabilityService, type AvailabilitySources } from '../src/service.js';

const open: Array<{ close(): Promise<void> }> = [];
afterEach(async () => { await Promise.all(open.splice(0).map((item) => item.close())); });

async function connectedClient() {
  const empty = { search: async () => ({ candidates: [], failed: false }) };
  const service = new AvailabilityService({ ...loadConfig({}), concurrency: 4 }, { catalog: empty, eds: empty } satisfies AvailabilitySources);
  const server = createServer(service);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  open.push(client, server);
  return client;
}

describe('MCP interface', () => {
  it('discovers the availability tool and returns structured plus text content', async () => {
    const client = await connectedClient();
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toContain(TOOL_NAME);
    const result = await client.callTool({ name: TOOL_NAME, arguments: { materials: { title: 'No such title' } } });
    expect(result.structuredContent).toMatchObject({ results: [{ status: 'not_found' }] });
    expect(result.content[0]).toMatchObject({ type: 'text' });
  });

  it('rejects invalid arguments before the handler runs', async () => {
    const client = await connectedClient();
    const result = await client.callTool({ name: TOOL_NAME, arguments: { materials: [] } });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringMatching(/invalid|argument/i) });
  });
});
