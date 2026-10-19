\set ON_ERROR_STOP on
-- Supply parser_result as a psql variable containing validated parser JSON.
-- Everything, including the test organizations, rolls back.
begin;
select set_config('cartograph.verify_result', :'parser_result', true) is not null as parser_result_loaded;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","o":{"id":"org_PipelineVerifyA"}}', true) is not null as organization_claim_loaded;

do $$
declare
  analysis uuid;
  repeated uuid;
  new_row boolean;
  failed uuid;
  running uuid;
  parser_result jsonb := current_setting('cartograph.verify_result')::jsonb;
  count_rows integer;
begin
  select analysis_id, created into strict analysis, new_row from public.begin_analysis('https://github.com/cartograph-verification/parser');
  if not new_row then raise exception 'Expected a new analysis.'; end if;
  select analysis_id, created into strict repeated, new_row from public.begin_analysis('https://github.com/cartograph-verification/parser');
  if new_row or repeated <> analysis then raise exception 'Repository submission was not deduplicated.'; end if;
  perform public.advance_analysis(analysis, 'fetch', 'select', 'Selecting files.', repeat('a', 40));
  perform public.advance_analysis(analysis, 'select', 'parse', 'Parsing imports.');
  perform public.advance_analysis(analysis, 'parse', 'store', 'Storing output.');
  -- A bad edge must roll back the file inserts, not leave a partial graph.
  begin
    perform public.store_analysis(analysis, jsonb_set(parser_result, '{edges}', '[{"from":"missing.ts","to":"missing.ts","kind":"import"}]'));
    raise exception 'Invalid edge unexpectedly committed.';
  exception when others then
    if sqlerrm = 'Invalid edge unexpectedly committed.' then raise; end if;
  end;
  if exists (select 1 from public.files where analysis_id = analysis) then raise exception 'Failed storage left partial files.'; end if;
  perform public.store_analysis(analysis, parser_result);
  if not exists (select 1 from public.analyses where id = analysis and state = 'completed' and commit_sha = repeat('a', 40)
    and coverage = parser_result -> 'coverage' and adapter = parser_result ->> 'adapter' and schema_version = 1) then
    raise exception 'Completed metadata differs from the parser output.';
  end if;
  select count(*) into count_rows from public.files where analysis_id = analysis;
  if count_rows <> jsonb_array_length(parser_result -> 'files') then raise exception 'Stored file count differs.'; end if;
  select count(*) into count_rows from public.edges where analysis_id = analysis;
  if count_rows <> jsonb_array_length(parser_result -> 'edges') then raise exception 'Stored edge count differs.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(parser_result -> 'files') as f(path text, folder text, module text, kind text, "lineCount" integer, hash text, "fanIn" integer, "fanOut" integer)
    left join public.files stored on stored.analysis_id = analysis and stored.path = f.path
    where stored.id is null or (stored.folder, stored.module, stored.kind, stored.line_count, stored.hash, stored.fan_in, stored.fan_out)
      is distinct from (f.folder, f.module, f.kind, f."lineCount", f.hash, f."fanIn", f."fanOut")
  ) then raise exception 'Stored file metadata differs.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(parser_result -> 'edges') as e("from" text, "to" text, kind text)
    where not exists (select 1 from public.edges stored
      join public.files source on source.id = stored.source_file_id
      join public.files target on target.id = stored.target_file_id
      where stored.analysis_id = analysis and source.path = e."from" and target.path = e."to" and stored.kind = e.kind)
  ) then raise exception 'Stored import edges differ.'; end if;
  select analysis_id into strict failed from public.begin_analysis('https://github.com/cartograph-verification/missing');
  perform public.fail_analysis(failed, 'fetch', 'Repository not found.');
  if not exists (select 1 from public.analyses where id = failed and state = 'failed' and failed_stage = 'fetch' and failure_message = 'Repository not found.') then
    raise exception 'Failure was not recorded.';
  end if;
  select analysis_id into strict running from public.begin_analysis('https://github.com/cartograph-verification/running');
  perform set_config('request.jwt.claims', '{"role":"authenticated","o":{"id":"org_PipelineVerifyB"}}', true);
  if exists (select 1 from public.analyses where id = analysis) or exists (select 1 from public.files where analysis_id = analysis)
    or exists (select 1 from public.edges where analysis_id = analysis) then raise exception 'Cross organization data was visible.'; end if;
  begin
    perform public.fail_analysis(running, 'fetch', 'Cross organization mutation.');
    raise exception 'Cross organization mutation succeeded.';
  exception when others then
    if sqlerrm = 'Cross organization mutation succeeded.' then raise; end if;
  end;
  begin
    insert into public.files (organization_id, analysis_id, path) values ('org_PipelineVerifyA', analysis, 'forbidden.ts');
    raise exception 'Cross organization insert succeeded.';
  exception when insufficient_privilege then null;
  end;
  select analysis_id, created into strict repeated, new_row from public.begin_analysis('https://github.com/cartograph-verification/parser');
  if not new_row or repeated = analysis then raise exception 'Organizations did not get separate analyses.'; end if;
  perform set_config('request.jwt.claims', '{}', true);
  if exists (select 1 from public.analyses) then raise exception 'Missing organization claim exposed analyses.'; end if;
  raise notice 'Verified duplicate submissions, atomic storage, exact parser data, failed stages, and tenant isolation.';
end;
$$;
rollback;
