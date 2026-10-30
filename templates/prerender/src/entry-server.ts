// What the build-time pre-renderer renders: the same routes, head defaults and
// app shell the browser uses (vite.config.ts → `prerender.server`).
import { App } from "./App.ts";

export { head, routes } from "./routes.ts";
export const routerOptions = { trailingSlash: "ignore" as const };
export const app = () => App();
