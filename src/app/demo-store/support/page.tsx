import { CONTACT, POLICIES } from "../catalog";

export const metadata = { title: "Support — Cadence Cycles" };

export default function Support() {
  return (
    <div className="cd-wrap cd-page">
      <h1>Support</h1>
      <p className="lead">Shipping, returns, warranty and how to reach us.</p>
      <div className="cd-sup">
        <section id="shipping"><h2>Shipping</h2><p>{POLICIES.shipping}</p></section>
        <section id="returns"><h2>Returns</h2><p>{POLICIES.returns}</p></section>
        <section id="warranty"><h2>Warranty</h2><p>{POLICIES.warranty}</p></section>
        <section id="contact"><h2>Contact</h2><p>Questions about an order or a bike? Email <a href={`mailto:${CONTACT.email}`} style={{ borderBottom: "1px solid currentColor" }}>{CONTACT.email}</a>.</p></section>
      </div>
    </div>
  );
}
