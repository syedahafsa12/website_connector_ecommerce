import type { MerchantRow, McpConnectorConfigDb, RestConnectorConfig, WebConnectorConfigDb } from "@/server/merchants/types";
import { McpMerchantConnector } from "./mcp-connector";
import { RestMerchantConnector } from "./rest-connector";
import type { MerchantConnector } from "./types";
import { WebMerchantConnector } from "./web-connector";

/** The agent never calls this directly — only the capability router does. */
export function buildConnector(merchant: MerchantRow): MerchantConnector {
  if (merchant.connector_type === "rest") {
    const config = merchant.connector_config as RestConnectorConfig;
    return new RestMerchantConnector(merchant.id, merchant.name, config.baseUrl);
  }
  if (merchant.connector_type === "mcp") {
    const config = merchant.connector_config as McpConnectorConfigDb;
    return new McpMerchantConnector(merchant.id, config);
  }
  const config = merchant.connector_config as WebConnectorConfigDb;
  return new WebMerchantConnector(merchant.id, merchant.name, config);
}
