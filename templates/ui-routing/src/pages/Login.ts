import { div, h1, p } from "sibujs";
import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from "sibujs-ui";
import { navigate } from "sibujs/plugins";
import { auth } from "../auth.ts";

export function Login() {
  function handleLogin() {
    auth.login();
    navigate("/dashboard");
  }

  return div({
    class: "max-w-sm mx-auto space-y-6",
    nodes: [
      h1({ class: "text-3xl font-bold tracking-tight text-center", nodes: "Login" }),
      Card({
        nodes: [
          CardHeader({
            nodes: [
              CardTitle({ nodes: "Sign in" }),
              CardDescription({ nodes: "Click below to simulate a login." }),
            ],
          }),
          CardContent({
            nodes: [
              Button({ class: "w-full", nodes: "Log in", on: { click: handleLogin } }),
            ],
          }),
        ],
      }),
    ],
  });
}
