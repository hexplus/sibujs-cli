import type { RouteDef, RouterHeadOptions } from "sibujs/plugins";
import { auth } from "./auth.ts";
import { fetchProducts } from "./api.ts";
import { About } from "./pages/About.ts";
import { Dashboard, DashboardOverview, DashboardSettings } from "./pages/Dashboard.ts";
import { Home } from "./pages/Home.ts";
import { Login } from "./pages/Login.ts";
import { NotFound } from "./pages/NotFound.ts";
import { ProductPage } from "./pages/Product.ts";
import { Products } from "./pages/Products.ts";

const SITE = "https://example.com";

/** Head defaults every route inherits; a route's own `head` wins field by field. */
export const head: RouterHeadOptions = {
  title: "{{NAME}}",
  titleTemplate: "%s · {{NAME}}",
  description: "Built with SibuJS.",
  og: { siteName: "{{NAME}}", type: "website", image: `${SITE}/og.png` },
  twitter: { card: "summary_large_image" },
};

export const routes: RouteDef[] = [
  { path: "/", component: Home, head: { title: "Home", canonical: `${SITE}/` } },
  { path: "/about", component: About, head: { title: "About", description: "What this app is." } },
  {
    path: "/products",
    component: Products,
    head: { title: "Products", description: "Everything we sell." },
  },
  {
    path: "/products/:id",
    component: ProductPage,
    head: { title: (r) => `Product ${r.params.id}`, canonical: (r) => `${SITE}/products/${r.params.id}` },
    // One pre-rendered page per product.
    getStaticPaths: async () => (await fetchProducts()).map((p) => ({ id: p.id })),
  },
  { path: "/login", component: Login, render: "client", head: { title: "Log in", robots: "noindex" } },
  {
    path: "/dashboard",
    component: Dashboard,
    // Browser only: per-user, never pre-rendered, never indexed.
    render: "client",
    head: { title: "Dashboard", robots: "noindex, nofollow" },
    beforeEnter: () => {
      if (!auth.isAuthenticated()) return "/login";
      return true;
    },
    children: [
      { path: "", component: DashboardOverview },
      { path: "/settings", component: DashboardSettings },
    ],
  },
  { path: "*", component: NotFound, status: 404, head: { title: "Not found", robots: "noindex" } },
];
