import { div, h1, p } from "sibujs";
import { Card, CardHeader, CardTitle, CardDescription } from "sibujs-ui";

export function Home() {
  return div({
    class: "space-y-6",
    nodes: [
      h1({ class: "text-3xl font-bold tracking-tight", nodes: "Home" }),
      Card({
        nodes: [
          CardHeader({
            nodes: [
              CardTitle({ nodes: "Welcome" }),
              CardDescription({ nodes: "This is your new Sibu app with sibujs-ui components and routing." }),
            ],
          }),
        ],
      }),
      p({ class: "text-sm text-muted-foreground", nodes: "Navigate using the links above to explore nested and protected routes." }),
    ],
  });
}
