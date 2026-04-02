import { div, h1, p } from "sibujs";

export function About() {
  return div({
    nodes: [
      h1({ class: "page-title", nodes: "About" }),
      p({ class: "page-text", nodes: "This page demonstrates basic routing." }),
    ],
  });
}
