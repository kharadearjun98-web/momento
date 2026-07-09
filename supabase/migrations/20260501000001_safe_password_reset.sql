-- Safe password reset flow.
-- This migration intentionally removes the old browser-callable password reset RPC
-- and replaces public reset-code access with service-role-only primitives.

create extension if not exists pgcrypto with schema extensions;

drop function if exists public.reset_user_password(text, text);

create table if not exists public.password_reset_codes (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  locked_at timestamptz,
  request_ip text,
  user_agent text
);

alter table public.password_reset_codes enable row level security;

drop policy if exists "Anyone can insert password reset codes" on public.password_reset_codes;
drop policy if exists "Anyone can read password reset codes" on public.password_reset_codes;
drop policy if exists "Anyone can update password reset codes" on public.password_reset_codes;

revoke all on public.password_reset_codes from anon, authenticated;
grant all on public.password_reset_codes to service_role;

create index if not exists idx_password_reset_codes_email_created_at
  on public.password_reset_codes (email, created_at desc);

create index if not exists idx_password_reset_codes_active
  on public.password_reset_codes (email, expires_at desc)
  where used_at is null and locked_at is null;

create index if not exists idx_password_reset_codes_user_id
  on public.password_reset_codes (user_id);

create or replace function public.create_password_reset_code(
  p_email text,
  p_code_hash text,
  p_expires_at timestamptz,
  p_request_ip text default null,
  p_user_agent text default null,
  p_limit integer default 5,
  p_window interval default interval '15 minutes'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  normalized_email text := lower(trim(p_email));
  target_user_id uuid;
  recent_count integer;
  inserted_id uuid;
begin
  select id
    into target_user_id
  from auth.users
  where lower(email) = normalized_email
  limit 1;

  if target_user_id is null then
    return jsonb_build_object('success', true, 'email_exists', false);
  end if;

  select count(*)
    into recent_count
  from public.password_reset_codes
  where email = normalized_email
    and created_at >= now() - p_window;

  if recent_count >= p_limit then
    return jsonb_build_object('success', false, 'error', 'rate_limited');
  end if;

  update public.password_reset_codes
    set used_at = coalesce(used_at, now())
  where email = normalized_email
    and used_at is null
    and locked_at is null;

  insert into public.password_reset_codes (
    user_id,
    email,
    code_hash,
    expires_at,
    request_ip,
    user_agent
  )
  values (
    target_user_id,
    normalized_email,
    p_code_hash,
    p_expires_at,
    p_request_ip,
    p_user_agent
  )
  returning id into inserted_id;

  return jsonb_build_object(
    'success', true,
    'email_exists', true,
    'reset_code_id', inserted_id
  );
end;
$$;

revoke all on function public.create_password_reset_code(text, text, timestamptz, text, text, integer, interval) from public, anon, authenticated;
grant execute on function public.create_password_reset_code(text, text, timestamptz, text, text, integer, interval) to service_role;

create or replace function public.verify_and_consume_reset_code(
  p_email text,
  p_code_hash text,
  p_max_attempts integer default 5
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  reset_row public.password_reset_codes%rowtype;
  next_attempts integer;
begin
  select *
    into reset_row
  from public.password_reset_codes
  where email = lower(trim(p_email))
    and used_at is null
    and locked_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if reset_row.expires_at <= now() then
    update public.password_reset_codes
      set locked_at = now()
    where id = reset_row.id;

    return jsonb_build_object('success', false, 'error', 'expired_code');
  end if;

  if reset_row.attempts >= p_max_attempts then
    update public.password_reset_codes
      set locked_at = coalesce(locked_at, now())
    where id = reset_row.id;

    return jsonb_build_object('success', false, 'error', 'too_many_attempts');
  end if;

  if reset_row.code_hash <> p_code_hash then
    next_attempts := reset_row.attempts + 1;

    update public.password_reset_codes
      set attempts = next_attempts,
          locked_at = case when next_attempts >= p_max_attempts then now() else locked_at end
    where id = reset_row.id;

    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  update public.password_reset_codes
    set used_at = now()
  where id = reset_row.id;

  return jsonb_build_object(
    'success', true,
    'user_id', reset_row.user_id,
    'reset_code_id', reset_row.id
  );
end;
$$;

revoke all on function public.verify_and_consume_reset_code(text, text, integer) from public, anon, authenticated;
grant execute on function public.verify_and_consume_reset_code(text, text, integer) to service_role;
