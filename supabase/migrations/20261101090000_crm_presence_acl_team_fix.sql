-- Correcoes identificadas pelo Gemini, revisadas contra migrations historicas reais.
-- A funcao anterior era SECURITY DEFINER sem verificacao de acesso: falha de isolamento.
begin;
create or replace function public.core_presence_usage_report(p_workspace uuid,p_since timestamptz default null)
returns table(user_id uuid,full_name text,status text,updated_at timestamptz,is_online boolean,
 online_seconds bigint,meeting_seconds bigint,away_seconds bigint,total_seconds bigint,
 expected_seconds bigint,team_name text)
language plpgsql stable security definer set search_path='' as $fn$
begin
 if auth.uid() is null or not (
   public.core_is_super_admin() or public.core_has_permission(p_workspace,'reports.read')
 ) then raise exception 'Forbidden' using errcode='42501'; end if;
 return query
 with bounds as (select coalesce(p_since,now()-interval '30 days') as since_at),
 ev as (
  select e.*,lead(e.started_at) over(partition by e.workspace_id,e.user_id order by e.started_at,e.id) next_at
  from public.core_presence_events e where e.workspace_id=p_workspace
 ), agg as (
  select ev.user_id as uid,
    sum(case when ev.status='online' then greatest(0,extract(epoch from least(coalesce(ev.next_at,now()),now())-greatest(ev.started_at,b.since_at))) else 0 end)::bigint as s_online,
    sum(case when ev.status='meeting' then greatest(0,extract(epoch from least(coalesce(ev.next_at,now()),now())-greatest(ev.started_at,b.since_at))) else 0 end)::bigint as s_meeting,
    sum(case when ev.status='away' then greatest(0,extract(epoch from least(coalesce(ev.next_at,now()),now())-greatest(ev.started_at,b.since_at))) else 0 end)::bigint as s_away
  from ev cross join bounds b
  where coalesce(ev.next_at,now())>b.since_at group by ev.user_id
 )
 select m.user_id,
   coalesce(nullif(pg_catalog.btrim(up.full_name),''),pg_catalog.split_part(au.email,'@',1),'Usuário')::text,
   (case when p.updated_at >= now()-interval '2 minutes' then p.status else 'offline' end)::text,
   p.updated_at,
   coalesce(p.updated_at>=now()-interval '2 minutes' and p.status<>'offline',false),
   coalesce(a.s_online,0),coalesce(a.s_meeting,0),coalesce(a.s_away,0),
   coalesce(a.s_online,0)+coalesce(a.s_meeting,0)+coalesce(a.s_away,0),
   extract(epoch from greatest(now()-b.since_at,interval '0'))::bigint,
   null::text
 from public.core_memberships m
 left join public.core_user_profiles up on up.user_id=m.user_id
 left join auth.users au on au.id=m.user_id
 left join public.core_user_presence p on p.workspace_id=m.workspace_id and p.user_id=m.user_id
 left join agg a on a.uid=m.user_id
 cross join bounds b
 where m.workspace_id=p_workspace and m.active
 order by coalesce(a.s_online,0) desc;
end $fn$;

create or replace function public.core_presence_user_detail(p_workspace uuid,p_user uuid,p_since timestamptz default null)
returns table(status text,started_at timestamptz,ended_at timestamptz,duration_seconds bigint)
language plpgsql stable security definer set search_path='' as $fn$
begin
 if auth.uid() is null or not (
   public.core_is_super_admin() or public.core_has_permission(p_workspace,'reports.read')
   or (auth.uid()=p_user and public.core_has_access(p_workspace))
 ) then raise exception 'Forbidden' using errcode='42501'; end if;
 return query select e.status,e.started_at,coalesce(e.ended_at,now()),
   greatest(0,extract(epoch from coalesce(e.ended_at,now())-e.started_at))::bigint
 from public.core_presence_events e
 where e.workspace_id=p_workspace and e.user_id=p_user
   and e.started_at>=coalesce(p_since,now()-interval '30 days')
 order by e.started_at desc;
end $fn$;

-- Somente a LEITURA dos times e ampliada para membros ativos.
-- As funcoes de criar/alterar/excluir time continuam exigindo team.manage.
create or replace function public.core_team_groups(w uuid)
returns table(id uuid,name text,member_ids uuid[],created_at timestamptz)
language plpgsql stable security definer set search_path='' as $fn$
begin
 if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_access(w))
 then raise exception 'Permission denied' using errcode='42501';end if;
 return query
 select g.id,g.name,
   coalesce(pg_catalog.array_agg(gm.user_id order by gm.added_at) filter(where gm.user_id is not null),array[]::uuid[]) as member_ids,
   g.created_at
 from public.core_team_groups g
 left join public.core_team_group_members gm on gm.team_id=g.id and gm.workspace_id=g.workspace_id
 where g.workspace_id=w
 group by g.id,g.name,g.created_at order by g.name asc,g.id asc;
end $fn$;
revoke all on function public.core_presence_usage_report(uuid,timestamptz),
 public.core_presence_user_detail(uuid,uuid,timestamptz),public.core_team_groups(uuid) from public,anon;
grant execute on function public.core_presence_usage_report(uuid,timestamptz),
 public.core_presence_user_detail(uuid,uuid,timestamptz),public.core_team_groups(uuid) to authenticated;
commit;
