import type { ScopeCategory } from "@/server/capabilities/definitions";

export type MerchantStatus = "pending_verification" | "domain_verified" | "authorized" | "revoked";
export type ConnectorType = "rest" | "mcp" | "web";

export interface RestConnectorConfig {
  baseUrl: string;
}
export interface McpConnectorConfigDb {
  command: string;
  args: string[];
}
export interface WebConnectorConfigDb {
  baseUrl: string;
  pagePaths: string[];
}

export interface MerchantRow {
  id: string;
  name: string;
  slug: string;
  domain: string;
  category: string;
  status: MerchantStatus;
  connector_type: ConnectorType;
  connector_config: RestConnectorConfig | McpConnectorConfigDb | WebConnectorConfigDb;
  is_adversarial_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthorizationRow {
  id: string;
  merchant_id: string;
  scopes: ScopeCategory[];
  status: "active" | "revoked";
  authorized_at: string;
  revoked_at: string | null;
}
