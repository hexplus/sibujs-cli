import { div, h1 } from "sibujs";
import { Card, CardHeader, CardTitle, CardDescription } from "sibujs-ui";

export function About() {
  return div({
    class: "space-y-6",
    nodes: [
      h1({ class: "text-3xl font-bold tracking-tight", nodes: "About" }),
      Card({
        nodes: [
          CardHeader({
            nodes: [
              CardTitle({ nodes: "About this app" }),
              CardDescription({ nodes: "This page demonstrates basic routing with sibujs-ui components." }),
            ],
          }),
        ],
      }),
    ],
  });
}
