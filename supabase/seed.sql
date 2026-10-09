\set ON_ERROR_STOP on
-- Run with psql -v organization_a=org_... -v organization_b=org_... -f supabase/seed.sql.
-- organization_a is Cartograph Demo (2 analyses); organization_b is RidzTalk (5).
-- Variables are quoted as SQL literals by psql, never interpolated as SQL code.
begin;
select set_config('cartograph.seed_organization_a', :'organization_a', true);
select set_config('cartograph.seed_organization_b', :'organization_b', true);

do $$
declare
  org_a text := current_setting('cartograph.seed_organization_a');
  org_b text := current_setting('cartograph.seed_organization_b');
  org_id text;
  project_id uuid;
begin
  if org_a !~ '^org_[A-Za-z0-9]+$' or org_b !~ '^org_[A-Za-z0-9]+$' or org_a = org_b then
    raise exception 'Supply two distinct actual Clerk organization IDs.';
  end if;
  foreach org_id in array array[org_a, org_b] loop
    insert into public.organizations (id) values (org_id) on conflict (id) do nothing;
    insert into public.projects (organization_id, repository_url)
    values (org_id, 'https://github.com/vercel/next.js')
    on conflict (organization_id, repository_url) do update set repository_url = excluded.repository_url
    returning id into project_id;

    -- Only demonstration rows are replaced on a rerun; real analyses are retained.
    delete from public.analyses where organization_id = org_id and is_seed;
    insert into public.analyses (organization_id, project_id, state, is_seed, created_at)
    values
      (org_id, project_id, case when org_id = org_a then 'completed' else 'failed' end, true, now()),
      (org_id, project_id, case when org_id = org_a then 'queued' else 'parsing' end, true, now() - interval '1 hour');

    if org_id = org_b then
      insert into public.analyses (organization_id, project_id, state, is_seed, created_at)
      select org_id, project_id, 'queued', true, now() - (sample_number + 1) * interval '1 hour'
      from generate_series(1, 3) as samples(sample_number);
    end if;
  end loop;
end;
$$;
commit;
