// The server side of the app: what the build-time pre-renderer renders
// (vite.config.ts → `prerender.server`) and what server.mjs renders per request.
import { App } from "./App.ts";

export { head, routes } from "./routes.ts";
export const routerOptions = { trailingSlash: "ignore" as const };
export const app = () => App();
// From this bundle, so the handler and the routes share one copy of SibuJS.
export { createRenderHandler } from "sibujs/ssr";
