import { div, h1 } from "sibujs";
import { Card, CardDescription, CardHeader, CardTitle } from "sibujs-ui";

export function About() {
  return div("space-y-6", [
    h1("text-3xl font-bold tracking-tight", "About"),
    Card([
      CardHeader([
        CardTitle("About this app"),
        CardDescription("This page demonstrates basic routing with sibujs-ui components."),
      ]),
    ]),
  ]);
}
