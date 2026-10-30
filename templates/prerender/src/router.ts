import { createRouter } from "sibujs/plugins";
import { head, routes } from "./routes.ts";

export function setupRouter() {
  // A static server serves `about/index.html` at `/about/`; "ignore" makes
  // that the /about route.
  createRouter(routes, { mode: "history", head, trailingSlash: "ignore" });
}
