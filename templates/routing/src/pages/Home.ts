import { div, h1, p } from "sibujs";

export function Home() {
  return div({
    nodes: [
      h1({ class: "page-title", nodes: "Home" }),
      p({ class: "page-text", nodes: "Welcome to your new Sibu app." }),
    ],
  });
}
