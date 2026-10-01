import { bikeMarkup, itemMarkup } from "../../art";
import { PRESENT } from "../../catalog";

export const dynamic = "force-dynamic";

// Product artwork as a standalone image, so product listings can carry a real picture.
export function GET(_req: Request, { params }: { params: { id: string } }) {
  const v = PRESENT[params.id]?.visual;
  if (!v) return new Response("not found", { status: 404 });
  const art =
    v.kind === "bike"
      ? `<svg x="50" y="330" width="700" viewBox="0 0 720 410">${bikeMarkup(v.variant, v.frame)}</svg>`
      : `<svg x="100" y="290" width="600" viewBox="0 0 400 300">${itemMarkup(v.item, v.color)}</svg>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000"><rect width="800" height="1000" fill="${v.bg}"/>${art}</svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=300" } });
}
