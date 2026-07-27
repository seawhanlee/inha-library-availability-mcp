import { McpServer } from '@modelcontextprotocol/server';
import { AvailabilityService, summarize } from './service.js';
import { availabilityInputSchema, availabilityOutputSchema, type AvailabilityInput } from './types.js';

export const TOOL_NAME = 'check_inha_library_availability';

export function createServer(service = new AvailabilityService()): McpServer {
  const server = new McpServer({ name: 'inha-library-availability', version: '1.0.0' });
  server.registerTool(
    TOOL_NAME,
    {
      description: 'Check current Inha University Library physical holdings and public EBSCO electronic listings for one or more known materials. Results are point-in-time and do not reserve, borrow, authenticate, or download content.',
      inputSchema: availabilityInputSchema,
      outputSchema: availabilityOutputSchema
    },
    async (args) => {
      const structuredContent = await service.check(args as AvailabilityInput);
      return { content: [{ type: 'text', text: summarize(structuredContent) }], structuredContent };
    }
  );
  return server;
}
