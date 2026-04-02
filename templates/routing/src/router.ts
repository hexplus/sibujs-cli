import { createRouter } from "sibujs/plugins";
import type { RouteDef } from "sibujs/plugins";
import { auth } from "./auth.ts";
import { Home } from "./pages/Home.ts";
import { About } from "./pages/About.ts";
import { Dashboard, DashboardOverview, DashboardSettings } from "./pages/Dashboard.ts";
import { Login } from "./pages/Login.ts";

const routes: RouteDef[] = [
  { path: "/", component: Home },
  { path: "/about", component: About },
  { path: "/login", component: Login },
  {
    path: "/dashboard",
    component: Dashboard,
    beforeEnter: () => {
      if (!auth.isAuthenticated()) return "/login";
      return true;
    },
    children: [
      { path: "", component: DashboardOverview },
      { path: "/settings", component: DashboardSettings },
    ],
  },
];

export function setupRouter() {
  createRouter(routes, { mode: "history" });
}
