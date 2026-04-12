import { div, h1 } from "sibujs";
import { navigate } from "sibujs/plugins";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "sibujs-ui";
import { auth } from "../auth.ts";

export function Login() {
  function handleLogin() {
    auth.login();
    navigate("/dashboard");
  }

  return div("max-w-sm mx-auto space-y-6", [
    h1("text-3xl font-bold tracking-tight text-center", "Login"),
    Card([
      CardHeader([
        CardTitle("Sign in"),
        CardDescription("Click below to simulate a login."),
      ]),
      CardContent([Button({ class: "w-full", on: { click: handleLogin } }, "Log in")]),
    ]),
  ]);
}
