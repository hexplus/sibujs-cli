import { button, div, footer, nav, span } from "sibujs";
import { navigate, route, Route } from "sibujs/plugins";
import { auth } from "./auth.ts";

function NavLink(path: string, label: string) {
  const isActive = () => {
    const current = route().path;
    return path === "/" ? current === "/" : current === path || current.startsWith(`${path}/`);
  };
  return button(
    {
      class: () => (isActive() ? "btn-link btn-link-active" : "btn-link"),
      on: { click: () => navigate(path) },
    },
    label,
  );
}

function NavBar() {
  return nav("nav", [
    div("container", [
      span("nav-brand", "{{NAME}}"),
      NavLink("/", "Home"),
      NavLink("/about", "About"),
      NavLink("/dashboard", "Dashboard"),
      () =>
        auth.isAuthenticated()
          ? button(
              {
                class: "btn-link btn-danger ml-auto",
                on: {
                  click: () => {
                    auth.logout();
                    navigate("/");
                  },
                },
              },
              "Logout",
            )
          : button(
              {
                class: "btn-link ml-auto",
                style: { color: "var(--primary)" },
                on: { click: () => navigate("/login") },
              },
              "Login",
            ),
    ]),
  ]);
}

export function App() {
  return div("page", [
    NavBar(),

    div({ class: "container", style: { flex: "1" } }, [Route()]),

    footer("footer", [
      div("container", "Built with Sibu — fine-grained reactivity, no virtual DOM."),
    ]),
  ]);
}
