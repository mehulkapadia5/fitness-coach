// Icon served from the Worker at /icon.svg and /favicon.ico, also referenced
// from serverInfo.icons so Claude.ai can pick it up via MCP `initialize`.
//
// Design: light green rounded square. Centered black silhouette of a head
// and shoulders. The headband reads as a green stripe across the forehead
// (negative space) with a small knot on the side.

const GREEN = '#A7F0BA';
const BLACK = '#000000';

export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <rect width="256" height="256" rx="48" fill="${GREEN}"/>
  <g fill="${BLACK}">
    <circle cx="128" cy="108" r="54"/>
    <path d="M 86 158 L 170 158 Q 218 172 218 222 L 218 232 Q 218 240 210 240 L 46 240 Q 38 240 38 232 L 38 222 Q 38 172 86 158 Z"/>
  </g>
  <g fill="${GREEN}">
    <rect x="68" y="88" width="120" height="18"/>
    <polygon points="186,86 208,80 210,116 186,108"/>
  </g>
</svg>`;

export function iconResponse(): Response {
  return new Response(ICON_SVG, {
    status: 200,
    headers: {
      'content-type': 'image/svg+xml',
      // Long cache: the SVG is checksum-stable, redeploys with a new design
      // get a new bundle hash so clients revalidate.
      'cache-control': 'public, max-age=86400',
    },
  });
}
