import { a, div, each, h1, h3, p, when } from "sibujs";
import { query } from "sibujs/data";
import { fetchProducts } from "../api.ts";
import { Swatch } from "../components/Swatch.ts";

/** Fetched data: rendered at build time, handed to the browser, not fetched again while fresh. */
export function Products() {
  const products = query("/api/products.json", ({ signal }) => fetchProducts(signal), { staleTime: 60_000 });
  return div([
    h1("page-title", "Products"),
    when(
      () => products.data() !== undefined,
      () =>
        div("grid", [
          each(
            () => products.data() ?? [],
            (item) =>
              div("card", [
                Swatch(item().color),
                h3("heading", item().name),
                p("desc", `$${item().price}`),
                a({ class: "btn-ghost", href: `/products/${item().id}` }, "Details"),
              ]),
            { key: (x) => x.id },
          ),
        ]),
      () => p("page-text", "Loading products…"),
    ),
  ]);
}
