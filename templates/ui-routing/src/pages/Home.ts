import { div, h1, p } from "sibujs";
import { Card, CardDescription, CardHeader, CardTitle } from "sibujs-ui";

export function Home() {
  return div("space-y-6", [
    h1("text-3xl font-bold tracking-tight", "Home"),
    Card([
      CardHeader([
        CardTitle("Welcome"),
        CardDescription("This is your new Sibu app with sibujs-ui components and routing."),
      ]),
    ]),
    p("text-sm text-muted-foreground", "Navigate using the links above to explore nested and protected routes."),
  ]);
}
