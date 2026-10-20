\set ON_ERROR_STOP on
-- All verification rows and mutations roll back.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","o":{"id":"org_AICacheVerifyA"}}', true) is not null as claims_loaded;

do $$
declare
  original uuid;
  fresh uuid;
  repeated uuid;
  created_new boolean;
begin
  select analysis_id into strict original from public.begin_analysis('https://github.com/cartograph-verification/ai');
  insert into public.ai_cache (cache_key, model, kind, body) values (repeat('a', 64), 'pinned-test-model', 'file', 'Explanation');
  insert into public.ai_cache (cache_key, model, kind, body) values (repeat('a', 64), 'pinned-test-model', 'file', 'Duplicate')
    on conflict (organization_id, cache_key) do nothing;
  if (select body from public.ai_cache where cache_key = repeat('a', 64)) <> 'Explanation' then raise exception 'Cache reuse failed.'; end if;
  begin
    insert into public.ai_cache (cache_key, model, kind, body) values (repeat('b', 64), 'pinned-test-model', 'role', 'controller');
    raise exception 'Structural classification was accepted.';
  exception when check_violation then null;
  end;
  perform public.fail_analysis(original, 'fetch', 'Verification failure.');
  select analysis_id, created into strict repeated, created_new from public.begin_analysis('https://github.com/cartograph-verification/ai');
  if repeated <> original or created_new then raise exception 'Ordinary submission did not reuse the previous analysis.'; end if;
  select analysis_id, created into strict fresh, created_new from public.begin_analysis('https://github.com/cartograph-verification/ai', true);
  if fresh = original or not created_new then raise exception 'Explicit re-analysis did not create a fresh run.'; end if;
  select analysis_id, created into strict repeated, created_new from public.begin_analysis('https://github.com/cartograph-verification/ai', true);
  if repeated <> fresh or created_new then raise exception 'Active re-analysis was not deduplicated.'; end if;
  if not exists (select 1 from public.analyses where id = original and state = 'failed') then raise exception 'The original analysis was changed.'; end if;
  perform set_config('request.jwt.claims', '{"role":"authenticated","o":{"id":"org_AICacheVerifyB"}}', true);
  if exists (select 1 from public.ai_cache) then raise exception 'Cross organization cache was visible.'; end if;
  begin
    insert into public.ai_cache (organization_id, cache_key, model, kind, body) values ('org_AICacheVerifyA', repeat('c', 64), 'pinned-test-model', 'file', 'Cross tenant');
    raise exception 'Cross organization cache insert succeeded.';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
do $$
begin
  if has_table_privilege('anon', 'public.ai_cache', 'SELECT')
    or has_table_privilege('authenticated', 'public.ai_cache', 'UPDATE')
    or has_table_privilege('authenticated', 'public.ai_cache', 'DELETE')
    or has_table_privilege('service_role', 'public.ai_cache', 'SELECT') then raise exception 'Unexpected AI cache grants.'; end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.ai_cache'::regclass) then raise exception 'Cache RLS is not enforced.'; end if;
end;
$$;
rollback;
\echo 'AI cache policies, grants, role allowlist and explicit re-analysis verified.'
