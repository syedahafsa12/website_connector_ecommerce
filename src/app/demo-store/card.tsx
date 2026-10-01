import Link from "next/link";
import type { Product } from "@/server/connect/demo-store";
import { BikeArt, ItemArt } from "./art";
import { availability, money, PRESENT } from "./catalog";

export function Art({ id, spin }: { id: string; spin?: boolean }) {
  const v = PRESENT[id]?.visual;
  if (!v) return null;
  return v.kind === "bike" ? <BikeArt variant={v.variant} frame={v.frame} spin={spin} /> : <ItemArt kind={v.item} color={v.color} />;
}

export function Avail({ p }: { p: Product }) {
  const a = availability(p);
  return <span className={`cd-av ${a.tone}`}><i />{a.label}</span>;
}

export function ProductCard({ p, big }: { p: Product; big?: boolean }) {
  const pr = PRESENT[p.id];
  return (
    <Link href={`/demo-store/products/${p.id}`} className={`cd-card ${big ? "big" : ""}`}>
      <div className="img" style={{ ["--bg-t" as string]: pr?.visual.bg }}><Art id={p.id} /></div>
      <div className="meta">
        <div><h3>{p.name}</h3><div className="desc">{pr?.tagline}</div></div>
        <div className="right"><div className="cd-price">{money(p.price)}</div><Avail p={p} /></div>
      </div>
    </Link>
  );
}
