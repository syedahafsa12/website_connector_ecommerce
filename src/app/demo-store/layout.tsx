import type { ReactNode } from "react";
import Link from "next/link";
import "./demo-store.css";

const NAV = [["Bikes", "bikes"], ["Components", "components"], ["Apparel", "apparel"], ["Accessories", "accessories"]] as const;

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="cd-root">
      <header className="cd-head">
        <div className="cd-bar">
          <Link href="/demo-store" className="cd-logo">CADENCE</Link>
          <nav className="cd-nav" aria-label="Shop">
            {NAV.map(([l, k]) => <Link key={k} href={`/demo-store/shop/${k}`}>{l}</Link>)}
          </nav>
          <div className="cd-tools">
            <button aria-label="Search"><span className="t">Search</span></button>
            <button aria-label="Account"><span className="t">Account</span></button>
            <button aria-label="Cart"><span className="t">Cart</span> (0)</button>
          </div>
        </div>
        <nav className="cd-mnav" aria-label="Shop (mobile)">{NAV.map(([l, k]) => <Link key={k} href={`/demo-store/shop/${k}`}>{l}</Link>)}</nav>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
      <footer className="cd-foot">
        <div className="cd-wrap">
          <div className="cd-fgrid">
            <div><div className="cd-logo">CADENCE</div></div>
            <div>
              <h4>Shop</h4>
              <ul>{NAV.map(([l, k]) => <li key={k}><Link href={`/demo-store/shop/${k}`}>{l}</Link></li>)}</ul>
            </div>
            <div>
              <h4>Support</h4>
              <ul>
                {["Shipping", "Returns", "Warranty", "Contact"].map((l) => <li key={l}><Link href={`/demo-store/support#${l.toLowerCase()}`}>{l}</Link></li>)}
              </ul>
            </div>
          </div>
          <div className="cd-legal">© 2026 Cadence Cycles</div>
        </div>
      </footer>
    </div>
  );
}
