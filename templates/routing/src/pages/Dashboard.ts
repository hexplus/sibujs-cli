import { div, h1, h2, p, button } from "sibujs";
import { Outlet, navigate } from "sibujs/plugins";

export function Dashboard() {
  return div({
    nodes: [
      h1({ class: "page-title", nodes: "Dashboard" }),

      div({
        class: "row",
        style: { marginBottom: "24px" },
        nodes: [
          button({ class: "btn", nodes: "Overview", on: { click: () => navigate("/dashboard") } }),
          button({ class: "btn", nodes: "Settings", on: { click: () => navigate("/dashboard/settings") } }),
        ],
      }),

      div({ class: "panel", nodes: [Outlet()] }),
    ],
  });
}

export function DashboardOverview() {
  return div({
    nodes: [
      h2({ class: "section-title", nodes: "Overview" }),
      p({ class: "page-text text-sm", nodes: "This is a nested route rendered inside the Dashboard layout via Outlet." }),
    ],
  });
}

export function DashboardSettings() {
  return div({
    nodes: [
      h2({ class: "section-title", nodes: "Settings" }),
      p({ class: "page-text text-sm", nodes: "Adjust your preferences here." }),
    ],
  });
}
