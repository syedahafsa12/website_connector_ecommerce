# Agentic Commerce (POC)

One capability contract over heterogeneous merchant integrations (REST, MCP, structured web data), used by a single shopping agent. Includes domain verification, scoped authorization, a policy boundary against high-risk actions, referral attribution and tenant-isolated merchant insight. Next.js + PostgreSQL.

See `docs/ARCHITECTURE.md`, `docs/POC_SCOPE.md`, `docs/CONNECTION_PROTOTYPE.md`.

## Run locally

```bash
npm install
cp .env.example .env     # fill in values
npm run migrate && npm run seed
npm run dev              # http://localhost:3000  (/connect, /demo-store)
npm test
```

## Environment variables

| Variable | Required | Value |
|---|---|---|
| `DATABASE_URL` | yes | Postgres URI (e.g. Supabase pooler) |
| `APP_BASE_URL` | yes | Public URL of the deployed app, no trailing slash |
| `MODEL_PROVIDER` | yes | `anthropic` |
| `ANTHROPIC_API_KEY` | yes | your key |
| `ANTHROPIC_MODEL` | no | `claude-sonnet-5-5` |
| `MISTRAL_API_KEY` | for `/connect` agent | your key |
| `MISTRAL_MODEL` | no | `mistral-medium-latest` |
| `CONNECT_SECRET` | yes in prod | random string: `openssl rand -hex 32` |
| `REFERRAL_SIGNING_SECRET` | yes in prod | random string: `openssl rand -hex 32` |
| `NEXT_PUBLIC_LUNA_URL` | no | same as `APP_BASE_URL` + `/demo-store`, or empty |
| `MERCHANT_B_MCP_COMMAND` | no | `npx` |
| `MERCHANT_B_MCP_ARGS` | no | `tsx,scripts/mcp-servers/merchant-b-server.ts` |
| `CONNECT_ALLOW_LOCAL` | dev only | leave empty in production |

Never commit `.env`; it is gitignored. Run `npm run migrate` once against the production database.
