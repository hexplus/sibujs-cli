import { a, div, h1, p } from "sibujs";
import { route } from "sibujs/plugins";

/** The `*` route: answers 404, and becomes dist/404.html. */
export function NotFound() {
  return div([
    h1("page-title", "Page not found"),
    p("page-text", () => `Nothing lives at ${route().path}.`),
    a({ class: "btn-ghost", href: "/" }, "Back home"),
  ]);
}
