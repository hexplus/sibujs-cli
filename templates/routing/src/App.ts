import { div, nav, button, span, footer } from "sibujs";
import { Route, navigate } from "sibujs/plugins";
import { auth } from "./auth.ts";

function NavBar() {
  return nav({
    class: "nav",
    nodes: [
      div({
        class: "container",
        nodes: [
          span({ class: "nav-brand", nodes: "{{NAME}}" }),
          button({ class: "btn-link", nodes: "Home", on: { click: () => navigate("/") } }),
          button({ class: "btn-link", nodes: "About", on: { click: () => navigate("/about") } }),
          button({ class: "btn-link", nodes: "Dashboard", on: { click: () => navigate("/dashboard") } }),
          () => auth.isAuthenticated()
            ? button({
                class: "btn-link btn-danger ml-auto",
                nodes: "Logout",
                on: { click: () => { auth.logout(); navigate("/"); } },
              })
            : button({
                class: "btn-link ml-auto",
                style: { color: "var(--primary)" },
                nodes: "Login",
                on: { click: () => navigate("/login") },
              }),
        ],
      }),
    ],
  });
}

export function App() {
  return div({
    class: "page",
    nodes: [
      NavBar(),

      div({ class: "container", style: { flex: "1" }, nodes: [Route()] }),

      footer({
        class: "footer",
        nodes: [
          div({
            class: "container",
            nodes: "Built with Sibu — fine-grained reactivity, no virtual DOM.",
          }),
        ],
      }),
    ],
  });
}
