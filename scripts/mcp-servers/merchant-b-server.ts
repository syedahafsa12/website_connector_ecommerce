#!/usr/bin/env node
// Vertex Athletics' MCP server — a real MCP server over stdio using the
// official SDK. This is Merchant B's own backend; McpMerchantConnector talks
// to it as an MCP *client*, exactly like a real external merchant would be.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { VERTEX_CATALOG, VERTEX_SLUG, catalogItemToOffer, type CatalogItem } from "../../src/demo-merchants/catalog.js";

const MERCHANT_NAME = "Vertex Athletics";

function findProducts(query?: string): CatalogItem[] {
  if (!query) return VERTEX_CATALOG;
  const q = query.toLowerCase();
  return VERTEX_CATALOG.filter((i) => i.title.toLowerCase().includes(q) || i.category.includes(q));
}

function findById(id: string): CatalogItem | undefined {
  return VERTEX_CATALOG.find((i) => i.productId === id);
}

function textResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

const server = new McpServer({ name: "vertex-athletics-mcp", version: "1.0.0" });

server.tool("search_products", { query: z.string().optional() }, async ({ query }) => {
  const items = findProducts(query).map((i) => catalogItemToOffer(i, VERTEX_SLUG, MERCHANT_NAME, "mcp"));
  return textResult({ offers: items });
});

server.tool("get_product", { productId: z.string() }, async ({ productId }) => {
  const item = findById(productId);
  if (!item) return textResult({ error: `product ${productId} not found` });
  return textResult(catalogItemToOffer(item, VERTEX_SLUG, MERCHANT_NAME, "mcp"));
});

server.tool("get_inventory", { productId: z.string() }, async ({ productId }) => {
  const item = findById(productId);
  if (!item) return textResult({ error: `product ${productId} not found` });
  const retrievedAt = item.retrievedAtOverride ?? new Date().toISOString();
  return textResult({ inStock: (item.quantity ?? 1) > 0, quantity: item.quantity, retrievedAt });
});

server.tool("get_shipping", { productId: z.string() }, async ({ productId }) => {
  const item = findById(productId);
  if (!item) return textResult({ error: `product ${productId} not found` });
  return textResult(item.shipping);
});

server.tool("get_returns", { productId: z.string() }, async ({ productId }) => {
  const item = findById(productId);
  if (!item) return textResult({ error: `product ${productId} not found` });
  return textResult(item.returns);
});

server.tool("get_warranty", { productId: z.string() }, async ({ productId }) => {
  const item = findById(productId);
  if (!item) return textResult({ error: `product ${productId} not found` });
  return textResult(item.warranty);
});

const transport = new StdioServerTransport();
await server.connect(transport);
