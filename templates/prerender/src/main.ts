import "./app.css";
import { mount } from "sibujs";
import { routerReady } from "sibujs/plugins";
import { hydrate } from "sibujs/ssr";
import { App } from "./App.ts";
import { setupRouter } from "./router.ts";

setupRouter();

const root = document.getElementById("app");
if (!root) {
  throw new Error('Root element with id "app" not found');
}

void routerReady().then(() => {
  // A pre-rendered page: bind to its nodes (images do not reload, typed input
  // stays). A browser-only route ships an empty shell: render it.
  if (root.hasChildNodes()) void hydrate(() => App(), root, { strategy: "adopt" });
  else mount(App, root);
});
