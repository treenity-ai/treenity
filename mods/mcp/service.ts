// MCP autostart service — starts/stops the MCP HTTP server via tree lifecycle

import { getComponent, register } from '@treenity/core';
import { createMcpHttpServer } from './mcp-server';
import { McpConfig } from './types';

register('mcp.server', 'service', async (node, ctx) => {
  const config = getComponent(node, McpConfig);
  const port = config?.port ?? (Number(process.env.MCP_PORT) || 3212);
  const server = createMcpHttpServer(ctx.tree, port);

  return {
    stop: async () => {
      server.close();
      console.log(`[mcp] stopped :${port}`);
    },
  };
});
