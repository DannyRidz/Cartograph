begin;

-- The hosted realtime.send function is an invoker and inserts into its managed
-- messages table. Only this internal trigger may make that privileged write;
-- session clients retain receive-only policies and cannot call the publisher.
create schema cartograph_internal;
revoke all on schema cartograph_internal from public, anon, authenticated, service_role;
alter function public.publish_analysis_progress() set schema cartograph_internal;

create or replace function cartograph_internal.publish_analysis_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
declare progress_message text;
begin
  if new.is_seed then return null; end if;
  -- RLS has already checked the changed row, but the privileged publisher also
  -- verifies its source tenant before touching the Realtime table.
  if (auth.jwt() -> 'o' ->> 'id') is distinct from new.organization_id then
    raise exception 'Publishing progress requires the analysis organization.';
  end if;
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
revoke all on function cartograph_internal.publish_analysis_progress() from public, anon, authenticated, service_role;

commit;
