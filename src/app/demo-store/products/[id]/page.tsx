import Link from "next/link";
import { notFound } from "next/navigation";
import { AddToCart } from "../../add-to-cart";
import { Art, Avail, ProductCard } from "../../card";
import { COLLECTIONS, find, inCollection, money, POLICIES, PRESENT } from "../../catalog";

export function generateMetadata({ params }: { params: { id: string } }) {
  const p = find(params.id);
  return { title: p ? `${p.name} — Cadence Cycles` : "Cadence Cycles" };
}

export default function ProductPage({ params }: { params: { id: string } }) {
  const p = find(params.id);
  const pr = PRESENT[params.id];
  if (!p || !pr) notFound();
  const key = Object.keys(COLLECTIONS).find((k) => COLLECTIONS[k]!.test(p)) ?? "bikes";
  const more = inCollection(key).filter((x) => x.id !== p.id).slice(0, 3);
  return (
    <div className="cd-wrap">
      <div className="cd-crumb"><Link href="/demo-store">Home</Link> / <Link href={`/demo-store/shop/${key}`}>{COLLECTIONS[key]!.title}</Link> / {p.name}</div>
      <div className="cd-pdp">
        <div className="gallery" style={{ ["--bg-t" as string]: pr.visual.bg }}><Art id={p.id} /></div>
        <div>
          <h1>{p.name}</h1>
          <div className="price">{money(p.price)}</div>
          <p className="line1">{pr.tagline}</p>
          <div className="stock"><Avail p={p} /></div>
          <div className="buy"><AddToCart soldOut={p.stock <= 0} /></div>
          <div className="cd-acc">
            <details open><summary>Details</summary><div className="body">{pr.detail}</div></details>
            <details><summary>Specifications</summary><div className="body"><dl className="cd-spec">{pr.specs.map(([k, v]) => <div key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></div></details>
            <details><summary>Shipping</summary><div className="body">{POLICIES.shipping}</div></details>
            <details><summary>Returns</summary><div className="body">{POLICIES.returns}</div></details>
            <details><summary>Warranty</summary><div className="body">{POLICIES.warranty}</div></details>
          </div>
        </div>
      </div>
      {more.length > 0 && (
        <section className="cd-sec">
          <div className="cd-sech"><h2>More {COLLECTIONS[key]!.title.toLowerCase()}</h2></div>
          <div className="cd-grid">{more.map((x) => <ProductCard key={x.id} p={x} />)}</div>
        </section>
      )}
    </div>
  );
}
