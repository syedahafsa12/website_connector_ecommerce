import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Offer } from "@/server/offers/types";
import { computeIsStale } from "@/server/offers/types";
import { scanForUntrustedContent } from "@/server/security/content-scanner";
import type { MerchantConnector, SearchProductsInput } from "./types";

export interface McpConnectorConfig {
  command: string;
  args: string[];
}

// One long-lived MCP client (child process) per merchant, reused across
// requests within this server process — spawning a process per call would
// work but is wasteful and not how a real MCP integration would run.
const clientCache = new Map<string, Promise<Client>>();

function getClient(merchantId: string, config: McpConnectorConfig): Promise<Client> {
  let clientPromise = clientCache.get(merchantId);
  if (!clientPromise) {
    clientPromise = (async () => {
      const transport = new StdioClientTransport({ command: config.command, args: config.args });
      const client = new Client({ name: "agentic-commerce-platform", version: "1.0.0" });
      await client.connect(transport);
      return client;
    })();
    clientCache.set(merchantId, clientPromise);
  }
  return clientPromise;
}

function parseToolResult<T>(result: unknown): T {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  const textBlock = content.find((c) => c.type === "text");
  if (!textBlock?.text) throw new Error("MCP tool call returned no text content");
  return JSON.parse(textBlock.text) as T;
}

function rawToOffer(merchantId: string, raw: Record<string, unknown>): Offer {
  const title = String(raw.title ?? "");
  const description = String(raw.description ?? "");
  const contentFlags = [...scanForUntrustedContent("title", title), ...scanForUntrustedContent("description", description)];
  const retrievedAt = String(raw.retrievedAt ?? new Date().toISOString());
  return {
    merchantId,
    merchantName: String(raw.merchantName ?? ""),
    productId: String(raw.productId ?? ""),
    title,
    description,
    category: (raw.category as Offer["category"]) ?? "product",
    price: raw.price as Offer["price"],
    attributes: (raw.attributes as Offer["attributes"]) ?? {},
    availability: raw.availability as Offer["availability"],
    shipping: raw.shipping as Offer["shipping"],
    returnPolicy: raw.returnPolicy as Offer["returnPolicy"],
    warranty: raw.warranty as Offer["warranty"],
    source: "mcp",
    retrievedAt,
    isStale: computeIsStale(retrievedAt),
    contentFlags,
  };
}

export class McpMerchantConnector implements MerchantConnector {
  readonly kind = "mcp" as const;

  constructor(
    readonly merchantId: string,
    private readonly config: McpConnectorConfig,
  ) {}

  private async callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const client = await getClient(this.merchantId, this.config);
    const result = await client.callTool({ name, arguments: args });
    return parseToolResult<T>(result);
  }

  async searchProducts(input: SearchProductsInput): Promise<Offer[]> {
    const { offers } = await this.callTool<{ offers: Record<string, unknown>[] }>("search_products", {
      query: input.query,
    });
    return offers.map((o) => rawToOffer(this.merchantId, o));
  }

  async getProduct(productId: string): Promise<Offer> {
    const raw = await this.callTool<Record<string, unknown>>("get_product", { productId });
    return rawToOffer(this.merchantId, raw);
  }

  async getInventory(productId: string) {
    return this.callTool<{ inStock: boolean; quantity: number | null; retrievedAt: string }>("get_inventory", {
      productId,
    });
  }

  async getShipping(productId: string) {
    return this.callTool<Offer["shipping"]>("get_shipping", { productId });
  }

  async getReturns(productId: string) {
    return this.callTool<Offer["returnPolicy"]>("get_returns", { productId });
  }

  async getWarranty(productId: string) {
    return this.callTool<Offer["warranty"]>("get_warranty", { productId });
  }
}
