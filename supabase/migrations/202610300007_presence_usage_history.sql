begin;
create table if not exists public.core_presence_events(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, status text not null check(status in('online','meeting','away','offline')),
 started_at timestamptz not null default now(), ended_at timestamptz null,
 foreign key(workspace_id,user_id) references public.core_memberships(workspace_id,user_id) on delete cascade
);
alter table public.core_presence_events enable row level security;
drop policy if exists core_presence_events_read on public.core_presence_events;
create policy core_presence_events_read on public.core_presence_events for select to authenticated using(public.core_has_access(workspace_id));
create index if not exists core_presence_events_report_idx on public.core_presence_events(workspace_id,user_id,started_at);
create or replace function public.core_presence_record(p_workspace uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare result jsonb; v_current text;
begin
 if auth.uid() is null or not public.core_has_access(p_workspace) then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_status not in('online','meeting','away','offline') then raise exception 'Invalid presence status' using errcode='22023'; end if;
 select status into v_current from public.core_user_presence where workspace_id=p_workspace and user_id=auth.uid();
 if v_current is distinct from p_status then
   update public.core_presence_events set ended_at=now() where workspace_id=p_workspace and user_id=auth.uid() and ended_at is null;
   insert into public.core_presence_events(workspace_id,user_id,status) values(p_workspace,auth.uid(),p_status);
 end if;
 insert into public.core_user_presence(workspace_id,user_id,status,updated_at) values(p_workspace,auth.uid(),p_status,now()) on conflict(workspace_id,user_id) do update set status=excluded.status,updated_at=excluded.updated_at;
 select pg_catalog.jsonb_build_object('status',p.status,'updated_at',p.updated_at) into result from public.core_user_presence p where p.workspace_id=p_workspace and p.user_id=auth.uid(); return result;
end $fn$;
create or replace function public.core_presence_set(p_workspace uuid,p_status text) returns jsonb language sql security definer set search_path='' as $fn$ select public.core_presence_record(p_workspace,p_status) $fn$;
create or replace function public.core_presence_heartbeat(p_workspace uuid) returns jsonb language sql security definer set search_path='' as $fn$ select public.core_presence_record(p_workspace,'online') $fn$;
create or replace function public.core_presence_usage_report(p_workspace uuid,p_since timestamptz default null)
returns table(user_id uuid,full_name text,status text,updated_at timestamptz,is_online boolean,online_seconds bigint,meeting_seconds bigint,away_seconds bigint,total_seconds bigint,expected_seconds bigint,team_name text)
language sql stable security definer set search_path='' as $fn$
 with bounds as (select coalesce(p_since,now()-interval '30 days') as since_at), ev as (
  select e.*,lead(e.started_at) over(partition by e.workspace_id,e.user_id order by e.started_at) as next_at from public.core_presence_events e where e.workspace_id=p_workspace
 ), agg as (select user_id,sum(case when status='online' then extract(epoch from least(coalesce(next_at,now()),now())-greatest(started_at,b.since_at)) else 0 end)::bigint online_seconds,sum(case when status='meeting' then extract(epoch from least(coalesce(next_at,now()),now())-greatest(started_at,b.since_at)) else 0 end)::bigint meeting_seconds,sum(case when status='away' then extract(epoch from least(coalesce(next_at,now()),now())-greatest(started_at,b.since_at)) else 0 end)::bigint away_seconds from ev cross join bounds b where coalesce(next_at,now())>b.since_at group by user_id)
 select m.user_id,coalesce(nullif(btrim(up.full_name),''),split_part(au.email,'@',1),'Usuário'),case when p.updated_at>=now()-interval '2 minutes' then p.status else 'offline' end,p.updated_at,coalesce(p.updated_at>=now()-interval '2 minutes' and p.status<>'offline',false),coalesce(a.online_seconds,0),coalesce(a.meeting_seconds,0),coalesce(a.away_seconds,0),coalesce(a.online_seconds,0)+coalesce(a.meeting_seconds,0)+coalesce(a.away_seconds,0),extract(epoch from greatest(now()-b.since_at,interval '0'))::bigint,null
 from public.core_memberships m left join public.core_user_profiles up on up.user_id=m.user_id left join auth.users au on au.id=m.user_id left join public.core_user_presence p on p.workspace_id=m.workspace_id and p.user_id=m.user_id left join agg a on a.user_id=m.user_id cross join bounds b where m.workspace_id=p_workspace and m.active order by online_seconds desc;
$fn$;
create or replace function public.core_presence_user_detail(p_workspace uuid,p_user uuid,p_since timestamptz default null)
returns table(status text,started_at timestamptz,ended_at timestamptz,duration_seconds bigint) language sql stable security definer set search_path='' as $fn$
 select e.status,e.started_at,coalesce(e.ended_at,now()),extract(epoch from coalesce(e.ended_at,now())-e.started_at)::bigint from public.core_presence_events e where e.workspace_id=p_workspace and e.user_id=p_user and e.started_at>=coalesce(p_since,now()-interval '30 days') order by e.started_at desc;
$fn$;
revoke all on public.core_presence_events from public,anon; grant select on public.core_presence_events to authenticated;
revoke all on function public.core_presence_record(uuid,text),public.core_presence_usage_report(uuid,timestamptz),public.core_presence_user_detail(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.core_presence_record(uuid,text),public.core_presence_usage_report(uuid,timestamptz),public.core_presence_user_detail(uuid,uuid,timestamptz) to authenticated;
commit;
