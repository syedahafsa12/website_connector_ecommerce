import Link from "next/link";
import { ownTag } from "@/server/connect/demo-store";
import { BikeArt } from "./art";
import { ProductCard } from "./card";
import { inCollection, POLICIES } from "./catalog";

export const dynamic = "force-dynamic";

// Head tags the platform reads (ownership tag once published; capability advertisement). Not customer-visible.
export function generateMetadata() {
  const tag = ownTag();
  return {
    title: "Cadence Cycles",
    other: tag ? { "agentic-commerce-verification": tag } : {},
    alternates: { types: { "application/agentic-capabilities+json": "/demo-store/capabilities.json" } },
  };
}

export default function Home() {
  const bikes = inCollection("bikes");
  const gear = [...inCollection("accessories"), ...inCollection("apparel")];
  return (
    <>
      <section className="cd-hero">
        <div className="cd-wrap">
          <div>
            <h1>Ride<br />further.</h1>
            <p>Built for the road ahead.</p>
            <Link href="/demo-store/shop/bikes" className="cd-btn">Shop bikes →</Link>
          </div>
          <div className="art"><BikeArt variant="flat" frame="#1b1d20" spin /></div>
        </div>
      </section>

      <div className="cd-wrap">
        <section className="cd-sec">
          <div className="cd-sech"><h2>Featured bikes</h2><Link href="/demo-store/shop/bikes">View all</Link></div>
          <div className="cd-grid">
            {bikes.map((p, i) => <div key={p.id} className={i === 0 ? "big" : ""} style={{ display: "contents" }}><ProductCard p={p} big={i === 0} /></div>)}
          </div>
        </section>

        <section className="cd-sec">
          <div className="cd-sech"><h2>Apparel &amp; accessories</h2><Link href="/demo-store/shop/accessories">View all</Link></div>
          <div className="cd-grid">{gear.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        </section>

        <section className="cd-info" aria-label="Customer information">
          <div><h3>Shipping</h3><p>{POLICIES.shipping}</p></div>
          <div><h3>Returns</h3><p>{POLICIES.returns}</p></div>
          <div><h3>Warranty</h3><p>{POLICIES.warranty}</p></div>
        </section>
      </div>
    </>
  );
}
