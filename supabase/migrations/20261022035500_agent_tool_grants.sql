begin;

create table public.agent_tool_grants (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  organization_id text not null,
  analysis_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  foreign key (organization_id, analysis_id)
    references public.analyses(organization_id, id) on delete cascade,
  check (expires_at > created_at and expires_at <= created_at + interval '5 minutes')
);
create index agent_tool_grants_organization_expiry_idx
  on public.agent_tool_grants (organization_id, expires_at);
alter table public.agent_tool_grants enable row level security;
alter table public.agent_tool_grants force row level security;
revoke all on public.agent_tool_grants from public, anon, authenticated, service_role;
grant insert, delete on public.agent_tool_grants to authenticated;
create policy register_agent_grant on public.agent_tool_grants for insert to authenticated
  with check (
    organization_id = (select auth.jwt() -> 'o' ->> 'id')
    and expires_at > statement_timestamp()
    and expires_at <= statement_timestamp() + interval '5 minutes'
    and exists (select 1 from public.analyses a where a.id = analysis_id
      and a.organization_id = agent_tool_grants.organization_id
      and a.state = 'completed' and not a.is_seed)
  );
create policy remove_expired_agent_grants on public.agent_tool_grants for delete to authenticated
  using (organization_id = (select auth.jwt() -> 'o' ->> 'id') and expires_at <= statement_timestamp());

-- This private helper may read only the grant registry. It never reads graph
-- tables with elevated privileges. The bearer must match a registered hash.
create or replace function cartograph_internal.agent_tool_scope()
returns table (organization_id text, analysis_id uuid)
language sql stable security definer set search_path = ''
as $$
  select g.organization_id, g.analysis_id
  from public.agent_tool_grants g
  where g.token_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    coalesce(nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb
      ->> 'x-cartograph-agent-token', ''), 'UTF8')), 'hex')
    and g.expires_at > pg_catalog.statement_timestamp()
$$;
revoke all on function cartograph_internal.agent_tool_scope() from public, anon, authenticated, service_role;
grant usage on schema cartograph_internal to anon;
grant execute on function cartograph_internal.agent_tool_scope() to anon;

grant select on public.analyses, public.files, public.edges, public.routes, public.file_roles to anon;
create policy agent_analysis_read on public.analyses for select to anon
  using ((organization_id, id) in (select s.organization_id, s.analysis_id
    from cartograph_internal.agent_tool_scope() s) and state = 'completed' and not is_seed);
do $$
declare t text;
begin
  foreach t in array array['files', 'edges', 'routes', 'file_roles'] loop
    execute format('create policy agent_graph_read on public.%I for select to anon
      using ((organization_id, analysis_id) in
        (select s.organization_id, s.analysis_id from cartograph_internal.agent_tool_scope() s))', t);
  end loop;
end $$;
commit;
