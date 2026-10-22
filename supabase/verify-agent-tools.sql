\set ON_ERROR_STOP on
begin;

-- Three independent graphs: two in one tenant, one in another. No fixtures persist.
do $$
declare org text; project uuid; analysis uuid; file_id uuid; i integer;
begin
  for i in 1..3 loop
    org := case when i = 3 then 'org_AgentToolsVerifyB' else 'org_AgentToolsVerifyA' end;
    perform set_config('request.jwt.claims', jsonb_build_object('o', jsonb_build_object('id', org))::text, true);
    insert into public.organizations(id) values(org) on conflict do nothing;
    insert into public.projects(organization_id, repository_url) values(org, 'https://github.com/example/agent-verify-' || i) returning id into project;
    insert into public.analyses(organization_id, project_id, state) values(org, project, 'completed') returning id into analysis;
    insert into public.files(organization_id, analysis_id, path) values(org, analysis, 'real-' || i || '.ts') returning id into file_id;
    insert into public.edges(organization_id, analysis_id, source_file_id, target_file_id) values(org, analysis, file_id, file_id);
    insert into public.routes(organization_id, analysis_id, file_id, method, path) values(org, analysis, file_id, 'GET', '/exact');
    insert into public.file_roles(organization_id, analysis_id, file_id, role) values(org, analysis, file_id, 'module');
    perform set_config('agent_verify.analysis_' || i, analysis::text, true);
  end loop;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","o":{"id":"org_AgentToolsVerifyA"}}', true);
do $$
declare issued_at timestamptz := date_trunc('second', public.agent_credential_time());
begin
  if abs(extract(epoch from (issued_at - statement_timestamp()))) >= 1 then
    raise exception 'Credential clock differs from the policy clock';
  end if;
  if has_function_privilege('anon', 'public.agent_credential_time()', 'execute')
    or has_function_privilege('service_role', 'public.agent_credential_time()', 'execute') then
    raise exception 'Credential clock has unnecessary execute grants';
  end if;
  insert into public.agent_tool_grants(token_hash, organization_id, analysis_id, created_at, expires_at)
    values(repeat('a',64), 'org_AgentToolsVerifyA', current_setting('agent_verify.analysis_1')::uuid,
      issued_at, issued_at + interval '5 minutes');
end $$;
insert into public.agent_tool_grants(token_hash, organization_id, analysis_id, expires_at)
 values(encode(sha256(convert_to('agent-verification-bearer', 'UTF8')), 'hex'), 'org_AgentToolsVerifyA',
 current_setting('agent_verify.analysis_1')::uuid, statement_timestamp() + interval '4 minutes');
do $$
begin
  begin
    insert into public.agent_tool_grants(token_hash, organization_id, analysis_id, expires_at)
      values(repeat('b',64), 'org_AgentToolsVerifyB', current_setting('agent_verify.analysis_3')::uuid, statement_timestamp() + interval '4 minutes');
    raise exception 'Cross organization grant was accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.agent_tool_grants(token_hash, organization_id, analysis_id, expires_at)
      values(repeat('c',64), 'org_AgentToolsVerifyA', current_setting('agent_verify.analysis_1')::uuid, statement_timestamp() + interval '6 minutes');
    raise exception 'Overlong grant was accepted';
  exception when insufficient_privilege or check_violation then null; end;
end $$;
reset role;
insert into public.agent_tool_grants(token_hash, organization_id, analysis_id, created_at, expires_at)
 values(encode(sha256(convert_to('expired-verification-bearer','UTF8')),'hex'), 'org_AgentToolsVerifyA',
 current_setting('agent_verify.analysis_1')::uuid, now() - interval '10 minutes', now() - interval '5 minutes');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.headers', '{"x-cartograph-agent-token":"agent-verification-bearer"}', true);
do $$
declare t text; n bigint;
begin
  foreach t in array array['analyses','files','edges','routes','file_roles'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 1 then raise exception 'Scoped unfiltered read returned % rows in %', n, t; end if;
    if has_table_privilege('anon', 'public.' || t, 'insert,update,delete') then raise exception 'Agent can write %', t; end if;
  end loop;
  if (select id from public.analyses limit 1) <> current_setting('agent_verify.analysis_1')::uuid then raise exception 'Wrong analysis visible'; end if;
  if has_table_privilege('anon', 'public.agent_tool_grants', 'select,insert,update,delete') then raise exception 'Agent can access registry'; end if;
  foreach t in array array['organizations','projects','ai_cache','explanations','insights'] loop
    if has_table_privilege('anon', 'public.' || t, 'select') then raise exception 'Agent can read unrelated table %', t; end if;
  end loop;
  perform set_config('request.headers', '{}', true);
  if (select count(*) from public.files) <> 0 then raise exception 'Missing bearer exposed rows'; end if;
  perform set_config('request.headers', '{"x-cartograph-agent-token":"tampered-verification-bearer"}', true);
  if (select count(*) from public.files) <> 0 then raise exception 'Tampered bearer exposed rows'; end if;
  perform set_config('request.headers', '{"x-cartograph-agent-token":"expired-verification-bearer"}', true);
  if (select count(*) from public.files) <> 0 then raise exception 'Expired bearer exposed rows'; end if;
end $$;
reset role;
-- Deleting a grant revokes database reads independently of app signature checks.
delete from public.agent_tool_grants where token_hash = encode(sha256(convert_to('agent-verification-bearer', 'UTF8')), 'hex');
set local role anon;
select set_config('request.headers', '{"x-cartograph-agent-token":"agent-verification-bearer"}', true);
do $$ begin
  if (select count(*) from public.files) <> 0 then raise exception 'Deleted grant exposed rows'; end if;
end $$;
reset role;
rollback;
\echo 'Agent RLS verified: exact analysis, same tenant isolation, cross tenant isolation, missing/tampered/expired/revoked grants, and read only privileges.'
