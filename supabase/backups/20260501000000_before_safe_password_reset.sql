-- Backup/rollback snapshot before applying safe password reset migration.
-- Project: MementoLunarTech
-- Project ref: cfaphpoblppwlomrtzwh
-- Captured: 2026-05-01
--
-- Live pre-change inspection results from Supabase MCP:
-- - public.password_reset_codes did not exist.
-- - public.reset_user_password(text, text) did not exist.
-- - public.create_password_reset_code(...) did not exist.
-- - public.verify_and_consume_reset_code(...) did not exist.
-- - No RLS policies existed for public.password_reset_codes.
-- - public schema had no application tables, columns, policies, or functions.
--
-- Rollback for this phase:
-- Running this file removes the password reset objects introduced by
-- supabase/migrations/20260501000001_safe_password_reset.sql and returns the
-- reset-related schema to the captured pre-change state. It intentionally does
-- not recreate the old unsafe RPC or plaintext/public reset-code table.

drop function if exists public.verify_and_consume_reset_code(text, text, integer);
drop function if exists public.create_password_reset_code(text, text, timestamptz, text, text, integer, interval);
drop function if exists public.reset_user_password(text, text);
drop table if exists public.password_reset_codes;
