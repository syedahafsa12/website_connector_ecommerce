import { PRODUCTS, POLICIES, type Product } from "@/server/connect/demo-store";
import type { BikeVariant, ItemKind } from "./art";

/**
 * Storefront presentation only. Product facts (name, price, stock, colour) come from PRODUCTS;
 * the specs below restate what the product data already says and add nothing new.
 */
export type Visual =
  | { kind: "bike"; variant: BikeVariant; frame: string; bg: string }
  | { kind: "item"; item: ItemKind; color: string; bg: string };

type Present = { tagline: string; detail: string; specs: Array<[string, string]>; visual: Visual };

export const PRESENT: Record<string, Present> = {
  "bike-101": {
    tagline: "Step-through city bicycle", detail: "A step-through steel frame city bicycle, ready for daily riding with fenders, a chain guard and a rear rack.",
    specs: [["Type", "City"], ["Frame", "Steel, step-through"], ["Includes", "Fenders, chain guard, rear rack"], ["Colour", "Green"]],
    visual: { kind: "bike", variant: "city", frame: "#2f6b4f", bg: "#e4ece6" },
  },
  "bike-102": {
    tagline: "7-speed aluminium commuter", detail: "A lightweight aluminium commuter with 7-speed gearing and disc brakes.",
    specs: [["Type", "Commuter"], ["Frame", "Aluminium"], ["Gearing", "7-speed"], ["Brakes", "Disc"], ["Colour", "Green"]],
    visual: { kind: "bike", variant: "flat", frame: "#6fb996", bg: "#e6f0ea" },
  },
  "bike-103": {
    tagline: "Entry-level hardtail", detail: "An entry-level hardtail trail bike.",
    specs: [["Type", "Hardtail trail"], ["Level", "Entry-level"], ["Colour", "Green"]],
    visual: { kind: "bike", variant: "trail", frame: "#1f8f63", bg: "#dfeee6" },
  },
  "bike-104": {
    tagline: "Carbon-fork road bike", detail: "A road bike with a carbon fork and a 22-speed groupset.",
    specs: [["Type", "Road"], ["Fork", "Carbon"], ["Groupset", "22-speed"], ["Colour", "Red"]],
    visual: { kind: "bike", variant: "road", frame: "#b3262f", bg: "#f2e3e1" },
  },
  "bike-105": {
    tagline: "Drop-bar gravel bicycle", detail: "A drop-bar gravel bicycle with room for 40mm tyres.",
    specs: [["Type", "Gravel"], ["Handlebar", "Drop-bar"], ["Tyre clearance", "40mm"], ["Colour", "Grey"]],
    visual: { kind: "bike", variant: "gravel", frame: "#5d6872", bg: "#e8eaec" },
  },
  "helm-201": {
    tagline: "MIPS commuter helmet", detail: "A commuter helmet with MIPS and an integrated rear light.",
    specs: [["Protection", "MIPS"], ["Lighting", "Rear light"], ["Colour", "Blue"]],
    visual: { kind: "item", item: "helmet", color: "#2f5fd0", bg: "#e5eaf6" },
  },
  "lock-301": {
    tagline: "Hardened steel U-lock", detail: "A 16mm hardened steel U-lock supplied with two keys.",
    specs: [["Shackle", "16mm hardened steel"], ["Keys", "2 included"], ["Colour", "Black"]],
    visual: { kind: "item", item: "lock", color: "#2b2d32", bg: "#ebebe8" },
  },
  "bag-401": {
    tagline: "Waterproof roll-top panniers", detail: "A pair of waterproof roll-top panniers, 20L each.",
    specs: [["Closure", "Roll-top"], ["Capacity", "20L each"], ["Supplied", "Pair"], ["Colour", "Black"]],
    visual: { kind: "item", item: "pannier", color: "#2b2d32", bg: "#ebebe8" },
  },
  "wear-501": {
    tagline: "Organic cotton cycling cap", detail: "A breathable cycling cap made from 100% organic cotton.",
    specs: [["Material", "100% organic cotton"], ["Colour", "White"]],
    visual: { kind: "item", item: "cap", color: "#f3f1ea", bg: "#e9e7e0" },
  },
  "wear-502": {
    tagline: "Organic cotton commuter tee", detail: "An everyday tee made from GOTS-certified organic cotton.",
    specs: [["Material", "GOTS-certified organic cotton"], ["Colour", "Green"]],
    visual: { kind: "item", item: "tee", color: "#3f8f6b", bg: "#e4ece6" },
  },
};

export const COLLECTIONS: Record<string, { title: string; blurb: string; test: (p: Product) => boolean }> = {
  bikes: { title: "Bikes", blurb: "City, commuter, trail, road and gravel.", test: (p) => p.category === "bicycle" },
  components: { title: "Components", blurb: "Parts and upgrades.", test: () => false },
  apparel: { title: "Apparel", blurb: "Made from organic cotton.", test: (p) => p.category === "apparel" },
  accessories: { title: "Accessories", blurb: "Helmets, locks and bags.", test: (p) => ["helmet", "lock", "bag"].includes(p.category) },
};

export const money = (n: number) => `$${n.toLocaleString("en-US")}`;
export const availability = (p: Product) => (p.stock <= 0 ? { label: "Out of stock", tone: "out" } : p.stock <= 3 ? { label: `Only ${p.stock} left`, tone: "low" } : { label: "In stock", tone: "in" });
export const find = (id: string) => PRODUCTS.find((p) => p.id === id);
export const inCollection = (key: string) => PRODUCTS.filter((p) => COLLECTIONS[key]?.test(p));
export { PRODUCTS, POLICIES };

export const CONTACT = { email: "support@cadencecycles.example" };
