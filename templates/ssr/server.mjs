// Production server: static assets from dist/, HTML rendered per request.
//
//   npm run build   # client bundle (dist/) + server bundle (dist-server/)
//   npm start       # http://localhost:3000
//
// Every page is rendered through the router (status codes, redirects, <head>,
// fetched data), cached in memory per URL for a minute, and adopted by the
// browser. Put it behind your backend or a CDN; `POST /__invalidate` drops the
// cache after a data change.

import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { app, createRenderHandler, head, routerOptions, routes } from "./dist-server/entry-server.js";

const dist = fileURLToPath(new URL("./dist/", import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const API = process.env.API_URL ?? `http://127.0.0.1:${port}`;

// The app fetches relative URLs (`/api/...`); on the server they go to the API.
const nodeFetch = globalThis.fetch;
globalThis.fetch = (input, init) =>
  nodeFetch(typeof input === "string" && input.startsWith("/") ? API + input : input, init);

// The built shell carries the hashed client bundle and stylesheet tags
// (200.html: the untouched copy the pre-renderer keeps).
const shell = await readFile(join(dist, "200.html"), "utf8").catch(() => readFile(join(dist, "index.html"), "utf8"));
const scripts = [...shell.matchAll(/<script type="module"[^>]*src="([^"]+)"/g)].map((m) => m[1]);
const links = [...shell.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => ({ rel: "stylesheet", href: m[1] }));

let version = 1;
const render = createRenderHandler(routes, {
  app,
  router: { ...routerOptions, head },
  hydration: "adopt",
  document: { scripts, links },
  cache: { version: () => version, ttl: 60_000 },
});

const TYPES = { ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/__invalidate") {
    version++;
    res.writeHead(204).end();
    return;
  }
  // Static files (the hashed bundle is immutable).
  const file = normalize(join(dist, decodeURIComponent(url.pathname)));
  if (file.startsWith(dist) && extname(file)) {
    try {
      if ((await stat(file)).isFile()) {
        const immutable = url.pathname.startsWith("/assets/");
        res.writeHead(200, {
          "content-type": TYPES[extname(file)] ?? "application/octet-stream",
          ...(immutable ? { "cache-control": "public, max-age=31536000, immutable" } : {}),
        });
        res.end(await readFile(file));
        return;
      }
    } catch {}
  }
  const response = await render(new Request(new URL(url.pathname + url.search, `http://${req.headers.host}`), { method: req.method }));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`http://localhost:${port}`));
