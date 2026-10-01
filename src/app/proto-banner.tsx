"use client";

import { usePathname } from "next/navigation";

// Engineering-console banner. Not rendered on the merchant storefront or the connection experience.
export function ProtoBanner() {
  const path = usePathname() ?? "";
  if (/^\/(demo-store|connect|fixtures)(\/|$)/.test(path)) return null;
  return <div className="proto-banner">WORKING TECHNICAL PROTOTYPE — NOT FINAL PRODUCT DESIGN</div>;
}
