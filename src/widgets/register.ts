// Wire widget templates into the MCP server as `Resource`s.
//
// We support two formats:
//
//  1. Raw HTML iframes (mimeType `text/html;profile=mcp-app`) — the original
//     hand-rolled templates in templates.ts. These render as sandboxed
//     iframes inside ChatGPT and read structuredContent via postMessage.
//
//  2. ChatKit widget definitions (mimeType `application/vnd.openai.chatkit-widget+json`)
//     designed in widgets.chatkit.studio and exported as `.widget` JSON.
//     These contain a Jinja-like template plus a JSON Schema; ChatGPT
//     compiles them into native ChatKit components against the tool's
//     structuredContent.
//
// Tools choose which kind to use via `_meta["openai/outputTemplate"]`.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import healthOverviewWidget from './health-overview.widget.json';
import mealLogWidget from './meal-log.widget.json';
import { WIDGETS } from './templates.js';

const HTML_MIME = 'text/html;profile=mcp-app';
const CHATKIT_MIME = 'application/vnd.openai.chatkit-widget+json';

export const URI_HEALTH_OVERVIEW = 'ui://widget/health-overview.widget';
export const URI_MEAL_LOG = 'ui://widget/meal-log.widget';

const CHATKIT_WIDGETS: Array<{ uri: string; body: unknown; title: string }> = [
  {
    uri: URI_HEALTH_OVERVIEW,
    body: healthOverviewWidget,
    title: 'Health overview',
  },
  {
    uri: URI_MEAL_LOG,
    body: mealLogWidget,
    title: 'Meal log confirmation',
  },
];

export function registerAllWidgets(server: McpServer): void {
  // HTML iframe widgets (still used by log_workout + set_target until those
  // are designed in ChatKit Studio).
  for (const w of WIDGETS) {
    server.registerResource(
      `widget:${w.uri}`,
      w.uri,
      { mimeType: HTML_MIME, title: 'Fitness Coach widget' },
      async () => ({
        contents: [
          {
            uri: w.uri,
            mimeType: HTML_MIME,
            text: w.html,
            _meta: {},
          },
        ],
      }),
    );
  }

  // ChatKit widget definitions.
  for (const w of CHATKIT_WIDGETS) {
    server.registerResource(
      `widget:${w.uri}`,
      w.uri,
      { mimeType: CHATKIT_MIME, title: w.title },
      async () => ({
        contents: [
          {
            uri: w.uri,
            mimeType: CHATKIT_MIME,
            text: JSON.stringify(w.body),
            _meta: {},
          },
        ],
      }),
    );
  }
}
