begin;

create table public.organizations (
  id text primary key check (id ~ '^org_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  repository_url text not null check (repository_url ~ '^https://github[.]com/[^/[:space:]]+/[^/[:space:]]+/?$'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, repository_url)
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  project_id uuid not null,
  state text not null check (state in ('queued', 'parsing', 'completed', 'failed')),
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, project_id) references public.projects(organization_id, id) on delete cascade
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  path text not null check (length(path) > 0),
  unique (organization_id, analysis_id, id),
  unique (organization_id, analysis_id, path),
  foreign key (organization_id, analysis_id) references public.analyses(organization_id, id) on delete cascade
);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  source_file_id uuid not null,
  target_file_id uuid not null,
  foreign key (organization_id, analysis_id) references public.analyses(organization_id, id) on delete cascade,
  foreign key (organization_id, analysis_id, source_file_id) references public.files(organization_id, analysis_id, id) on delete cascade,
  foreign key (organization_id, analysis_id, target_file_id) references public.files(organization_id, analysis_id, id) on delete cascade,
  unique (organization_id, analysis_id, source_file_id, target_file_id)
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  method text not null check (method in ('GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'CONNECT', 'TRACE')),
  path text not null check (left(path, 1) = '/'),
  foreign key (organization_id, analysis_id) references public.analyses(organization_id, id) on delete cascade,
  foreign key (organization_id, analysis_id, file_id) references public.files(organization_id, analysis_id, id) on delete cascade,
  unique (organization_id, analysis_id, method, path, file_id)
);

create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  body text not null check (length(body) > 0),
  foreign key (organization_id, analysis_id) references public.analyses(organization_id, id) on delete cascade,
  foreign key (organization_id, analysis_id, file_id) references public.files(organization_id, analysis_id, id) on delete cascade,
  unique (organization_id, analysis_id, file_id)
);

create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  role text not null check (length(role) > 0),
  foreign key (organization_id, analysis_id) references public.analyses(organization_id, id) on delete cascade,
  foreign key (organization_id, analysis_id, file_id) references public.files(organization_id, analysis_id, id) on delete cascade,
  unique (organization_id, analysis_id, file_id)
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  analysis_id uuid not null,
  body text not null check (length(body) > 0),
  foreign key (organization_id, analysis_id) references public.analyses(organization_id, id) on delete cascade
);

create index analyses_organization_created_idx on public.analyses (organization_id, created_at desc, id desc);
create index analyses_project_idx on public.analyses (organization_id, project_id);
create index edges_target_idx on public.edges (organization_id, analysis_id, target_file_id);
create index routes_file_idx on public.routes (organization_id, analysis_id, file_id);
create index insights_analysis_idx on public.insights (organization_id, analysis_id);

-- Tables, policies, and grants become visible together at commit. Only reads
-- are exposed to sessions in this phase. No organization filter is needed in the app.
do $$
declare
  table_name text;
  ownership_column text;
begin
  foreach table_name in array array['organizations', 'projects', 'analyses', 'files', 'edges', 'routes', 'explanations', 'file_roles', 'insights'] loop
    ownership_column := case when table_name = 'organizations' then 'id' else 'organization_id' end;
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format(
      'create policy organization_read on public.%I for select to authenticated using (%I = (select auth.jwt() -> ''o'' ->> ''id''))',
      table_name, ownership_column
    );
  end loop;
end;
$$;

-- The verified lifecycle handler needs only parent lookup/deletion. The FK
-- cascades run in Postgres, rather than making eight privileged API requests.
grant select, delete on public.organizations to service_role;

commit;
