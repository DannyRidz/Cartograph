begin;

create table public.ai_cache (
  organization_id text not null default (auth.jwt() -> 'o' ->> 'id')
    references public.organizations(id) on delete cascade,
  cache_key text not null check (cache_key ~ '^[a-f0-9]{64}$'),
  model text not null check (length(model) > 0),
  kind text not null check (kind in ('file', 'folder', 'role')),
  body text not null check (length(body) > 0),
  created_at timestamptz not null default now(),
  primary key (organization_id, cache_key),
  check (kind <> 'role' or body in ('service', 'repository', 'model', 'util', 'config', 'component', 'hook'))
);
alter table public.ai_cache enable row level security;
alter table public.ai_cache force row level security;
revoke all on public.ai_cache from public, anon, authenticated, service_role;
grant select, insert on public.ai_cache to authenticated;
create policy organization_read on public.ai_cache for select to authenticated
  using (organization_id = (select auth.jwt() -> 'o' ->> 'id'));
create policy organization_create on public.ai_cache for insert to authenticated
  with check (organization_id = (select auth.jwt() -> 'o' ->> 'id'));

-- Keep completed maps immutable while permitting an explicit fresh analysis.
drop index public.analyses_one_repository_idx;
create unique index analyses_one_active_repository_idx on public.analyses (organization_id, project_id)
  where not is_seed and state in ('queued', 'parsing');
drop function public.begin_analysis(text);
create function public.begin_analysis(p_repository_url text, p_reanalyse boolean default false)
returns table (analysis_id uuid, created boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  org text := auth.jwt() -> 'o' ->> 'id';
  project uuid;
  analysis uuid;
begin
  if org is null then raise exception 'An active organization is required.'; end if;
  if p_repository_url !~ '^https://github[.]com/[a-z0-9][a-z0-9-]*/[a-z0-9._-]+$'
    or p_repository_url ~ '[.]git$' then raise exception 'A canonical GitHub URL is required.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(org || ':' || p_repository_url, 0));
  insert into public.organizations (id) values (org) on conflict do nothing;
  insert into public.projects (organization_id, repository_url) values (org, p_repository_url) on conflict do nothing;
  select id into strict project from public.projects
    where lower(regexp_replace(rtrim(repository_url, '/'), '[.]git$', '', 'i')) = p_repository_url;
  select id into analysis from public.analyses where project_id = project and not is_seed
    and (not p_reanalyse or state in ('queued', 'parsing'))
    order by created_at desc, id desc limit 1;
  if analysis is not null then return query select analysis, false; return; end if;
  insert into public.analyses (organization_id, project_id, state, stage, stage_message)
    values (org, project, 'parsing', 'fetch', 'Fetching the public repository archive.') returning id into analysis;
  return query select analysis, true;
end;
$$;
revoke all on function public.begin_analysis(text, boolean) from public, anon, service_role;
grant execute on function public.begin_analysis(text, boolean) to authenticated;

commit;
