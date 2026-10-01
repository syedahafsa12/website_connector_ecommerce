import { notFound } from "next/navigation";
import { ProductCard } from "../../card";
import { COLLECTIONS, inCollection } from "../../catalog";

export function generateMetadata({ params }: { params: { collection: string } }) {
  return { title: `${COLLECTIONS[params.collection]?.title ?? "Shop"} — Cadence Cycles` };
}

export default function Collection({ params }: { params: { collection: string } }) {
  const c = COLLECTIONS[params.collection];
  if (!c) notFound();
  const items = inCollection(params.collection);
  return (
    <div className="cd-wrap cd-page">
      <h1>{c.title}</h1>
      <p className="lead">{c.blurb}</p>
      <div style={{ marginTop: 40 }}>
        {items.length === 0 ? <div className="cd-empty">New {c.title.toLowerCase()} are on the way.</div> : <div className="cd-grid">{items.map((p) => <ProductCard key={p.id} p={p} />)}</div>}
      </div>
    </div>
  );
}
