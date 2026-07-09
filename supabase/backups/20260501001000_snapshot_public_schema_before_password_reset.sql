-- Public schema backup script before applying password reset migration.
-- Project: MementoLunarTech
-- Project ref: cfaphpoblppwlomrtzwh
-- Created: 2026-05-01
--
-- Purpose:
-- Run this before applying auth/password-reset migrations if you want an
-- in-database metadata snapshot of the current application schema.
--
-- Current MCP inspection at creation time:
-- - public schema had no base tables.
-- - public schema had no columns.
-- - public schema had no RLS policies.
-- - public schema had no custom functions.
--
-- This script is intentionally metadata-only. It captures table/column/function
-- definitions and policy metadata, not table data. If public tables exist when
-- this script is run later, their metadata will be stored in backup tables.

create schema if not exists backup_20260501;

drop table if exists backup_20260501.public_tables;
create table backup_20260501.public_tables as
select
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
order by table_schema, table_name;

drop table if exists backup_20260501.public_columns;
create table backup_20260501.public_columns as
select
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_schema,
  udt_name,
  is_nullable,
  column_default,
  character_maximum_length,
  numeric_precision,
  numeric_scale,
  datetime_precision
from information_schema.columns
where table_schema = 'public'
order by table_schema, table_name, ordinal_position;

drop table if exists backup_20260501.public_constraints;
create table backup_20260501.public_constraints as
select
  tc.constraint_schema,
  tc.constraint_name,
  tc.table_schema,
  tc.table_name,
  tc.constraint_type,
  kcu.column_name,
  kcu.ordinal_position,
  ccu.table_schema as foreign_table_schema,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on kcu.constraint_schema = tc.constraint_schema
 and kcu.constraint_name = tc.constraint_name
 and kcu.table_schema = tc.table_schema
 and kcu.table_name = tc.table_name
left join information_schema.constraint_column_usage ccu
  on ccu.constraint_schema = tc.constraint_schema
 and ccu.constraint_name = tc.constraint_name
where tc.table_schema = 'public'
order by tc.table_schema, tc.table_name, tc.constraint_name, kcu.ordinal_position;

drop table if exists backup_20260501.public_rls;
create table backup_20260501.public_rls as
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname = 'public'
order by n.nspname, c.relname;

drop table if exists backup_20260501.public_policies;
create table backup_20260501.public_policies as
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by schemaname, tablename, policyname;

drop table if exists backup_20260501.public_functions;
create table backup_20260501.public_functions as
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  pg_get_userbyid(p.proowner) as owner_name,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by n.nspname, p.proname, arguments;

drop table if exists backup_20260501.public_indexes;
create table backup_20260501.public_indexes as
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
order by schemaname, tablename, indexname;

comment on schema backup_20260501 is
  'Metadata snapshot of public schema before safe password reset migration.';
