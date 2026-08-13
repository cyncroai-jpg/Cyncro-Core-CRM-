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

create table public.dispatch_idempotency_keys (
  organization_id uuid not null references public.dispatch_organizations(id) on delete cascade,
  idempotency_key text not null,
  operation text not null,
  resource_id uuid,
  created_at timestamptz not null default now(),
  primary key (organization_id, idempotency_key)
);

create table public.dispatch_rate_limits (
  bucket text not null,
  key_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 1,
  primary key (bucket, key_hash)
);

create table public.dispatch_audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid,
  actor_id uuid,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.dispatch_sms_inbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.dispatch_organizations(id) on delete cascade,
  phone_hash text not null,
  encrypted_from bytea not null,
  encrypted_body bytea not null,
  provider_message_id text not null unique,
  request_id text,
  processing_status text not null default 'queued',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index dispatch_jobs_org_date_idx on public.dispatch_jobs (organization_id, service_date);
create index dispatch_jobs_org_status_idx on public.dispatch_jobs (organization_id, status);
create index dispatch_assignments_tech_idx on public.dispatch_job_assignments (technician_id, job_id);
create index dispatch_locations_tech_time_idx on public.dispatch_tech_locations (technician_id, recorded_at desc);
create index dispatch_warranty_expiry_idx on public.dispatch_equipment_warranty (organization_id, expires_on);
create index dispatch_jobs_tech_route_idx on public.dispatch_job_assignments (technician_id, assigned_at desc);
create index dispatch_sms_inbox_queue_idx on public.dispatch_sms_inbox (processing_status, next_attempt_at);
create index dispatch_audit_org_time_idx on public.dispatch_audit_log (organization_id, created_at desc);
create index dispatch_rate_limit_window_idx on public.dispatch_rate_limits (window_started_at);

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
alter table public.dispatch_idempotency_keys enable row level security;
alter table public.dispatch_rate_limits enable row level security;
alter table public.dispatch_audit_log enable row level security;
alter table public.dispatch_sms_inbox enable row level security;

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

create policy "dispatch members see own membership" on public.dispatch_memberships
for select using (user_id = auth.uid() or public.dispatch_has_role(organization_id, array['owner']::public.dispatch_role[]));

create policy "dispatch owners manage membership" on public.dispatch_memberships
for all using (public.dispatch_has_role(organization_id, array['owner']::public.dispatch_role[]))
with check (public.dispatch_has_role(organization_id, array['owner']::public.dispatch_role[]));

create policy "dispatch operations manage work orders" on public.dispatch_work_orders
for all using (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]))
with check (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]));

create policy "dispatch technicians access assigned work orders" on public.dispatch_work_orders
for select using (exists (
  select 1 from public.dispatch_job_assignments a
  where a.job_id = dispatch_work_orders.job_id and a.technician_id = auth.uid()
));

create policy "dispatch technicians manage assigned photos" on public.dispatch_job_photos
for all using (uploaded_by = auth.uid() and exists (
  select 1 from public.dispatch_job_assignments a
  where a.job_id = dispatch_job_photos.job_id and a.technician_id = auth.uid()
)) with check (uploaded_by = auth.uid() and exists (
  select 1 from public.dispatch_job_assignments a
  where a.job_id = dispatch_job_photos.job_id and a.technician_id = auth.uid()
));

create policy "dispatch operations manage photos" on public.dispatch_job_photos
for all using (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]))
with check (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]));

create policy "dispatch assigned members manage notes" on public.dispatch_job_notes
for all using (
  public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[])
  or (author_id = auth.uid() and exists (
    select 1 from public.dispatch_job_assignments a
    where a.job_id = dispatch_job_notes.job_id and a.technician_id = auth.uid()
  ))
) with check (
  public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[])
  or (author_id = auth.uid() and exists (
    select 1 from public.dispatch_job_assignments a
    where a.job_id = dispatch_job_notes.job_id and a.technician_id = auth.uid()
  ))
);

create policy "dispatch organization equipment access" on public.dispatch_equipment_installed
for all using (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]))
with check (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]));

create policy "dispatch organization materials access" on public.dispatch_materials_used
for all using (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]))
with check (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]));

create policy "dispatch owner profitability access" on public.dispatch_job_profitability
for select using (public.dispatch_has_role(organization_id, array['owner']::public.dispatch_role[]));

create policy "dispatch operations conversation access" on public.dispatch_sms_conversations
for all using (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]))
with check (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]));

create policy "dispatch operations setter access" on public.dispatch_setter_follow_ups
for all using (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]))
with check (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]));

create policy "dispatch owner learning access" on public.dispatch_agent_learning
for all using (public.dispatch_has_role(organization_id, array['owner']::public.dispatch_role[]))
with check (public.dispatch_has_role(organization_id, array['owner']::public.dispatch_role[]));

create policy "dispatch owner warranty access" on public.dispatch_equipment_warranty
for all using (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]))
with check (public.dispatch_has_role(organization_id, array['owner','dispatcher']::public.dispatch_role[]));

create policy "dispatch owner audit access" on public.dispatch_audit_log
for select using (public.dispatch_has_role(organization_id, array['owner']::public.dispatch_role[]));

create or replace function public.dispatch_consume_rate_limit(
  p_bucket text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.dispatch_rate_limits%rowtype;
  v_retry integer;
begin
  if p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit configuration';
  end if;

  insert into public.dispatch_rate_limits(bucket, key_hash, window_started_at, request_count)
  values (p_bucket, p_key_hash, v_now, 1)
  on conflict (bucket, key_hash) do update set
    window_started_at = case
      when dispatch_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
      else dispatch_rate_limits.window_started_at
    end,
    request_count = case
      when dispatch_rate_limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
      else dispatch_rate_limits.request_count + 1
    end
  returning * into v_row;

  v_retry := greatest(1, ceil(extract(epoch from (v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now)))::integer);
  return jsonb_build_object(
    'allowed', v_row.request_count <= p_limit,
    'remaining', greatest(0, p_limit - v_row.request_count),
    'retry_after_seconds', v_retry
  );
end;
$$;

revoke all on function public.dispatch_consume_rate_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.dispatch_consume_rate_limit(text,text,integer,integer) to service_role;

create or replace function public.dispatch_create_job(
  p_idempotency_key text,
  p_service_type text,
  p_service_date timestamptz,
  p_address text,
  p_customer_id uuid default null,
  p_customer_notes text default null,
  p_lead_source text default null,
  p_revenue numeric default 0,
  p_assigned_tech_id uuid default null
) returns public.dispatch_jobs
language plpgsql security invoker set search_path = public as $$
declare
  v_org uuid;
  v_existing uuid;
  v_job public.dispatch_jobs%rowtype;
begin
  select m.organization_id into v_org
  from public.dispatch_memberships m
  where m.user_id = auth.uid() and m.active = true and m.role in ('owner','dispatcher')
  limit 1;
  if v_org is null then raise exception 'forbidden'; end if;

  select resource_id into v_existing from public.dispatch_idempotency_keys
  where organization_id = v_org and idempotency_key = p_idempotency_key;
  if v_existing is not null then
    select * into v_job from public.dispatch_jobs where id = v_existing;
    return v_job;
  end if;

  insert into public.dispatch_jobs(
    organization_id, customer_id, service_type, service_date, address,
    customer_notes, lead_source, revenue, status
  ) values (
    v_org, p_customer_id, p_service_type, p_service_date, p_address,
    p_customer_notes, p_lead_source, p_revenue,
    case when p_assigned_tech_id is null then 'booked' else 'assigned' end
  ) returning * into v_job;

  if p_assigned_tech_id is not null then
    if not exists (
      select 1 from public.dispatch_memberships
      where organization_id = v_org and user_id = p_assigned_tech_id and role = 'technician' and active = true
    ) then raise exception 'invalid technician'; end if;
    insert into public.dispatch_job_assignments(organization_id, job_id, technician_id, assigned_by)
    values (v_org, v_job.id, p_assigned_tech_id, auth.uid());
  end if;

  insert into public.dispatch_idempotency_keys(organization_id,idempotency_key,operation,resource_id)
  values(v_org,p_idempotency_key,'create_job',v_job.id);
  insert into public.dispatch_audit_log(organization_id,actor_id,action,resource_type,resource_id)
  values(v_org,auth.uid(),'job.created','job',v_job.id);
  return v_job;
end;
$$;

create or replace function public.dispatch_record_location(
  p_job_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_meters numeric,
  p_recorded_at timestamptz
) returns void
language plpgsql security invoker set search_path = public as $$
declare v_org uuid;
begin
  select a.organization_id into v_org from public.dispatch_job_assignments a
  where a.job_id = p_job_id and a.technician_id = auth.uid();
  if v_org is null then raise exception 'forbidden'; end if;
  if p_recorded_at < now() - interval '24 hours' then raise exception 'stale location'; end if;
  insert into public.dispatch_tech_locations(
    organization_id, technician_id, job_id, latitude, longitude, accuracy_meters, recorded_at
  ) values(v_org, auth.uid(), p_job_id, p_latitude, p_longitude, p_accuracy_meters, p_recorded_at);
end;
$$;

create or replace function public.dispatch_sync_operations(p_operations jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_operation jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if jsonb_array_length(p_operations) > 50 then raise exception 'too many operations'; end if;
  for v_operation in select * from jsonb_array_elements(p_operations)
  loop
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'id', v_operation->>'id',
      'status', 'accepted',
      'server_time', now()
    ));
  end loop;
  return v_results;
end;
$$;

create or replace function public.dispatch_ingest_sms(
  p_from text,
  p_body text,
  p_provider_message_id text,
  p_request_id text,
  p_encryption_key text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_duplicate boolean := false;
begin
  select id into v_id from public.dispatch_sms_inbox where provider_message_id = p_provider_message_id;
  if v_id is not null then v_duplicate := true;
  else
    insert into public.dispatch_sms_inbox(phone_hash,encrypted_from,encrypted_body,provider_message_id,request_id)
    values(
      encode(digest(p_from,'sha256'),'hex'),
      pgp_sym_encrypt(p_from,p_encryption_key,'cipher-algo=aes256'),
      pgp_sym_encrypt(p_body,p_encryption_key,'cipher-algo=aes256'),
      p_provider_message_id,
      p_request_id
    )
    returning id into v_id;
  end if;
  return jsonb_build_object('duplicate',v_duplicate,'conversation_id',v_id,'queued',true);
end;
$$;

revoke all on function public.dispatch_ingest_sms(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.dispatch_ingest_sms(text,text,text,text,text) to service_role;
