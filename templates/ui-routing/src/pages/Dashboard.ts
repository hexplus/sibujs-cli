import { div, h1, h2, p } from "sibujs";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from "sibujs-ui";
import { Outlet, navigate } from "sibujs/plugins";

export function Dashboard() {
  return div({
    class: "space-y-6",
    nodes: [
      h1({ class: "text-3xl font-bold tracking-tight", nodes: "Dashboard" }),

      div({
        class: "flex gap-2",
        nodes: [
          Button({ variant: "outline", size: "sm", nodes: "Overview", on: { click: () => navigate("/dashboard") } }),
          Button({ variant: "outline", size: "sm", nodes: "Settings", on: { click: () => navigate("/dashboard/settings") } }),
        ],
      }),

      Card({
        nodes: [
          CardContent({ class: "pt-6", nodes: [Outlet()] }),
        ],
      }),
    ],
  });
}

export function DashboardOverview() {
  return div({
    nodes: [
      h2({ class: "text-xl font-semibold mb-2", nodes: "Overview" }),
      p({ class: "text-sm text-muted-foreground", nodes: "This is a nested route rendered inside the Dashboard layout via Outlet." }),
    ],
  });
}

export function DashboardSettings() {
  return div({
    nodes: [
      h2({ class: "text-xl font-semibold mb-2", nodes: "Settings" }),
      p({ class: "text-sm text-muted-foreground", nodes: "Adjust your preferences here." }),
    ],
  });
}
