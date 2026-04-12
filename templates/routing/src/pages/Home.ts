import { div, h1, p } from "sibujs";

export function Home() {
  return div([
    h1("page-title", "Home"),
    p("page-text", "Welcome to your new Sibu app."),
  ]);
}
