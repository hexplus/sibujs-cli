import { button, div, h1, h2, p } from "sibujs";
import { navigate, Outlet, route } from "sibujs/plugins";

function TabButton(path: string, label: string) {
  const isActive = () => route().path === path;
  return button(
    {
      class: () => (isActive() ? "btn btn-active" : "btn"),
      on: { click: () => navigate(path) },
    },
    label,
  );
}

export function Dashboard() {
  return div([
    h1("page-title", "Dashboard"),

    div({ class: "row", style: { marginBottom: "24px" } }, [
      TabButton("/dashboard", "Overview"),
      TabButton("/dashboard/settings", "Settings"),
    ]),

    div("panel", [Outlet()]),
  ]);
}

export function DashboardOverview() {
  return div([
    h2("section-title", "Overview"),
    p("page-text text-sm", "This is a nested route rendered inside the Dashboard layout via Outlet."),
  ]);
}

export function DashboardSettings() {
  return div([
    h2("section-title", "Settings"),
    p("page-text text-sm", "Adjust your preferences here."),
  ]);
}
