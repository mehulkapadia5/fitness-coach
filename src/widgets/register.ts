// Wire each widget HTML template into the MCP server as a `Resource`.
// ChatGPT fetches the resource by URI when it renders the corresponding
// tool's output template (set via `_meta.openai/outputTemplate`).
//
// MIME type `text/html;profile=mcp-app` tells the Apps SDK iframe runtime
// to treat the body as an MCP-app widget (subscribed to ui/notifications
// messages), not a generic HTML page.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WIDGETS } from './templates.js';

const APP_MIME = 'text/html;profile=mcp-app';

export function registerAllWidgets(server: McpServer): void {
  for (const w of WIDGETS) {
    server.registerResource(
      // Unique resource name (used in MCP server's internal registry).
      `widget:${w.uri}`,
      // The URI tools will reference via _meta.openai/outputTemplate.
      w.uri,
      // Resource metadata — kept minimal; mimeType + title are nice-to-have.
      {
        mimeType: APP_MIME,
        title: 'Fitness Coach widget',
      },
      // Read callback — fetches the resource on demand. We just return the
      // pre-built HTML string; ChatGPT caches it per session anyway.
      async () => ({
        contents: [
          {
            uri: w.uri,
            mimeType: APP_MIME,
            text: w.html,
            // `prefersBorder: true` asks ChatGPT to render the widget with
            // its own card chrome rather than inside our card-in-a-card.
            // We already render our own card so leave this off.
            _meta: {},
          },
        ],
      }),
    );
  }
}
