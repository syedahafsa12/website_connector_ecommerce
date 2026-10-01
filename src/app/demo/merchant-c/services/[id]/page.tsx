import { notFound } from "next/navigation";
import { URBAN_CATALOG } from "@/demo-merchants/catalog";

// Urban Services' own public website. This is a real HTML page — the web
// connector reads it the way any structured-data consumer would: by parsing
// the embedded JSON-LD, not by scraping arbitrary DOM.
export default function ServicePage({ params }: { params: { id: string } }) {
  const item = URBAN_CATALOG.find((i) => i.productId === params.id);
  if (!item) return notFound();

  const retrievedAt = item.retrievedAtOverride ?? new Date().toISOString();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    serviceType: item.title,
    name: item.title,
    description: item.description,
    provider: { "@type": "LocalBusiness", name: "Urban Services" },
    offers: {
      "@type": "Offer",
      price: String(item.price),
      priceCurrency: item.currency,
      availability: (item.quantity ?? 1) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
    additionalProperty: [
      { "@type": "PropertyValue", name: "shippingAvailable", value: String(item.shipping.available) },
      { "@type": "PropertyValue", name: "returnWindowDays", value: String(item.returns.windowDays ?? "") },
      { "@type": "PropertyValue", name: "freeReturns", value: String(item.returns.isFreeReturns) },
      { "@type": "PropertyValue", name: "returnNotes", value: item.returns.notes ?? "" },
      { "@type": "PropertyValue", name: "warrantyMonths", value: String(item.warranty.months ?? "") },
      { "@type": "PropertyValue", name: "warrantyNotes", value: item.warranty.notes ?? "" },
      { "@type": "PropertyValue", name: "productId", value: item.productId },
      { "@type": "PropertyValue", name: "retrievedAt", value: retrievedAt },
    ],
  };

  return (
    <main style={{ fontFamily: "system-ui", maxWidth: 640, margin: "40px auto", padding: 16 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p style={{ fontSize: 12, color: "#888" }}>DEMO MERCHANT — Urban Services</p>
      <h1>{item.title}</h1>
      <p>{item.description}</p>
      <p>
        ${item.price.toFixed(2)} {item.currency}
      </p>
    </main>
  );
}
