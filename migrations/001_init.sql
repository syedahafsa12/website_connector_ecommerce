-- Agentic Commerce POC — initial schema.
-- Plain PostgreSQL. No Supabase-specific extensions used except pgcrypto for gen_random_uuid().

create extension if not exists pgcrypto;

create table merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  domain text not null,
  category text not null,
  status text not null default 'pending_verification'
    check (status in ('pending_verification','domain_verified','authorized','revoked')),
  connector_type text not null check (connector_type in ('rest','mcp','web')),
  connector_config jsonb not null default '{}'::jsonb,
  is_adversarial_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table domain_verifications (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  method text not null check (method in ('dns_txt','well_known_file')),
  token text not null,
  status text not null default 'pending' check (status in ('pending','verified','failed')),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_domain_verifications_merchant on domain_verifications(merchant_id);

create table merchant_authorizations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  scopes text[] not null,
  status text not null default 'active' check (status in ('active','revoked')),
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index idx_merchant_authorizations_merchant on merchant_authorizations(merchant_id);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  merchant_id uuid references merchants(id) on delete set null,
  session_id text,
  task_id text,
  actor text not null,
  event_type text not null,
  capability text,
  result text,
  policy_decision text,
  details jsonb not null default '{}'::jsonb
);
create index idx_audit_events_merchant on audit_events(merchant_id);
create index idx_audit_events_occurred_at on audit_events(occurred_at desc);
create index idx_audit_events_session on audit_events(session_id);

create table referrals (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  merchant_id uuid not null references merchants(id),
  offer_id text not null,
  status text not null default 'offer_presented'
    check (status in ('offer_presented','offer_selected','redirect_issued','landing_confirmed')),
  referral_token text not null unique,
  source text not null default 'shopping_agent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_referrals_session on referrals(session_id);
create index idx_referrals_merchant on referrals(merchant_id);

create table referral_events (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references referrals(id) on delete cascade,
  event_type text not null,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);
create index idx_referral_events_referral on referral_events(referral_id);

create table merchant_insights (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  merchant_id uuid not null references merchants(id),
  requirements jsonb not null,
  decision text not null check (decision in ('selected','rejected')),
  reasons text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_merchant_insights_session on merchant_insights(session_id);
create index idx_merchant_insights_merchant on merchant_insights(merchant_id);

-- --------------------------------------------------------------------------
-- Tenant isolation via Row Level Security.
--
-- POC simplification: rather than provisioning a distinct authenticated DB
-- role per merchant (production would do this, e.g. via Supabase auth JWT
-- claims), isolation is enforced with a session-scoped GUC
-- (`app.current_merchant_id`) that merchant-facing code sets with
-- `SET LOCAL` at the start of each transaction. Orchestration code (the
-- agent/capability-router/audit paths, which legitimately need cross-merchant
-- access) sets `app.bypass_rls = 'true'`. FORCE ROW LEVEL SECURITY makes this
-- apply even to the table owner, so the isolation test is meaningful.
-- --------------------------------------------------------------------------

alter table merchant_insights enable row level security;
alter table merchant_insights force row level security;

create policy merchant_insights_isolation on merchant_insights
  using (
    merchant_id::text = current_setting('app.current_merchant_id', true)
    or current_setting('app.bypass_rls', true) = 'true'
  )
  with check (
    merchant_id::text = current_setting('app.current_merchant_id', true)
    or current_setting('app.bypass_rls', true) = 'true'
  );

alter table referrals enable row level security;
alter table referrals force row level security;

create policy referrals_isolation on referrals
  using (
    merchant_id::text = current_setting('app.current_merchant_id', true)
    or current_setting('app.bypass_rls', true) = 'true'
  )
  with check (
    merchant_id::text = current_setting('app.current_merchant_id', true)
    or current_setting('app.bypass_rls', true) = 'true'
  );
