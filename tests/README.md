# Running the test suite

Most of this suite (`connect.test.ts`, `commerce.test.ts`, `agent-authz.test.ts`,
`classification.test.ts`, `policy.test.ts`, `state.test.ts`) tests System 2
(`src/server/connect`), which is fully in-memory — no setup required.

`agent-mall-products.test.ts` and `agent-mall-flow.test.ts` test System 1's
Agent Mall endpoints (`/api/agent/*`, `/api/approvals/*`,
`/api/merchants/:id/visit`), which are backed by real PostgreSQL and, for the
REST/web demo merchants, real HTTP. Two things must be running first:

1. **A local Postgres database**, migrated:
   ```sh
   createdb agentic_commerce_test
   psql agentic_commerce_test -c "create extension if not exists pgcrypto; create schema if not exists auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}'::jsonb); do \$\$ begin if not exists (select from pg_roles where rolname='anon') then create role anon; end if; if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if; end \$\$;"
   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/agentic_commerce_test npm run migrate
   ```
   (The `auth` schema/roles stub Supabase Auth, which isn't present on plain
   Postgres — migrations/002 references `auth.users` and two Supabase roles.)

2. **The app itself**, serving the demo REST/web merchant endpoints:
   ```sh
   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/agentic_commerce_test npm run build && npm start
   ```

`tests/db-helpers.ts` defaults `DATABASE_URL`/`APP_BASE_URL` to the values
above if they aren't already set, so once both are running, plain `npm test`
picks them up. Point `DATABASE_URL`/`APP_BASE_URL` elsewhere (env vars) to run
against a different database or app instance.
