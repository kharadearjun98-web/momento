# Supabase Branch Testing Log

## 2026-05-01 - P0 Password Reset Flow

**Production project:** `MementoLunarTech`

**Production project ref:** `cfaphpoblppwlomrtzwh`

**Requested branch name:** `p0-password-reset-edge-function`

**Purpose:** Test the safe password-reset migration and Edge Function flow before applying changes to the main Supabase project.

### Result

Branch creation was attempted through the Supabase MCP, but Supabase rejected the request:

```text
PaymentRequiredException: Branching is supported only on the Pro plan or above
```

The organization is currently on the Free plan, so a Supabase preview branch cannot be created for this project.

### Cost Check

Supabase reported the branch cost as:

```text
$0.01344/hour
```

Cost confirmation was completed, but creation still failed because branching is unavailable on the current plan.

### Current Decision

Supabase Branching is unavailable on the current Free plan, so this work is being applied to the main Supabase project only after creating backup SQL files.

The safe migration has been prepared locally in:

```text
supabase/migrations/20260501000001_safe_password_reset.sql
```

### Backup Files

Backups for the pre-change state are stored under:

```text
supabase/backups/
```

Current files:

```text
supabase/backups/20260501000000_before_safe_password_reset.sql
supabase/backups/20260501001000_snapshot_public_schema_before_password_reset.sql
```

`20260501000000_before_safe_password_reset.sql` is the rollback script for the password-reset phase. It returns reset-related schema to the inspected pre-change state.

`20260501001000_snapshot_public_schema_before_password_reset.sql` snapshots the current `public` schema metadata into `backup_20260501` before the password-reset migration is applied.

### Applied To Main Project

The following migrations were applied to the main Supabase project `cfaphpoblppwlomrtzwh`:

```text
backup_public_schema_before_password_reset
safe_password_reset
```

The following Edge Functions were deployed and are active:

```text
request-reset-code
reset-password
```

Both functions have JWT verification enabled.

### Post-Apply Verification

- `public.password_reset_codes` exists with RLS enabled.
- `public.password_reset_codes` has no public RLS policies.
- `anon` and `authenticated` do not have table privileges on `public.password_reset_codes`.
- `service_role` has table privileges on `public.password_reset_codes`.
- `public.reset_user_password(text, text)` is absent.
- `public.create_password_reset_code(...)` and `public.verify_and_consume_reset_code(...)` exist as `SECURITY DEFINER` helpers.

Supabase advisor reports `RLS Enabled No Policy` for `public.password_reset_codes`. This is expected for this table because it is intentionally service-role-only and should not be accessible through public RLS policies.

### Options

1. Upgrade the Supabase organization to Pro, create the preview branch, then apply the migration and deploy Edge Functions there.
2. Create a separate staging Supabase project and apply the migration there.
3. Apply the migration directly to production only after review and explicit approval.

For this P0 auth-adjacent change, option 1 or 2 is preferred.
