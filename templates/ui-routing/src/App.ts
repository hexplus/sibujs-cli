import { div, span } from "sibujs";
import { Button } from "sibujs-ui";
import { Route, navigate } from "sibujs/plugins";
import { auth } from "./auth.ts";

function NavBar() {
  return div({
    class: "border-b",
    nodes: [
      div({
        class: "max-w-3xl mx-auto px-6 py-3 flex items-center gap-2",
        nodes: [
          span({ class: "font-bold mr-4", nodes: "{{NAME}}" }),
          Button({ variant: "ghost", size: "sm", nodes: "Home", on: { click: () => navigate("/") } }),
          Button({ variant: "ghost", size: "sm", nodes: "About", on: { click: () => navigate("/about") } }),
          Button({ variant: "ghost", size: "sm", nodes: "Dashboard", on: { click: () => navigate("/dashboard") } }),
          () => auth.isAuthenticated()
            ? Button({
                variant: "ghost", size: "sm", class: "ml-auto text-destructive",
                nodes: "Logout",
                on: { click: () => { auth.logout(); navigate("/"); } },
              })
            : Button({
                variant: "ghost", size: "sm", class: "ml-auto",
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
    class: "min-h-screen bg-background flex flex-col",
    nodes: [
      NavBar(),

      div({
        class: "max-w-3xl mx-auto px-6 py-8 flex-1 w-full",
        nodes: [Route()],
      }),

      div({
        class: "border-t mt-auto",
        nodes: [
          div({
            class: "max-w-3xl mx-auto px-6 py-6 text-center text-sm text-muted-foreground",
            nodes: "Built with Sibu + sibujs-ui.",
          }),
        ],
      }),
    ],
  });
}
