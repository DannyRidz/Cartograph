begin;

-- Existing tenant policies and composite file foreign keys also protect these writes.
grant insert on public.routes, public.file_roles to authenticated;
create policy organization_create on public.routes for insert to authenticated
  with check (organization_id = (select auth.jwt() -> 'o' ->> 'id'));
create policy organization_create on public.file_roles for insert to authenticated
  with check (organization_id = (select auth.jwt() -> 'o' ->> 'id'));

create or replace function public.store_analysis(p_analysis_id uuid, p_result jsonb)
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
  insert into public.file_roles (organization_id, analysis_id, file_id, role)
    select org, p_analysis_id, stored.id, f.role
    from jsonb_to_recordset(p_result -> 'files') as f(path text, role text)
    join public.files stored on stored.analysis_id = p_analysis_id and stored.path = f.path
    where f.role is not null;
  insert into public.routes (organization_id, analysis_id, file_id, method, path)
    select org, p_analysis_id, stored.id, r.method, r.path
    from jsonb_to_recordset(coalesce(p_result -> 'routes', '[]'::jsonb)) as r(file text, method text, path text)
    join public.files stored on stored.analysis_id = p_analysis_id and stored.path = r.file;
  get diagnostics edge_count = row_count;
  if edge_count <> jsonb_array_length(coalesce(p_result -> 'routes', '[]'::jsonb)) then
    raise exception 'A route has no stored file.';
  end if;
  update public.analyses set state = 'completed', stage = 'completed', stage_message = 'Analysis complete.',
    coverage = p_result -> 'coverage', adapter = p_result ->> 'adapter', schema_version = 1, updated_at = now()
    where id = p_analysis_id;
end;
$$;

commit;
