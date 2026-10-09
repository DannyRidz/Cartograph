\set ON_ERROR_STOP on
-- Terminal verification only. All fixtures are rolled back, including deletions.
begin;

do $$
declare
  org_id text;
  project_id uuid;
  analysis_id uuid;
  source_id uuid;
  target_id uuid;
  tables text[] := array['organizations', 'projects', 'analyses', 'files', 'edges', 'routes', 'explanations', 'file_roles', 'insights'];
  table_name text;
begin
  foreach table_name in array tables loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name
        and c.relrowsecurity and c.relforcerowsecurity
    ) then
      raise exception 'RLS missing on %', table_name;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = table_name and policyname = 'organization_read') then
      raise exception 'Read policy missing on %', table_name;
    end if;
    if has_table_privilege('anon', 'public.' || table_name, 'select')
      or has_table_privilege('authenticated', 'public.' || table_name, 'insert,update,delete') then
      raise exception 'Unexpected anonymous read or session write grant on %', table_name;
    end if;
  end loop;

  foreach org_id in array array['org_Phase02VerifyA', 'org_Phase02VerifyB'] loop
    insert into public.organizations (id) values (org_id);
    insert into public.projects (organization_id, repository_url)
      values (org_id, 'https://github.com/example/verification-fixture') returning id into project_id;
    insert into public.analyses (organization_id, project_id, state)
      values (org_id, project_id, 'queued') returning id into analysis_id;
    insert into public.files (organization_id, analysis_id, path)
      values (org_id, analysis_id, 'source.ts') returning id into source_id;
    insert into public.files (organization_id, analysis_id, path)
      values (org_id, analysis_id, 'target.ts') returning id into target_id;
    insert into public.edges (organization_id, analysis_id, source_file_id, target_file_id)
      values (org_id, analysis_id, source_id, target_id);
    insert into public.routes (organization_id, analysis_id, file_id, method, path)
      values (org_id, analysis_id, source_id, 'GET', '/fixture');
    insert into public.explanations (organization_id, analysis_id, file_id, body)
      values (org_id, analysis_id, source_id, 'Verification fixture, not parser output.');
    insert into public.file_roles (organization_id, analysis_id, file_id, role)
      values (org_id, analysis_id, source_id, 'verification fixture');
    insert into public.insights (organization_id, analysis_id, body)
      values (org_id, analysis_id, 'Verification fixture, not AI output.');
  end loop;

  select id into project_id from public.projects where organization_id = 'org_Phase02VerifyA';
  begin
    insert into public.analyses (organization_id, project_id, state)
      values ('org_Phase02VerifyB', project_id, 'queued');
    raise exception 'Cross organization project reference was accepted';
  exception when foreign_key_violation then null;
  end;

  select id into analysis_id from public.analyses where organization_id = 'org_Phase02VerifyA';
  select id into source_id from public.files where organization_id = 'org_Phase02VerifyA' and path = 'source.ts';
  select id into target_id from public.files where organization_id = 'org_Phase02VerifyB' and path = 'target.ts';
  begin
    insert into public.edges (organization_id, analysis_id, source_file_id, target_file_id)
      values ('org_Phase02VerifyA', analysis_id, source_id, target_id);
    raise exception 'Cross organization edge endpoint was accepted';
  exception when foreign_key_violation then null;
  end;
end;
$$;

set local role authenticated;
do $$
declare
  org_id text;
  table_name text;
  row_count bigint;
  expected_count integer;
  other_team_count bigint;
  ownership_column text;
  tables text[] := array['organizations', 'projects', 'analyses', 'files', 'edges', 'routes', 'explanations', 'file_roles', 'insights'];
begin
  foreach org_id in array array['org_Phase02VerifyA', 'org_Phase02VerifyB'] loop
    perform set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'o', jsonb_build_object('id', org_id))::text, true);
    foreach table_name in array tables loop
      -- Deliberately no WHERE clause: the policy must exclude every other team.
      execute format('select count(*) from public.%I', table_name) into row_count;
      expected_count := case when table_name = 'files' then 2 else 1 end;
      if row_count <> expected_count then
        raise exception 'RLS returned % rows for % in % (expected %)', row_count, org_id, table_name, expected_count;
      end if;
      ownership_column := case when table_name = 'organizations' then 'id' else 'organization_id' end;
      execute format('select count(*) from public.%I where %I <> $1', table_name, ownership_column) into other_team_count using org_id;
      if other_team_count <> 0 then raise exception 'RLS exposed another organization in %', table_name; end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  foreach table_name in array tables loop
    execute format('select count(*) from public.%I', table_name) into row_count;
    if row_count <> 0 then raise exception 'Missing organization claim exposed %', table_name; end if;
  end loop;
end;
$$;
reset role;

-- Exercise the same limited privilege and idempotent deletion as the webhook.
set local role service_role;
delete from public.organizations where id = 'org_Phase02VerifyA';
delete from public.organizations where id = 'org_Phase02VerifyA';
reset role;
do $$
declare
  table_name text;
  row_count bigint;
  ownership_column text;
begin
  foreach table_name in array array['organizations', 'projects', 'analyses', 'files', 'edges', 'routes', 'explanations', 'file_roles', 'insights'] loop
    ownership_column := case when table_name = 'organizations' then 'id' else 'organization_id' end;
    execute format('select count(*) from public.%I where %I = $1', table_name, ownership_column) into row_count using 'org_Phase02VerifyA';
    if row_count <> 0 then raise exception 'Cascade left rows in %', table_name; end if;
    execute format('select count(*) from public.%I where %I = $1', table_name, ownership_column) into row_count using 'org_Phase02VerifyB';
    if row_count = 0 then raise exception 'Cascade removed the other organization from %', table_name; end if;
  end loop;
end;
$$;
rollback;
select 'PASS: nine RLS policies, organization switching, absent claim, restricted grants, cross team constraints, cascades, repeat deletion.' as result;
