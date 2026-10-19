\set ON_ERROR_STOP on
-- Run as the database owner after both phase 07 migrations. All rows roll back.
-- Hosted Supabase needs a connected Realtime client to provision today's partition.
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","o":{"id":"org_ProgressVerifyA"}}', true) is not null as claims_loaded;

do $$
declare
  analysis_a uuid;
  analysis_b uuid;
  received jsonb;
  is_private boolean;
  message_id uuid;
  transport_id text;
begin
  select analysis_id into strict analysis_a from public.begin_analysis('https://github.com/cartograph-verification/progress');
  perform set_config('realtime.topic', 'analysis:' || analysis_a, true);
  select coalesce(payload -> 'payload', payload) - 'id', private, id, payload ->> 'id'
    into strict received, is_private, message_id, transport_id from realtime.messages
    where topic = 'analysis:' || analysis_a and event = 'analysis_progress';
  if transport_id is distinct from message_id::text then raise exception 'Realtime transport ID did not match its message.'; end if;
  if not is_private or received <> jsonb_build_object('stage', 'fetch', 'message', 'Fetching the public repository archive.') then
    raise exception 'Initial progress payload or private flag was wrong.';
  end if;
  perform public.advance_analysis(analysis_a, 'fetch', 'select', 'Selecting files.', repeat('a', 40));
  perform public.advance_analysis(analysis_a, 'select', 'parse', 'Parsing imports.');
  if not exists (select 1 from realtime.messages where topic = 'analysis:' || analysis_a and event = 'analysis_progress'
    and (coalesce(payload -> 'payload', payload) - 'id') = '{"stage":"parse","message":"Parsing imports."}'::jsonb) then
    raise exception 'Stage update did not publish its exact progress message.';
  end if;
  perform public.fail_analysis(analysis_a, 'parse', 'Invalid configuration.');
  if not exists (select 1 from realtime.messages where topic = 'analysis:' || analysis_a and event = 'analysis_progress'
    and (coalesce(payload -> 'payload', payload) - 'id') = '{"stage":"failed","message":"Failed during parse: Invalid configuration."}'::jsonb) then
    raise exception 'Failed stage and reason were not published.';
  end if;
  perform set_config('realtime.topic', 'organization:org_ProgressVerifyA:analyses', true);
  select coalesce(payload -> 'payload', payload) - 'id', private into strict received, is_private from realtime.messages
    where topic = 'organization:org_ProgressVerifyA:analyses' and event = 'analysis_created';
  if received <> '{}'::jsonb or not is_private then raise exception 'History notification exposed row data or was public.'; end if;

  perform set_config('request.jwt.claims', '{"role":"authenticated","o":{"id":"org_ProgressVerifyB"}}', true);
  perform set_config('realtime.topic', 'analysis:' || analysis_a, true);
  if exists (select 1 from realtime.messages) then raise exception 'Another organization could receive analysis progress.'; end if;
  perform set_config('realtime.topic', 'organization:org_ProgressVerifyA:analyses', true);
  if exists (select 1 from realtime.messages) then raise exception 'Another organization could receive history.'; end if;
  select analysis_id into strict analysis_b from public.begin_analysis('https://github.com/cartograph-verification/progress');
  perform set_config('realtime.topic', 'analysis:' || analysis_b, true);
  if not exists (select 1 from realtime.messages where topic = 'analysis:' || analysis_b) then raise exception 'Own analysis channel was not readable.'; end if;
  if exists (select 1 from realtime.messages where topic <> 'analysis:' || analysis_b) then raise exception 'Topic policy exposed unrelated messages.'; end if;
  begin
    insert into realtime.messages (topic, event, payload, extension, private)
      values ('analysis:' || analysis_b, 'analysis_progress', '{"stage":"completed","message":"Forged"}', 'broadcast', true);
    raise exception 'A client could forge a broadcast.';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '{}', true);
  if exists (select 1 from realtime.messages) then raise exception 'Missing claims exposed broadcasts.'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'realtime.messages'::regclass and tgfoid = (select oid from pg_proc where pronamespace = 'cartograph_internal'::regnamespace and proname = 'publish_analysis_progress')) then
    raise exception 'The progress trigger was attached to Realtime machinery.';
  end if;
  if has_function_privilege('authenticated', (select oid from pg_proc where pronamespace = 'cartograph_internal'::regnamespace and proname = 'publish_analysis_progress'), 'EXECUTE') then
    raise exception 'Session clients can invoke the privileged publisher.';
  end if;
  raise notice 'Verified private topic policies, exact stage payloads, failed-stage messages, history notifications and rejection of forged broadcasts.';
end;
$$;
rollback;
