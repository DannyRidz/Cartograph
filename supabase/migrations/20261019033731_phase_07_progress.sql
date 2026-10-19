begin;

-- Supabase declares access to private topic patterns through realtime.messages
-- policies. Install both topic rules before any trigger can publish to them.
-- The Realtime service owns this table and already enables RLS; do not alter it.
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'realtime.messages'::regclass) then
    raise exception 'Realtime messages must have row level security enabled.';
  end if;
end;
$$;

create policy analysis_progress_receive on realtime.messages for select to authenticated
using (
  extension = 'broadcast' and topic = (select realtime.topic()) and exists (
    select 1 from public.analyses
    where ('analysis:' || id::text) = (select realtime.topic())
      and organization_id = (select auth.jwt() -> 'o' ->> 'id')
      and not is_seed
  )
);

-- The history topic only announces that the list changed, without row data.
create policy analysis_history_receive on realtime.messages for select to authenticated
using (
  extension = 'broadcast' and topic = (select realtime.topic())
  and (select realtime.topic()) = 'organization:' || (select auth.jwt() -> 'o' ->> 'id') || ':analyses'
);

create function public.publish_analysis_progress()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare progress_message text;
begin
  if new.is_seed then return null; end if;
  if tg_op = 'UPDATE' and new.stage is not distinct from old.stage
    and new.stage_message is not distinct from old.stage_message then return null; end if;
  progress_message := case when new.stage = 'failed' then
    format('Failed during %s: %s', new.failed_stage, new.failure_message)
    else new.stage_message end;
  perform realtime.send(
    jsonb_build_object('stage', new.stage, 'message', progress_message),
    'analysis_progress', 'analysis:' || new.id::text, true
  );
  if tg_op = 'INSERT' then
    perform realtime.send('{}'::jsonb, 'analysis_created', 'organization:' || new.organization_id || ':analyses', true);
  end if;
  return null;
end;
$$;
revoke all on function public.publish_analysis_progress() from public, anon, authenticated, service_role;

-- Only our table publishes. No trigger is attached to Realtime internals.
create trigger analysis_progress_publish after insert or update of stage, stage_message on public.analyses
  for each row execute function public.publish_analysis_progress();

commit;
