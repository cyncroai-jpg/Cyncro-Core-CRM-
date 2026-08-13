# Cyncro Dispatch production controls

This repository contains a hardened API boundary and a Supabase migration for
Cyncro Dispatch. External integrations fail closed until their environment
values are configured.

## Implemented safeguards

- Supabase session verification on user-facing Dispatch APIs.
- Tenant and role enforcement through PostgreSQL row-level security.
- Technician reads restricted to explicitly assigned jobs.
- Atomic, database-backed rate limits for SMS, GPS, job reads/writes, and sync.
- Signed inbound SMS webhooks and AES-256 encrypted SMS payloads at rest.
- Idempotency keys for job creation and provider message IDs for SMS deduplication.
- Bounded request bodies, pagination limits, field validation, and coordinate checks.
- Request IDs, structured JSON logs, secret redaction, safe client errors, and timeouts.
- Low-accuracy GPS responses that ask the mobile client to queue locally and retry.
- Offline sync batches capped at 50 operations with per-operation acknowledgements.
- Audit log records for privileged changes.
- Composite indexes for job, technician, GPS, queue, warranty, and audit queries.

## Required launch steps

1. Apply `supabase/migrations/20260813_dispatch.sql` to the production project.
2. Configure all server-only values from `.env.example` in the hosting environment.
3. Replace the demo login with the production Supabase Auth client.
4. Configure the SMS provider to send signed JSON to `/api/dispatch/sms/inbound`.
5. Add a queue worker that claims `dispatch_sms_inbox` rows with `FOR UPDATE SKIP LOCKED`.
6. Run RLS tests for Owner, Dispatcher, Technician, expired session, and cross-tenant access.
7. Load-test the GPS and SMS endpoints using production-equivalent concurrency.
8. Connect structured logs to Sentry or the selected observability provider and alert on 5xx rate.

## Safe failure behavior

If Supabase or a required secret is missing, APIs return `503` with a safe message
and do not mutate customer data. Expired sessions return `401`; forbidden records
return `403`; malformed data returns `400`; rate limits return `429` and a
`Retry-After` header. Every response includes an `x-request-id` for support.
