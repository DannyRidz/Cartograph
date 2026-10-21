begin;

-- The existing update time is the activity lease. Expired workers may fail,
-- but cannot renew, advance or complete, even if no replacement exists yet.
create function public.guard_analysis_activity()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not old.is_seed and old.state in ('queued', 'parsing')
    and new.state in ('queued', 'parsing', 'completed')
    and old.updated_at < clock_timestamp() - interval '5 minutes' then
    raise exception 'Analysis activity lease expired. Re-analyse the repository.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_analysis_activity() from public, anon, authenticated, service_role;
create trigger analysis_activity_guard before update on public.analyses
  for each row execute function public.guard_analysis_activity();

create function public.heartbeat_analysis(p_analysis_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.analyses set updated_at = clock_timestamp()
    where id = p_analysis_id and not is_seed and state in ('queued', 'parsing')
      and updated_at >= clock_timestamp() - interval '5 minutes';
  if not found then raise exception 'Analysis activity lease expired or the run is no longer active.'; end if;
end;
$$;
revoke all on function public.heartbeat_analysis(uuid) from public, anon, service_role;
grant execute on function public.heartbeat_analysis(uuid) to authenticated;

create or replace function public.begin_analysis(p_repository_url text, p_reanalyse boolean default false)
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
  if p_reanalyse then
    update public.analyses set state = 'failed', stage = 'failed',
      failed_stage = case when stage = 'queued' then 'fetch' else stage end,
      failure_message = 'The previous run stopped reporting activity for over five minutes.',
      stage_message = 'The previous run stopped reporting activity for over five minutes.',
      updated_at = clock_timestamp()
      where project_id = project and not is_seed and state in ('queued', 'parsing')
        and updated_at < clock_timestamp() - interval '5 minutes';
  end if;
  select id into analysis from public.analyses where project_id = project and not is_seed
    and (not p_reanalyse or state in ('queued', 'parsing'))
    order by created_at desc, id desc limit 1;
  if analysis is not null then return query select analysis, false; return; end if;
  insert into public.analyses (organization_id, project_id, state, stage, stage_message, updated_at)
    values (org, project, 'parsing', 'fetch', 'Fetching the public repository archive.', clock_timestamp()) returning id into analysis;
  return query select analysis, true;
end;
$$;

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
    and new.stage_message is not distinct from old.stage_message
    and new.updated_at is not distinct from old.updated_at then return null; end if;
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


-- Heartbeats use the existing private event, without polling or a new channel.
drop trigger analysis_progress_publish on public.analyses;
create trigger analysis_progress_publish after insert or update of stage, stage_message, updated_at on public.analyses
  for each row execute function cartograph_internal.publish_analysis_progress();

commit;
