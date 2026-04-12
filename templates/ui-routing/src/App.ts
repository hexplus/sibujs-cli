import { div, span } from "sibujs";
import { navigate, route, Route } from "sibujs/plugins";
import { Button } from "sibujs-ui";
import { auth } from "./auth.ts";

function NavLink(path: string, label: string) {
  const isActive = () => {
    const current = route().path;
    return path === "/" ? current === "/" : current === path || current.startsWith(`${path}/`);
  };
  return Button(
    {
      variant: "ghost",
      size: "sm",
      class: () => (isActive() ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""),
      on: { click: () => navigate(path) },
    },
    label,
  );
}

function NavBar() {
  return div("border-b", [
    div("max-w-3xl mx-auto px-6 py-3 flex items-center gap-2", [
      span("font-bold mr-4", "{{NAME}}"),
      NavLink("/", "Home"),
      NavLink("/about", "About"),
      NavLink("/dashboard", "Dashboard"),
      () =>
        auth.isAuthenticated()
          ? Button(
              {
                variant: "ghost",
                size: "sm",
                class: "ml-auto text-destructive",
                on: {
                  click: () => {
                    auth.logout();
                    navigate("/");
                  },
                },
              },
              "Logout",
            )
          : Button(
              {
                variant: "ghost",
                size: "sm",
                class: "ml-auto",
                on: { click: () => navigate("/login") },
              },
              "Login",
            ),
    ]),
  ]);
}

export function App() {
  return div("min-h-screen bg-background flex flex-col", [
    NavBar(),

    div("max-w-3xl mx-auto px-6 py-8 flex-1 w-full", [Route()]),

    div("border-t mt-auto", [
      div("max-w-3xl mx-auto px-6 py-6 text-center text-sm text-muted-foreground", "Built with Sibu + sibujs-ui."),
    ]),
  ]);
}
