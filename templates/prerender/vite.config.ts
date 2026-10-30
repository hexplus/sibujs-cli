import { readFile } from "node:fs/promises";
import { defineConfig } from "vite";
import { sibuVitePlugin } from "sibujs/build";
{{TAILWIND_IMPORT}}
// `vite build` (or `npm run build`) pre-renders every route of src/routes.ts
// into dist/: one HTML file per page with its content, <title>, description and
// Open Graph tags, plus 404.html, sitemap.xml and robots.txt. Any static server
// can serve dist/ (see README.md).
export default defineConfig({
  plugins: [
    {{TAILWIND_PLUGIN}}
    sibuVitePlugin({
      prerender: {
        server: "src/entry-server.ts",
        // The public URL of the site: canonical links and the sitemap use it.
        origin: "https://example.com",
        // Data at build time. Here the "API" is public/api/*.json; point this
        // at your real API instead: `fetch: "http://127.0.0.1:8000"`.
        fetch: async (input) => {
          const url = new URL(input instanceof Request ? input.url : String(input));
          const body = await readFile(new URL(`./public${url.pathname}`, import.meta.url));
          return new Response(body, { headers: { "content-type": "application/json" } });
        },
        hydration: "adopt",
        robots: true,
      },
    }),
  ],
});
