import { button, div, h1, p } from "sibujs";
import { navigate } from "sibujs/plugins";
import { auth } from "../auth.ts";

export function Login() {
  function handleLogin() {
    auth.login();
    navigate("/dashboard");
  }

  return div({ style: { maxWidth: "320px", margin: "0 auto", textAlign: "center" } }, [
    h1("page-title", "Login"),
    p("desc", "Click below to simulate a login."),
    button({ class: "btn btn-primary", on: { click: handleLogin } }, "Log in"),
  ]);
}
