begin;

alter table public.analyses
  add column stage text not null default 'queued'
    check (stage in ('queued', 'fetch', 'select', 'parse', 'store', 'completed', 'failed')),
  add column stage_message text not null default 'Waiting to start.',
  add column failed_stage text check (failed_stage in ('fetch', 'select', 'parse', 'store')),
  add column failure_message text,
  add column updated_at timestamptz not null default now(),
  add column commit_sha text check (commit_sha ~ '^[a-f0-9]{40}$'),
  add column adapter text,
  add column schema_version integer check (schema_version = 1),
  add column coverage jsonb;

-- Demonstration rows are not parsed analyses and may share a project.
create unique index analyses_one_repository_idx
  on public.analyses (organization_id, project_id) where not is_seed;
create unique index projects_canonical_repository_idx on public.projects
  (organization_id, lower(regexp_replace(rtrim(repository_url, '/'), '[.]git$', '', 'i')));

alter table public.files
  add column folder text,
  add column module text,
  add column kind text check (kind in ('module', 'script')),
  add column line_count integer check (line_count >= 0),
  add column hash text check (hash ~ '^[a-f0-9]{64}$'),
  add column fan_in integer check (fan_in >= 0),
  add column fan_out integer check (fan_out >= 0);
alter table public.edges
  add column kind text not null default 'import' check (kind in ('import', 're-export', 'dynamic-import'));
-- PostgreSQL truncates this automatically generated constraint name.
do $$
declare constraint_name text;
begin
  select conname into strict constraint_name from pg_constraint
    where conrelid = 'public.edges'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (organization_id, analysis_id, source_file_id, target_file_id)';
  execute format('alter table public.edges drop constraint %I', constraint_name);
end;
$$;
alter table public.edges add unique (organization_id, analysis_id, source_file_id, target_file_id, kind);

-- Request clients retain their Clerk identity for every write. No secret client
-- and no SECURITY DEFINER function is needed to bypass tenant policies.
create policy organization_create on public.organizations for insert to authenticated
  with check (id = (select auth.jwt() -> 'o' ->> 'id'));
grant insert on public.organizations to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['projects', 'analyses', 'files', 'edges'] loop
    execute format('grant insert on public.%I to authenticated', table_name);
    execute format('create policy organization_create on public.%I for insert to authenticated with check (organization_id = (select auth.jwt() -> ''o'' ->> ''id''))', table_name);
  end loop;
end;
$$;
grant update on public.analyses to authenticated;
create policy organization_update on public.analyses for update to authenticated
  using (organization_id = (select auth.jwt() -> 'o' ->> 'id'))
  with check (organization_id = (select auth.jwt() -> 'o' ->> 'id'));

create function public.begin_analysis(p_repository_url text)
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
  insert into public.organizations (id) values (org) on conflict do nothing;
  insert into public.projects (organization_id, repository_url) values (org, p_repository_url)
    on conflict do nothing;
  select id into strict project from public.projects
    where lower(regexp_replace(rtrim(repository_url, '/'), '[.]git$', '', 'i')) = p_repository_url;
  insert into public.analyses (organization_id, project_id, state, stage, stage_message)
    values (org, project, 'parsing', 'fetch', 'Fetching the public repository archive.')
    on conflict (organization_id, project_id) where not is_seed do nothing returning id into analysis;
  if analysis is not null then return query select analysis, true;
  else
    return query select id, false from public.analyses where project_id = project and not is_seed;
  end if;
end;
$$;

create function public.advance_analysis(p_analysis_id uuid, p_expected_stage text, p_stage text, p_message text, p_commit_sha text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if (p_expected_stage, p_stage) not in (('fetch','select'), ('select','parse'), ('parse','store')) then
    raise exception 'Invalid analysis stage transition.';
  end if;
  update public.analyses set stage = p_stage, stage_message = p_message,
    commit_sha = coalesce(p_commit_sha, commit_sha), updated_at = now()
    where id = p_analysis_id and stage = p_expected_stage and state = 'parsing' and not is_seed;
  if not found then raise exception 'Analysis was not accessible or its stage changed.'; end if;
end;
$$;

create function public.fail_analysis(p_analysis_id uuid, p_stage text, p_message text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.analyses set state = 'failed', stage = 'failed', failed_stage = p_stage,
    failure_message = p_message, stage_message = p_message, updated_at = now()
    where id = p_analysis_id and state = 'parsing' and not is_seed;
  if not found then raise exception 'Could not persist the failed analysis.'; end if;
end;
$$;

-- Files, typed import edges, coverage and completion commit together. A failed
-- insert rolls everything back, leaving the top level catch free to record why.
create function public.store_analysis(p_analysis_id uuid, p_result jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  org text;
  edge_count integer;
begin
  select organization_id into strict org from public.analyses
    where id = p_analysis_id and stage = 'store' and state = 'parsing' and not is_seed for update;
  if (p_result ->> 'schemaVersion')::integer is distinct from 1
    or jsonb_typeof(p_result -> 'files') is distinct from 'array'
    or jsonb_typeof(p_result -> 'edges') is distinct from 'array'
    or jsonb_typeof(p_result -> 'coverage') is distinct from 'object'
    or (p_result -> 'coverage' ->> 'filesParsed')::integer is distinct from jsonb_array_length(p_result -> 'files') then
    raise exception 'Invalid parser output.';
  end if;
  insert into public.files (organization_id, analysis_id, path, folder, module, kind, line_count, hash, fan_in, fan_out)
    select org, p_analysis_id, f.path, f.folder, f.module, f.kind, f."lineCount", f.hash, f."fanIn", f."fanOut"
    from jsonb_to_recordset(p_result -> 'files') as f(path text, folder text, module text, kind text, "lineCount" integer, hash text, "fanIn" integer, "fanOut" integer);
  insert into public.edges (organization_id, analysis_id, source_file_id, target_file_id, kind)
    select org, p_analysis_id, source.id, target.id, e.kind
    from jsonb_to_recordset(p_result -> 'edges') as e("from" text, "to" text, kind text)
    join public.files source on source.analysis_id = p_analysis_id and source.path = e."from"
    join public.files target on target.analysis_id = p_analysis_id and target.path = e."to";
  get diagnostics edge_count = row_count;
  if edge_count <> jsonb_array_length(p_result -> 'edges') then raise exception 'An edge has no stored file.'; end if;
  update public.analyses set state = 'completed', stage = 'completed', stage_message = 'Analysis complete.',
    coverage = p_result -> 'coverage', adapter = p_result ->> 'adapter', schema_version = 1, updated_at = now()
    where id = p_analysis_id;
end;
$$;

revoke all on function public.begin_analysis(text), public.advance_analysis(uuid,text,text,text,text),
  public.fail_analysis(uuid,text,text), public.store_analysis(uuid,jsonb) from public, anon, service_role;
grant execute on function public.begin_analysis(text), public.advance_analysis(uuid,text,text,text,text),
  public.fail_analysis(uuid,text,text), public.store_analysis(uuid,jsonb) to authenticated;

commit;
