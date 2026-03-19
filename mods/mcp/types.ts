import { registerType } from '@treenity/core/comp';

export class McpConfig {
  port = 3212;
}
registerType('mcp.server', McpConfig);
