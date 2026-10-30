import { div, h1, p, when } from "sibujs";
import { query } from "sibujs/data";
import { route } from "sibujs/plugins";
import { fetchProducts } from "../api.ts";

/** `/products/:id` — one page per product (`getStaticPaths` in routes.ts). */
export function ProductPage() {
  const id = route().params.id;
  const products = query("/api/products.json", ({ signal }) => fetchProducts(signal), { staleTime: 60_000 });
  return div([
    when(
      () => products.data()?.find((x) => x.id === id),
      () => {
        const product = products.data()?.find((x) => x.id === id);
        return div("card", [h1("page-title", product?.name ?? ""), p("page-text", `$${product?.price ?? ""}`)]);
      },
      () => p("page-text", "Loading…"),
    ),
  ]);
}
