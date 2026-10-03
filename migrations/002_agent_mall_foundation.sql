-- Agent Mall foundation — extends the existing merchant/policy/referral schema from
-- 001_init.sql with: Supabase Auth-backed user accounts + profiles, a normalized
-- product cache, agent sessions/tool-call logging, a generic approval workflow,
-- unique-visit tracking with visit packages, a shopping-event stream, merchant
-- analytics (computed, never hardcoded), and skeleton auction/order tables.
--
-- Conventions followed from 001_init.sql (kept consistent on purpose):
--   * UUID primary keys via gen_random_uuid() (pgcrypto, already enabled).
--   * Tenant/user isolation via RLS using session-scoped GUCs set by the app's
--     `pg` connection (NOT Supabase's PostgREST-only auth.uid()/JWT claims,
--     which this app's direct-Postgres backend never carries):
--       - app.current_user_id      -- set by withUserScope() for the authenticated caller
--       - app.current_merchant_id  -- set by withMerchantScope() (already existed)
--       - app.bypass_rls = 'true'  -- set by withPlatformScope() for orchestration code
--   * FORCE ROW LEVEL SECURITY so isolation is meaningful even though the app's
--     DB role owns these tables.

-- --------------------------------------------------------------------------
-- 1. Users / profiles (Supabase Auth)
-- --------------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-provision a profile row for every new Supabase Auth user, regardless of
-- which flow creates them (password signup, magic link, OAuth, admin API).
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform set_config('app.bypass_rls', 'true', true); -- local to this transaction only
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', null));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- It's a trigger function (uses NEW), but Postgres still exposes it as a
-- directly-callable RPC via PostgREST by default. Lock that down.
revoke execute on function handle_new_user() from public, anon, authenticated;

-- A single account can both shop and own/manage connected merchant websites.
alter table merchants add column owner_id uuid references auth.users(id) on delete set null;
create index idx_merchants_owner on merchants(owner_id);

create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'sandbox',
  token text not null, -- sandbox/tokenized reference only — never a raw card number
  brand text,
  last4 text,
  exp_month smallint,
  exp_year smallint,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_payment_methods_user on payment_methods(user_id);

-- --------------------------------------------------------------------------
-- 2. Normalized product model (what the agent searches, regardless of how a
--    merchant stores its own catalog — REST / MCP / web-structured-data).
-- --------------------------------------------------------------------------

create table products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  external_id text not null, -- the merchant's own product id (e.g. "np-001")
  name text not null,
  description text not null default '',
  category text not null default 'product' check (category in ('product','service')),
  price_amount numeric(12,2) not null,
  price_currency text not null default 'USD',
  images jsonb not null default '[]'::jsonb,
  attributes jsonb not null default '{}'::jsonb, -- e.g. {"color": "black"}
  product_url text,
  shipping jsonb not null default '{}'::jsonb,
  return_policy jsonb not null default '{}'::jsonb,
  warranty jsonb not null default '{}'::jsonb,
  inventory_quantity integer,
  in_stock boolean not null default true,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, external_id)
);
create index idx_products_merchant on products(merchant_id);
create index idx_products_category on products(category);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  sku text,
  color text,
  size text,
  price_amount numeric(12,2),
  price_currency text default 'USD',
  inventory_quantity integer,
  in_stock boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_product_variants_product on product_variants(product_id);

create table merchant_policies (
  merchant_id uuid primary key references merchants(id) on delete cascade,
  shipping jsonb not null default '{}'::jsonb,
  returns jsonb not null default '{}'::jsonb,
  warranty jsonb not null default '{}'::jsonb,
  notes text,
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- 3. Agent sessions + tool-call logging (feeds the future Agent Activity UI;
--    complements, does not replace, the existing audit_events table).
-- --------------------------------------------------------------------------

create table agent_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index idx_agent_sessions_user on agent_sessions(user_id);

create table agent_tool_calls (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references agent_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  tool_name text not null,
  arguments jsonb not null default '{}'::jsonb,
  result_status text not null check (result_status in ('success','error','blocked')),
  result_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_agent_tool_calls_session on agent_tool_calls(session_id);
create index idx_agent_tool_calls_user on agent_tool_calls(user_id);

-- --------------------------------------------------------------------------
-- 4. Generic approval workflow (REQUESTED -> PENDING -> APPROVED | REJECTED).
--    The policy engine already models HIGH_RISK capabilities as
--    REQUIRE_APPROVAL but — per its own comment — never wired that up to
--    anything. This table is that missing piece.
-- --------------------------------------------------------------------------

create table approvals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references agent_sessions(id) on delete set null,
  merchant_id uuid references merchants(id) on delete set null,
  action_type text not null check (action_type in ('merchant_visit','purchase','auction_bid','buy_now')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('requested','pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id)
);
create index idx_approvals_user on approvals(user_id);
create index idx_approvals_merchant on approvals(merchant_id);
create index idx_approvals_session on approvals(session_id);
create index idx_approvals_status on approvals(status);

-- --------------------------------------------------------------------------
-- 5. Unique website visit engine. A visit only counts once a shopper approves
--    navigating to a merchant (search/compare never count). The same visitor
--    counts again under a new package.
-- --------------------------------------------------------------------------

create table visit_packages (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  visit_limit integer not null check (visit_limit > 0),
  visits_used integer not null default 0 check (visits_used >= 0),
  status text not null default 'active' check (status in ('active','exhausted','expired','cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_visit_packages_merchant on visit_packages(merchant_id);
create index idx_visit_packages_status on visit_packages(status);

create table unique_visits (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references visit_packages(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  -- The authenticated platform user id (as text). Never IP or device
  -- fingerprinting — see docs/api/visits.md.
  visitor_subject_id text not null,
  session_id uuid references agent_sessions(id) on delete set null,
  approval_id uuid references approvals(id) on delete set null,
  first_visit_at timestamptz not null default now(),
  unique (package_id, merchant_id, visitor_subject_id)
);
create index idx_unique_visits_merchant on unique_visits(merchant_id);
create index idx_unique_visits_visitor on unique_visits(visitor_subject_id);
create index idx_unique_visits_package on unique_visits(package_id);

-- --------------------------------------------------------------------------
-- 6. Shopping events (the real, non-fabricated source for merchant analytics)
-- --------------------------------------------------------------------------

create table shopping_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references agent_sessions(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  merchant_id uuid references merchants(id) on delete set null,
  event_type text not null check (event_type in (
    'SEARCH','PRODUCT_MATCHED','PRODUCT_EXCLUDED','PRODUCT_COMPARED','MERCHANT_SELECTED',
    'VISIT_APPROVED','MERCHANT_VISITED','PRODUCT_VIEWED','CHECKOUT_STARTED','CHECKOUT_ABANDONED',
    'PURCHASE_APPROVED','PURCHASE_COMPLETED'
  )),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_shopping_events_session on shopping_events(session_id);
create index idx_shopping_events_merchant on shopping_events(merchant_id);
create index idx_shopping_events_type on shopping_events(event_type);
create index idx_shopping_events_created on shopping_events(created_at desc);

-- Computed, not fabricated: every number here is a real aggregate over
-- shopping_events / unique_visits. security_invoker means it carries the
-- querying role's own RLS, not the view creator's.
create view merchant_analytics
with (security_invoker = true) as
select
  m.id as merchant_id,
  m.name as merchant_name,
  count(*) filter (where se.event_type = 'SEARCH') as searches,
  count(*) filter (where se.event_type = 'PRODUCT_MATCHED') as products_matched,
  count(*) filter (where se.event_type = 'PRODUCT_EXCLUDED') as products_excluded,
  count(*) filter (where se.event_type = 'PRODUCT_COMPARED') as products_compared,
  count(*) filter (where se.event_type = 'MERCHANT_SELECTED') as merchant_selections,
  count(*) filter (where se.event_type = 'MERCHANT_VISITED') as merchant_visit_attempts,
  count(*) filter (where se.event_type = 'PRODUCT_VIEWED') as product_views,
  count(*) filter (where se.event_type = 'CHECKOUT_STARTED') as checkouts_started,
  count(*) filter (where se.event_type = 'CHECKOUT_ABANDONED') as checkouts_abandoned,
  count(*) filter (where se.event_type = 'PURCHASE_COMPLETED') as purchases_completed,
  (select count(*) from unique_visits uv where uv.merchant_id = m.id) as unique_visits_total
from merchants m
left join shopping_events se on se.merchant_id = m.id
group by m.id, m.name;

-- --------------------------------------------------------------------------
-- 7. Auctions / orders — schema only (no settlement/payment logic). These
--    tables exist so the data model is ready; brief explicitly defers the
--    settlement/processing logic itself.
-- --------------------------------------------------------------------------

create table auctions (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  title text not null,
  description text not null default '',
  starting_price numeric(12,2) not null,
  currency text not null default 'USD',
  status text not null default 'scheduled' check (status in ('scheduled','active','ended','cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_auctions_merchant on auctions(merchant_id);
create index idx_auctions_status on auctions(status);

create table auction_bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references auctions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  status text not null default 'placed' check (status in ('placed','winning','outbid','rejected')),
  created_at timestamptz not null default now()
);
create index idx_auction_bids_auction on auction_bids(auction_id);
create index idx_auction_bids_user on auction_bids(user_id);

create table auction_orders (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references auctions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending','completed','cancelled','refunded')),
  created_at timestamptz not null default now()
);
create index idx_auction_orders_auction on auction_orders(auction_id);
create index idx_auction_orders_user on auction_orders(user_id);

create table orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  product_external_id text not null,
  amount numeric(12,2) not null,
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending','completed','cancelled','refunded')),
  created_at timestamptz not null default now()
);
create index idx_orders_user on orders(user_id);
create index idx_orders_merchant on orders(merchant_id);

create table saved_websites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null references merchants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, merchant_id)
);
create index idx_saved_websites_user on saved_websites(user_id);

create table saved_auctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  auction_id uuid not null references auctions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, auction_id)
);
create index idx_saved_auctions_user on saved_auctions(user_id);

-- --------------------------------------------------------------------------
-- 8. RLS — fixing the pre-existing advisory (merchants, domain_verifications,
--    merchant_authorizations, audit_events, referral_events, schema_migrations
--    had RLS disabled) and covering every new table.
-- --------------------------------------------------------------------------

alter table merchants enable row level security;
alter table merchants force row level security;
create policy merchants_read_all on merchants for select using (true);
create policy merchants_owner_insert on merchants for insert with check (
  owner_id is null or owner_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
);
create policy merchants_owner_update on merchants for update using (
  owner_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
);
create policy merchants_owner_delete on merchants for delete using (
  owner_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
);

alter table domain_verifications enable row level security;
alter table domain_verifications force row level security;
create policy domain_verifications_owner on domain_verifications for all using (
  current_setting('app.bypass_rls', true) = 'true'
  or exists (select 1 from merchants m where m.id = domain_verifications.merchant_id and m.owner_id::text = current_setting('app.current_user_id', true))
) with check (
  current_setting('app.bypass_rls', true) = 'true'
  or exists (select 1 from merchants m where m.id = domain_verifications.merchant_id and m.owner_id::text = current_setting('app.current_user_id', true))
);

alter table merchant_authorizations enable row level security;
alter table merchant_authorizations force row level security;
create policy merchant_authorizations_owner on merchant_authorizations for all using (
  current_setting('app.bypass_rls', true) = 'true'
  or exists (select 1 from merchants m where m.id = merchant_authorizations.merchant_id and m.owner_id::text = current_setting('app.current_user_id', true))
) with check (
  current_setting('app.bypass_rls', true) = 'true'
  or exists (select 1 from merchants m where m.id = merchant_authorizations.merchant_id and m.owner_id::text = current_setting('app.current_user_id', true))
);

alter table audit_events enable row level security;
alter table audit_events force row level security;
create policy audit_events_platform_only on audit_events for all
  using (current_setting('app.bypass_rls', true) = 'true')
  with check (current_setting('app.bypass_rls', true) = 'true');

alter table referral_events enable row level security;
alter table referral_events force row level security;
create policy referral_events_platform_only on referral_events for all
  using (current_setting('app.bypass_rls', true) = 'true')
  with check (current_setting('app.bypass_rls', true) = 'true');

alter table schema_migrations enable row level security;
alter table schema_migrations force row level security;
create policy schema_migrations_platform_only on schema_migrations for all
  using (current_setting('app.bypass_rls', true) = 'true')
  with check (current_setting('app.bypass_rls', true) = 'true');

alter table profiles enable row level security;
alter table profiles force row level security;
create policy profiles_self on profiles for all using (
  id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
) with check (
  id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
);

alter table payment_methods enable row level security;
alter table payment_methods force row level security;
create policy payment_methods_self on payment_methods for all using (
  user_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
) with check (
  user_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
);

alter table products enable row level security;
alter table products force row level security;
create policy products_read_all on products for select using (true);
create policy products_platform_insert on products for insert with check (current_setting('app.bypass_rls', true) = 'true');
create policy products_platform_update on products for update using (current_setting('app.bypass_rls', true) = 'true');
create policy products_platform_delete on products for delete using (current_setting('app.bypass_rls', true) = 'true');

alter table product_variants enable row level security;
alter table product_variants force row level security;
create policy product_variants_read_all on product_variants for select using (true);
create policy product_variants_platform_write on product_variants for insert with check (current_setting('app.bypass_rls', true) = 'true');
create policy product_variants_platform_update on product_variants for update using (current_setting('app.bypass_rls', true) = 'true');
create policy product_variants_platform_delete on product_variants for delete using (current_setting('app.bypass_rls', true) = 'true');

alter table merchant_policies enable row level security;
alter table merchant_policies force row level security;
create policy merchant_policies_read_all on merchant_policies for select using (true);
create policy merchant_policies_platform_write on merchant_policies for insert with check (current_setting('app.bypass_rls', true) = 'true');
create policy merchant_policies_platform_update on merchant_policies for update using (current_setting('app.bypass_rls', true) = 'true');

alter table agent_sessions enable row level security;
alter table agent_sessions force row level security;
create policy agent_sessions_owner on agent_sessions for all using (
  (user_id is not null and user_id::text = current_setting('app.current_user_id', true)) or current_setting('app.bypass_rls', true) = 'true'
) with check (
  (user_id is not null and user_id::text = current_setting('app.current_user_id', true)) or current_setting('app.bypass_rls', true) = 'true'
);

alter table agent_tool_calls enable row level security;
alter table agent_tool_calls force row level security;
create policy agent_tool_calls_owner on agent_tool_calls for all using (
  (user_id is not null and user_id::text = current_setting('app.current_user_id', true)) or current_setting('app.bypass_rls', true) = 'true'
) with check (
  (user_id is not null and user_id::text = current_setting('app.current_user_id', true)) or current_setting('app.bypass_rls', true) = 'true'
);

alter table approvals enable row level security;
alter table approvals force row level security;
create policy approvals_owner on approvals for all using (
  user_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
) with check (
  user_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
);

alter table visit_packages enable row level security;
alter table visit_packages force row level security;
create policy visit_packages_merchant_owner_read on visit_packages for select using (
  current_setting('app.bypass_rls', true) = 'true'
  or exists (select 1 from merchants m where m.id = visit_packages.merchant_id and m.owner_id::text = current_setting('app.current_user_id', true))
);
create policy visit_packages_platform_insert on visit_packages for insert with check (current_setting('app.bypass_rls', true) = 'true');
create policy visit_packages_platform_update on visit_packages for update using (current_setting('app.bypass_rls', true) = 'true');

alter table unique_visits enable row level security;
alter table unique_visits force row level security;
create policy unique_visits_read on unique_visits for select using (
  visitor_subject_id = current_setting('app.current_user_id', true)
  or current_setting('app.bypass_rls', true) = 'true'
  or exists (select 1 from merchants m where m.id = unique_visits.merchant_id and m.owner_id::text = current_setting('app.current_user_id', true))
);
create policy unique_visits_platform_insert on unique_visits for insert with check (current_setting('app.bypass_rls', true) = 'true');

alter table shopping_events enable row level security;
alter table shopping_events force row level security;
create policy shopping_events_platform_only on shopping_events for all
  using (current_setting('app.bypass_rls', true) = 'true')
  with check (current_setting('app.bypass_rls', true) = 'true');

alter table auctions enable row level security;
alter table auctions force row level security;
create policy auctions_read_all on auctions for select using (true);
create policy auctions_platform_write on auctions for insert with check (current_setting('app.bypass_rls', true) = 'true');
create policy auctions_platform_update on auctions for update using (current_setting('app.bypass_rls', true) = 'true');

alter table auction_bids enable row level security;
alter table auction_bids force row level security;
create policy auction_bids_read on auction_bids for select using (
  user_id::text = current_setting('app.current_user_id', true)
  or current_setting('app.bypass_rls', true) = 'true'
  or exists (select 1 from auctions a join merchants m on m.id = a.merchant_id where a.id = auction_bids.auction_id and m.owner_id::text = current_setting('app.current_user_id', true))
);
create policy auction_bids_platform_write on auction_bids for insert with check (current_setting('app.bypass_rls', true) = 'true');

alter table auction_orders enable row level security;
alter table auction_orders force row level security;
create policy auction_orders_owner on auction_orders for all using (
  user_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
) with check (
  user_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
);

alter table orders enable row level security;
alter table orders force row level security;
create policy orders_owner on orders for all using (
  user_id::text = current_setting('app.current_user_id', true)
  or current_setting('app.bypass_rls', true) = 'true'
  or exists (select 1 from merchants m where m.id = orders.merchant_id and m.owner_id::text = current_setting('app.current_user_id', true))
) with check (
  user_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
);

alter table saved_websites enable row level security;
alter table saved_websites force row level security;
create policy saved_websites_self on saved_websites for all using (
  user_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
) with check (
  user_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
);

alter table saved_auctions enable row level security;
alter table saved_auctions force row level security;
create policy saved_auctions_self on saved_auctions for all using (
  user_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
) with check (
  user_id::text = current_setting('app.current_user_id', true) or current_setting('app.bypass_rls', true) = 'true'
);
