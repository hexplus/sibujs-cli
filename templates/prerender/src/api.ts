export interface Product {
  id: string;
  name: string;
  price: number;
  color: string;
}

/** Relative on purpose: the browser asks the site; the pre-renderer asks `prerender.fetch`. */
export async function fetchProducts(signal?: AbortSignal): Promise<Product[]> {
  const res = await fetch("/api/products.json", { signal });
  if (!res.ok) throw new Error(`GET /api/products.json failed: ${res.status}`);
  return (await res.json()) as Product[];
}
