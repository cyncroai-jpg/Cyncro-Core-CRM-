-- Cyncro Dispatch multi-tenant field-service schema.
create extension if not exists pgcrypto;

create type public.dispatch_role as enum ('owner', 'dispatcher', 'technician');
create type public.dispatch_job_status as enum ('booked', 'assigned', 'in_progress', 'complete', 'invoiced', 'cancelled');

create table public.dispatch_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subscription_status text not null default 'trialing',
  subscription_plan text not null default 'professional',
  technician_limit integer not null default 10,
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

create table public.dispatch_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.dispatch_role not null,
  hourly_rate numeric(10,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.dispatch_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  customer_id uuid,
  booking_id uuid,
  service_type text not null,
  service_date timestamptz not null,
  status public.dispatch_job_status not null default 'booked',
  address text not null,
  latitude double precision,
  longitude double precision,
  customer_notes text,
  internal_notes text,
  lead_source text,
  revenue numeric(12,2) not null default 0,
  labor_cost numeric(12,2) not null default 0,
  material_cost numeric(12,2) not null default 0,
  route_position integer,
  estimated_minutes integer,
  arrived_at timestamptz,
  completed_at timestamptz,
  invoiced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dispatch_job_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  job_id uuid not null references public.dispatch_jobs(id) on delete cascade,
  technician_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  unique(job_id, technician_id)
);

create table public.dispatch_tech_locations (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  technician_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid references public.dispatch_jobs(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters numeric(8,2),
  speed_mph numeric(8,2),
  recorded_at timestamptz not null default now()
);

create table public.dispatch_work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  job_id uuid not null unique references public.dispatch_jobs(id) on delete cascade,
  scope text,
  checklist jsonb not null default '[]'::jsonb,
  customer_signature_path text,
  signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dispatch_job_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  job_id uuid not null references public.dispatch_jobs(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id),
  photo_type text not null check (photo_type in ('before', 'after', 'equipment', 'issue', 'other')),
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table public.dispatch_job_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  job_id uuid not null references public.dispatch_jobs(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  note text not null,
  created_at timestamptz not null default now()
);

create table public.dispatch_equipment_installed (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  job_id uuid not null references public.dispatch_jobs(id) on delete cascade,
  customer_id uuid,
  equipment_type text not null,
  manufacturer text,
  model text,
  serial_number text,
  installation_date date not null,
  warranty_expires_on date,
  created_at timestamptz not null default now()
);

create table public.dispatch_materials_used (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  job_id uuid not null references public.dispatch_jobs(id) on delete cascade,
  name text not null,
  sku text,
  quantity numeric(10,2) not null default 1,
  unit_cost numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.dispatch_job_profitability (
  job_id uuid primary key references public.dispatch_jobs(id) on delete cascade,
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  revenue numeric(12,2) not null default 0,
  labor_cost numeric(12,2) not null default 0,
  material_cost numeric(12,2) not null default 0,
  profit numeric(12,2) generated always as (revenue - labor_cost - material_cost) stored,
  margin_percent numeric(8,2),
  calculated_at timestamptz not null default now()
);

create table public.dispatch_sms_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  customer_id uuid,
  phone_e164 text not null,
  agent_name text not null default 'Nova',
  messages jsonb not null default '[]'::jsonb,
  outcome text,
  booked_job_id uuid references public.dispatch_jobs(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.dispatch_setter_follow_ups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  customer_id uuid,
  sequence_day integer not null check (sequence_day in (3, 7, 14)),
  message text not null,
  sent_at timestamptz,
  replied_at timestamptz,
  outcome text,
  attributed_revenue numeric(12,2) not null default 0
);

create table public.dispatch_agent_learning (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  agent_name text not null,
  insight text not null,
  evidence jsonb not null default '{}'::jsonb,
  predicted_impact text,
  approval_status text not null default 'pending',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.dispatch_equipment_warranty (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  equipment_id uuid not null references public.dispatch_equipment_installed(id) on delete cascade,
  expires_on date not null,
  reminder_days_before integer not null default 30,
  reminder_sent_at timestamptz,
  resulting_job_id uuid references public.dispatch_jobs(id),
  created_at timestamptz not null default now()
);

create index dispatch_jobs_org_date_idx on public.dispatch_jobs (organization_id, service_date);
create index dispatch_jobs_org_status_idx on public.dispatch_jobs (organization_id, status);
create index dispatch_assignments_tech_idx on public.dispatch_job_assignments (technician_id, job_id);
create index dispatch_locations_tech_time_idx on public.dispatch_tech_locations (technician_id, recorded_at desc);
create index dispatch_warranty_expiry_idx on public.dispatch_equipment_warranty (organization_id, expires_on);

create or replace function public.dispatch_has_role(org_id uuid, allowed_roles public.dispatch_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dispatch_memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.active = true
      and m.role = any(allowed_roles)
  );
$$;

alter table public.dispatch_organizations enable row level security;
alter table public.dispatch_memberships enable row level security;
alter table public.dispatch_jobs enable row level security;
alter table public.dispatch_job_assignments enable row level security;
alter table public.dispatch_tech_locations enable row level security;
alter table public.dispatch_work_orders enable row level security;
alter table public.dispatch_job_photos enable row level security;
alter table public.dispatch_job_notes enable row level security;
alter table public.dispatch_equipment_installed enable row level security;
alter table public.dispatch_materials_used enable row level security;
alter table public.dispatch_job_profitability enable row level security;
alter table public.dispatch_sms_conversations enable row level security;
alter table public.dispatch_setter_follow_ups enable row level security;
alter table public.dispatch_agent_learning enable row level security;
alter table public.dispatch_equipment_warranty enable row level security;

create policy "dispatch owners and dispatchers manage jobs" on public.dispatch_jobs
for all using (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]))
with check (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]));

create policy "dispatch technicians read assigned jobs" on public.dispatch_jobs
for select using (
  exists (
    select 1 from public.dispatch_job_assignments a
    where a.job_id = dispatch_jobs.id and a.technician_id = auth.uid()
  )
);

create policy "dispatch technicians read their assignments" on public.dispatch_job_assignments
for select using (
  technician_id = auth.uid()
  or public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[])
);

create policy "dispatch operations manage assignments" on public.dispatch_job_assignments
for all using (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]))
with check (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]));

create policy "dispatch technicians write own location" on public.dispatch_tech_locations
for insert with check (
  technician_id = auth.uid()
  and public.dispatch_has_role(organization_id, array['technician']::public.dispatch_role[])
);

create policy "dispatch operations see organization locations" on public.dispatch_tech_locations
for select using (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]));

-- Equivalent organization/assignment policies should be applied to every child
-- table when the migration is installed in the production Supabase project.
