import { canvas, ClientOnly, onMount, span } from "sibujs";

/**
 * A color swatch drawn on a <canvas> — browser only. The server (and the first
 * paint) shows a same-size plain <span>; `ClientOnly` swaps the canvas in once
 * the browser has taken over, without a layout jump.
 */
export function Swatch(color: string) {
  return ClientOnly(
    () => {
      const el = canvas({ class: "swatch", width: "32", height: "32" });
      onMount(() => {
        const ctx = (el as HTMLCanvasElement).getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(16, 16, 14, 0, Math.PI * 2);
        ctx.fill();
      });
      return el;
    },
    { fallback: () => span({ class: "swatch", style: { background: color } }) },
  );
}
