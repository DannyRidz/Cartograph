\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","o":{"id":"org_RunRecoveryVerifyA"}}', true) is not null as claims_loaded;
do $$
declare
  original uuid;
  replacement uuid;
  duplicate uuid;
  storage uuid;
  created_new boolean;
  snapshot timestamptz;
  empty_result jsonb := '{"schemaVersion":1,"adapter":"fallback","files":[],"edges":[],"routes":[],"coverage":{"filesParsed":0}}';
begin
  select analysis_id into strict original from public.begin_analysis('https://github.com/cartograph-verification/recovery');
  update public.analyses set created_at = now() - interval '1 day', updated_at = now() - interval '4 minutes' where id = original;
  perform public.heartbeat_analysis(original);
  if not exists (select 1 from public.analyses where id = original and updated_at > now() - interval '1 minute') then raise exception 'Heartbeat did not renew activity.'; end if;
  select analysis_id, created into strict duplicate, created_new from public.begin_analysis('https://github.com/cartograph-verification/recovery', true);
  if duplicate <> original or created_new then raise exception 'Slow but active run was replaced.'; end if;

  update public.analyses set updated_at = now() - interval '6 minutes' where id = original;
  begin
    perform public.heartbeat_analysis(original);
    raise exception 'Expired worker renewed its lease.';
  exception when raise_exception then
    if sqlerrm not like '%lease expired%' then raise; end if;
  end;
  begin
    perform public.advance_analysis(original, 'fetch', 'select', 'Expired advancement.');
    raise exception 'Expired worker advanced its stage.';
  exception when raise_exception then
    if sqlerrm not like '%lease expired%' then raise; end if;
  end;
  select analysis_id, created into strict replacement, created_new from public.begin_analysis('https://github.com/cartograph-verification/recovery', true);
  if replacement = original or not created_new then raise exception 'Expired run was not replaced.'; end if;
  if not exists (select 1 from public.analyses where id = original and state = 'failed' and stage = 'failed' and failed_stage = 'fetch' and failure_message like '%stopped reporting activity%') then raise exception 'Abandonment reason or stage was lost.'; end if;
  select analysis_id, created into strict duplicate, created_new from public.begin_analysis('https://github.com/cartograph-verification/recovery', true);
  if duplicate <> replacement or created_new then raise exception 'Replacement requests were not deduplicated.'; end if;
  begin
    perform public.heartbeat_analysis(original);
    raise exception 'Replaced worker renewed.';
  exception when raise_exception then
    if sqlerrm not like '%no longer active%' then raise; end if;
  end;

  select analysis_id into strict storage from public.begin_analysis('https://github.com/cartograph-verification/expired-storage');
  perform public.advance_analysis(storage, 'fetch', 'select', 'Selecting.', repeat('a', 40));
  perform public.advance_analysis(storage, 'select', 'parse', 'Parsing.');
  perform public.advance_analysis(storage, 'parse', 'store', 'Storing.');
  update public.analyses set updated_at = now() - interval '6 minutes' where id = storage;
  begin
    perform public.store_analysis(storage, empty_result);
    raise exception 'Expired worker stored results.';
  exception when raise_exception then
    if sqlerrm not like '%lease expired%' then raise; end if;
  end;
  if exists (select 1 from public.analyses where id = storage and state = 'completed') then raise exception 'Expired storage committed.'; end if;

  select updated_at into snapshot from public.analyses where id = replacement;
  perform set_config('request.jwt.claims', '{"role":"authenticated","o":{"id":"org_RunRecoveryVerifyB"}}', true);
  begin
    perform public.heartbeat_analysis(replacement);
    raise exception 'Cross organization renewal succeeded.';
  exception when raise_exception then
    if sqlerrm not like '%lease expired%' then raise; end if;
  end;
  if exists (select 1 from public.analyses where id = replacement) then raise exception 'Cross organization run visible.'; end if;
  perform set_config('request.jwt.claims', '{"role":"authenticated","o":{"id":"org_RunRecoveryVerifyA"}}', true);
  if (select updated_at from public.analyses where id = replacement) <> snapshot then raise exception 'Cross organization heartbeat changed activity.'; end if;
end;
$$;
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.heartbeat_analysis(uuid)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.heartbeat_analysis(uuid)', 'EXECUTE') then raise exception 'Unexpected heartbeat privileges.'; end if;
end;
$$;
rollback;
\echo 'Run recovery verified: live renewal, expiry, replacement, deduplication, expired worker fencing and tenant isolation.'
