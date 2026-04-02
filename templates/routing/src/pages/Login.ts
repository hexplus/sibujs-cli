import { div, h1, p, button } from "sibujs";
import { navigate } from "sibujs/plugins";
import { auth } from "../auth.ts";

export function Login() {
  function handleLogin() {
    auth.login();
    navigate("/dashboard");
  }

  return div({
    style: { maxWidth: "320px", margin: "0 auto", textAlign: "center" },
    nodes: [
      h1({ class: "page-title", nodes: "Login" }),
      p({ class: "desc", nodes: "Click below to simulate a login." }),
      button({ class: "btn btn-primary", nodes: "Log in", on: { click: handleLogin } }),
    ],
  });
}
