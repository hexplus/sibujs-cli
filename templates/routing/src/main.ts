import "./app.css";
import { mount } from "sibujs";
import { setupRouter } from "./router.ts";
import { App } from "./App.ts";

setupRouter();

const root = document.getElementById("app");
if (!root) {
  throw new Error('Root element with id "app" not found');
}
mount(App, root);
