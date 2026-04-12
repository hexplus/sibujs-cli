import { div, h1, h2, p } from "sibujs";
import { navigate, Outlet, route } from "sibujs/plugins";
import { Button, Card, CardContent } from "sibujs-ui";

function TabButton(path: string, label: string) {
  const isActive = () => route().path === path;
  return Button(
    {
      variant: "outline",
      size: "sm",
      class: () => (isActive() ? "bg-primary text-primary-foreground hover:bg-primary/90 border-primary" : ""),
      on: { click: () => navigate(path) },
    },
    label,
  );
}

export function Dashboard() {
  return div("space-y-6", [
    h1("text-3xl font-bold tracking-tight", "Dashboard"),

    div("flex gap-2", [
      TabButton("/dashboard", "Overview"),
      TabButton("/dashboard/settings", "Settings"),
    ]),

    Card([CardContent({ class: "pt-6" }, [Outlet()])]),
  ]);
}

export function DashboardOverview() {
  return div([
    h2("text-xl font-semibold mb-2", "Overview"),
    p("text-sm text-muted-foreground", "This is a nested route rendered inside the Dashboard layout via Outlet."),
  ]);
}

export function DashboardSettings() {
  return div([
    h2("text-xl font-semibold mb-2", "Settings"),
    p("text-sm text-muted-foreground", "Adjust your preferences here."),
  ]);
}
