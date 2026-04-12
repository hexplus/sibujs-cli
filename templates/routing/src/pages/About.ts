import { div, h1, p } from "sibujs";

export function About() {
  return div([
    h1("page-title", "About"),
    p("page-text", "This page demonstrates basic routing."),
  ]);
}
