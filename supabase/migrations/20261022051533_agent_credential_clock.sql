begin;

-- No table access or elevated privileges. The signing server reads the same
-- clock used by the existing grant lifetime policies and constraints.
create function public.agent_credential_time()
returns timestamptz
language sql volatile security invoker set search_path = ''
as $$ select pg_catalog.statement_timestamp() $$;
revoke all on function public.agent_credential_time() from public, anon, authenticated, service_role;
grant execute on function public.agent_credential_time() to authenticated;

commit;
