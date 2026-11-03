begin;

alter table public.core_deals
  add column if not exists loss_marked_by uuid references auth.users(id) on delete set null;

alter table public.core_tasks
  add column if not exists task_type text;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.core_tasks'::regclass
      and conname = 'core_tasks_task_type_check'
  ) then
    alter table public.core_tasks
      add constraint core_tasks_task_type_check
      check (task_type is null or task_type in ('call', 'meeting', 'other')) not valid;
  end if;
end
$migration$;

alter table public.core_tasks
  validate constraint core_tasks_task_type_check;

comment on column public.core_deals.loss_marked_by is
  'Usuário autenticado que realizou a transição atual da negociação para perdida. Mantido nulo para perdas históricas sem autoria confiável.';
comment on column public.core_tasks.task_type is
  'Classificação estruturada da tarefa: call, meeting, other. Nulo indica tarefa histórica ou automatizada sem classificação.';

create or replace function public.core_capture_loss_metadata()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_authorized_actor uuid;
begin
  if v_actor is not null
     and public.core_has_permission(new.workspace_id, 'deals.write') then
    v_authorized_actor := v_actor;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'lost' then
      new.lost_at := pg_catalog.now();
      new.loss_marked_by := v_authorized_actor;
    else
      new.lost_at := null;
      new.loss_marked_by := null;
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'lost' then
      new.lost_at := pg_catalog.now();
      new.loss_marked_by := v_authorized_actor;
    elsif old.status = 'lost' then
      new.lost_at := null;
      new.loss_marked_by := null;
      new.loss_reason := null;
    else
      new.lost_at := null;
      new.loss_marked_by := null;
    end if;
  else
    -- Prevent clients from forging either audit field on ordinary updates.
    new.lost_at := old.lost_at;
    new.loss_marked_by := old.loss_marked_by;
  end if;

  return new;
end
$function$;

revoke all on function public.core_capture_loss_metadata() from public, anon;
grant execute on function public.core_capture_loss_metadata() to authenticated;
drop trigger if exists core_capture_loss_metadata_trigger on public.core_deals;
create trigger core_capture_loss_metadata_trigger
before insert or update of status, loss_marked_by, lost_at
on public.core_deals
for each row execute function public.core_capture_loss_metadata();

create table if not exists public.core_deal_loss_reason_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  deal_id uuid not null,
  requested_by uuid not null,
  recipient_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (workspace_id, id),
  foreign key (workspace_id, deal_id)
    references public.core_deals(workspace_id, id) on delete cascade,
  foreign key (workspace_id, requested_by)
    references public.core_memberships(workspace_id, user_id) on delete cascade,
  foreign key (workspace_id, recipient_id)
    references public.core_memberships(workspace_id, user_id) on delete cascade
);

create unique index if not exists core_deal_loss_reason_requests_one_pending_idx
  on public.core_deal_loss_reason_requests(workspace_id, deal_id)
  where status = 'pending';
create index if not exists core_deal_loss_reason_requests_latest_idx
  on public.core_deal_loss_reason_requests(workspace_id, deal_id, requested_at desc);
alter table public.core_deal_loss_reason_requests enable row level security;
revoke all on public.core_deal_loss_reason_requests from public, anon, authenticated;

alter table public.core_notifications
  add column if not exists deal_id uuid;

do $migration$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.core_notifications'::regclass
      and conname = 'core_notifications_workspace_deal_fkey'
  ) then
    alter table public.core_notifications
      add constraint core_notifications_workspace_deal_fkey
      foreign key (workspace_id, deal_id)
      references public.core_deals(workspace_id, id) on delete cascade;
  end if;
end
$migration$;

create index if not exists core_notifications_deal_lookup_idx
  on public.core_notifications(workspace_id, deal_id)
  where deal_id is not null;

drop policy if exists core_notifications_loss_request_read on public.core_notifications;
create policy core_notifications_loss_request_read
on public.core_notifications
for select to authenticated
using (
  user_id = auth.uid()
  and kind = 'deal_loss_reason_request'
  and public.core_has_access(workspace_id)
);

create or replace function public.core_mark_notification_read(
  p_workspace uuid,
  p_notification uuid
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_kind text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select n.kind into v_kind
  from public.core_notifications n
  where n.workspace_id = p_workspace
    and n.id = p_notification
    and n.user_id = auth.uid();
  if not found then
    return;
  end if;

  if v_kind = 'deal_loss_reason_request' then
    if not public.core_has_access(p_workspace) then
      raise exception 'No access' using errcode = '42501';
    end if;
  elsif not public.core_has_permission(p_workspace, 'tasks.read') then
    raise exception 'No access' using errcode = '42501';
  end if;

  update public.core_notifications
  set read_at = coalesce(read_at, pg_catalog.now())
  where workspace_id = p_workspace
    and id = p_notification
    and user_id = auth.uid();
end
$function$;

revoke all on function public.core_mark_notification_read(uuid, uuid) from public, anon;
grant execute on function public.core_mark_notification_read(uuid, uuid) to authenticated;

create or replace function public.core_resolve_loss_reason_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status is distinct from 'lost' then
    update public.core_deal_loss_reason_requests r
    set status = 'cancelled', resolved_at = pg_catalog.now()
    where r.workspace_id = new.workspace_id
      and r.deal_id = new.id
      and r.status = 'pending';
  elsif nullif(pg_catalog.btrim(coalesce(new.loss_reason, '')), '') is not null then
    update public.core_deal_loss_reason_requests r
    set status = 'completed', resolved_at = pg_catalog.now()
    where r.workspace_id = new.workspace_id
      and r.deal_id = new.id
      and r.status = 'pending';
  end if;
  return new;
end
$function$;
revoke all on function public.core_resolve_loss_reason_request() from public, anon;
grant execute on function public.core_resolve_loss_reason_request() to authenticated;
drop trigger if exists core_resolve_loss_reason_request_trigger on public.core_deals;
create trigger core_resolve_loss_reason_request_trigger
after update of status, loss_reason
on public.core_deals
for each row execute function public.core_resolve_loss_reason_request();

create or replace function public.core_presence_usage_report_v2(
  p_workspace uuid,
  p_since timestamptz,
  p_until timestamptz,
  p_team uuid default null
) returns table (
  user_id uuid,
  full_name text,
  status text,
  updated_at timestamptz,
  is_online boolean,
  online_seconds bigint,
  meeting_seconds bigint,
  away_seconds bigint,
  total_seconds bigint,
  current_online_seconds bigint,
  team_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not (
    public.core_is_super_admin()
    or public.core_has_permission(p_workspace, 'reports.read')
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_workspace is null or p_since is null or p_until is null
     or p_until <= p_since or p_until - p_since > interval '366 days' then
    raise exception 'Invalid report range' using errcode = '22023';
  end if;

  return query
  with event_order as (
    select e.workspace_id, e.user_id, e.status, e.started_at, e.ended_at, e.id,
      lead(e.started_at) over (
        partition by e.workspace_id, e.user_id order by e.started_at, e.id
      ) as next_at
    from public.core_presence_events e
    where e.workspace_id = p_workspace
  ), intervals as (
    select e.user_id, e.status,
      greatest(e.started_at, p_since) as clipped_start,
      least(
        coalesce(e.ended_at, e.next_at, pg_catalog.now()),
        coalesce(e.next_at, pg_catalog.now()),
        p_until,
        pg_catalog.now()
      ) as clipped_end
    from event_order e
    where coalesce(e.ended_at, e.next_at, pg_catalog.now()) > p_since
      and e.started_at < p_until
  ), aggregate_usage as (
    select i.user_id,
      coalesce(sum(extract(epoch from i.clipped_end - i.clipped_start))
        filter (where i.status = 'online'), 0)::bigint as online_total,
      coalesce(sum(extract(epoch from i.clipped_end - i.clipped_start))
        filter (where i.status = 'meeting'), 0)::bigint as meeting_total,
      coalesce(sum(extract(epoch from i.clipped_end - i.clipped_start))
        filter (where i.status = 'away'), 0)::bigint as away_total
    from intervals i
    where i.clipped_end > i.clipped_start
    group by i.user_id
  ), latest_open_online as (
    select e.user_id, max(e.started_at) as started_at
    from event_order e
    where e.status = 'online' and e.ended_at is null and e.next_at is null
    group by e.user_id
  ), team_labels as (
    select gm.user_id,
      pg_catalog.string_agg(distinct g.name, ', ' order by g.name) as team_name
    from public.core_team_group_members gm
    join public.core_team_groups g
      on g.workspace_id = gm.workspace_id and g.id = gm.team_id
    where gm.workspace_id = p_workspace
      and (p_team is null or gm.team_id = p_team)
    group by gm.user_id
  )
  select m.user_id,
    coalesce(nullif(pg_catalog.btrim(up.full_name), ''), pg_catalog.split_part(au.email, '@', 1), 'Usuário')::text,
    case when p.updated_at >= pg_catalog.now() - interval '2 minutes'
      then p.status else 'offline' end::text,
    p.updated_at,
    coalesce(p.updated_at >= pg_catalog.now() - interval '2 minutes'
      and p.status <> 'offline', false),
    coalesce(a.online_total, 0),
    coalesce(a.meeting_total, 0),
    coalesce(a.away_total, 0),
    coalesce(a.online_total, 0) + coalesce(a.meeting_total, 0) + coalesce(a.away_total, 0),
    case when p.status = 'online'
      and p.updated_at >= pg_catalog.now() - interval '2 minutes'
      and lo.started_at is not null
      then greatest(0, extract(epoch from least(p_until, pg_catalog.now()) - greatest(lo.started_at, p_since)))::bigint
      else 0::bigint end,
    tl.team_name
  from public.core_memberships m
  left join public.core_user_profiles up on up.user_id = m.user_id
  left join auth.users au on au.id = m.user_id
  left join public.core_user_presence p
    on p.workspace_id = m.workspace_id and p.user_id = m.user_id
  left join aggregate_usage a on a.user_id = m.user_id
  left join latest_open_online lo on lo.user_id = m.user_id
  left join team_labels tl on tl.user_id = m.user_id
  where m.workspace_id = p_workspace and m.active
    and (p_team is null or exists (
      select 1 from public.core_team_group_members selected_team
      where selected_team.workspace_id = p_workspace
        and selected_team.team_id = p_team
        and selected_team.user_id = m.user_id
    ))
  order by coalesce(a.online_total, 0) desc, m.user_id;
end
$function$;

create or replace function public.core_presence_user_detail_v2(
  p_workspace uuid,
  p_user uuid,
  p_since timestamptz,
  p_until timestamptz,
  p_team uuid default null
) returns table (
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not (
    public.core_is_super_admin()
    or public.core_has_permission(p_workspace, 'reports.read')
    or (auth.uid() = p_user and public.core_has_access(p_workspace))
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_workspace is null or p_since is null or p_until is null
     or p_until <= p_since or p_until - p_since > interval '366 days' then
    raise exception 'Invalid report range' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.core_memberships m
    where m.workspace_id = p_workspace and m.user_id = p_user and m.active
  ) then
    raise exception 'User is not active in this workspace' using errcode = '22023';
  end if;
  if p_team is not null and not exists (
    select 1 from public.core_team_group_members gm
    where gm.workspace_id = p_workspace and gm.team_id = p_team and gm.user_id = p_user
  ) then
    raise exception 'User is not in the selected team' using errcode = '22023';
  end if;

  return query
  with event_order as (
    select e.status, e.started_at, e.ended_at, e.id,
      lead(e.started_at) over (order by e.started_at, e.id) as next_at
    from public.core_presence_events e
    where e.workspace_id = p_workspace and e.user_id = p_user
  ), intervals as (
    select e.status,
      greatest(e.started_at, p_since) as clipped_start,
      least(coalesce(e.ended_at, e.next_at, pg_catalog.now()),
        coalesce(e.next_at, pg_catalog.now()), p_until, pg_catalog.now()) as clipped_end
    from event_order e
    where coalesce(e.ended_at, e.next_at, pg_catalog.now()) > p_since
      and e.started_at < p_until
  )
  select i.status, i.clipped_start, i.clipped_end,
    greatest(0, extract(epoch from i.clipped_end - i.clipped_start))::bigint
  from intervals i
  where i.clipped_end > i.clipped_start
  order by i.clipped_start desc;
end
$function$;

create or replace function public.core_reports_loss_summary(
  p_workspace uuid,
  p_since timestamptz,
  p_until timestamptz
) returns table (
  reason text,
  deal_count bigint,
  lead_count bigint,
  total_value numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not (
    public.core_is_super_admin()
    or public.core_has_permission(p_workspace, 'reports.read')
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_workspace is null or p_since is null or p_until is null
     or p_until <= p_since or p_until - p_since > interval '366 days' then
    raise exception 'Invalid report range' using errcode = '22023';
  end if;

  return query
  select coalesce(nullif(pg_catalog.btrim(d.loss_reason), ''), 'Sem motivo informado')::text,
    count(*)::bigint,
    count(distinct d.contact_id)::bigint,
    coalesce(sum(d.value), 0)::numeric
  from public.core_deals d
  where d.workspace_id = p_workspace
    and d.status = 'lost'
    and d.lost_at >= p_since and d.lost_at < p_until
  group by coalesce(nullif(pg_catalog.btrim(d.loss_reason), ''), 'Sem motivo informado')
  order by count(*) desc, 1 asc;
end
$function$;

create or replace function public.core_reports_loss_user_reasons(
  p_workspace uuid,
  p_since timestamptz,
  p_until timestamptz
) returns table (
  user_id uuid,
  full_name text,
  reason text,
  deal_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not (
    public.core_is_super_admin()
    or public.core_has_permission(p_workspace, 'reports.read')
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_workspace is null or p_since is null or p_until is null
     or p_until <= p_since or p_until - p_since > interval '366 days' then
    raise exception 'Invalid report range' using errcode = '22023';
  end if;

  return query
  with names as (
    select n.user_id, n.full_name
    from public.core_member_display_names(p_workspace) n
  )
  select d.loss_marked_by,
    coalesce(n.full_name,
      case when d.loss_marked_by is null then 'Autor não registrado (histórico)'
        else 'Usuário sem acesso atual' end)::text,
    coalesce(nullif(pg_catalog.btrim(d.loss_reason), ''), 'Sem motivo informado')::text,
    count(*)::bigint
  from public.core_deals d
  left join names n on n.user_id = d.loss_marked_by
  where d.workspace_id = p_workspace
    and d.status = 'lost'
    and d.lost_at >= p_since and d.lost_at < p_until
  group by d.loss_marked_by, n.full_name,
    coalesce(nullif(pg_catalog.btrim(d.loss_reason), ''), 'Sem motivo informado')
  order by d.loss_marked_by nulls last, count(*) desc, 3 asc;
end
$function$;

create or replace function public.core_reports_lost_deals_page(
  p_workspace uuid,
  p_since timestamptz,
  p_until timestamptz,
  p_reason text,
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  deal_id uuid,
  contact_id uuid,
  lead_name text,
  contact_notes text,
  deal_name text,
  deal_notes text,
  loss_reason text,
  lost_at timestamptz,
  value numeric,
  loss_marked_by uuid,
  loss_marked_by_name text,
  request_status text,
  request_requested_at timestamptz,
  request_allowed boolean,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not (
    public.core_is_super_admin()
    or public.core_has_permission(p_workspace, 'reports.read')
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_workspace is null or p_since is null or p_until is null
     or p_until <= p_since or p_until - p_since > interval '366 days'
     or p_reason is null or pg_catalog.btrim(p_reason) = ''
     or p_limit < 1 or p_limit > 100 or p_offset < 0 or p_offset > 1000000 then
    raise exception 'Invalid report page' using errcode = '22023';
  end if;

  return query
  with names as (
    select n.user_id, n.full_name
    from public.core_member_display_names(p_workspace) n
  ), matching as (
    select d.id as deal_id, d.contact_id, c.name as lead_name, c.notes as contact_notes,
      d.name as deal_name, d.notes as deal_notes, d.loss_reason, d.lost_at, d.value,
      d.loss_marked_by, coalesce(n.full_name,
        case when d.loss_marked_by is null then 'Autor não registrado (histórico)'
          else 'Usuário sem acesso atual' end)::text as loss_marked_by_name,
      request_row.status as request_status,
      request_row.requested_at as request_requested_at,
      (
        nullif(pg_catalog.btrim(coalesce(d.loss_reason, '')), '') is null
        and d.loss_marked_by is not null
        and exists (
          select 1 from public.core_memberships recipient
          where recipient.workspace_id = p_workspace
            and recipient.user_id = d.loss_marked_by
            and recipient.active
        )
        and coalesce(request_row.status, '') <> 'pending'
      ) as request_allowed
    from public.core_deals d
    join public.core_contacts c
      on c.workspace_id = d.workspace_id and c.id = d.contact_id
    left join names n on n.user_id = d.loss_marked_by
    left join lateral (
      select r.status, r.requested_at
      from public.core_deal_loss_reason_requests r
      where r.workspace_id = d.workspace_id and r.deal_id = d.id
      order by r.requested_at desc, r.id desc
      limit 1
    ) request_row on true
    where d.workspace_id = p_workspace
      and d.status = 'lost'
      and d.lost_at >= p_since and d.lost_at < p_until
      and coalesce(nullif(pg_catalog.btrim(d.loss_reason), ''), 'Sem motivo informado') = p_reason
  )
  select m.deal_id, m.contact_id, m.lead_name, m.contact_notes, m.deal_name, m.deal_notes,
    m.loss_reason, m.lost_at, m.value, m.loss_marked_by, m.loss_marked_by_name,
    m.request_status, m.request_requested_at, m.request_allowed,
    count(*) over()::bigint
  from matching m
  order by m.lost_at desc, m.deal_id
  limit p_limit offset p_offset;
end
$function$;

create or replace function public.core_reports_task_analytics(
  p_workspace uuid,
  p_since timestamptz,
  p_until timestamptz
) returns table (
  metric_kind text,
  user_id uuid,
  full_name text,
  task_type text,
  task_count bigint,
  pending_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not (
    public.core_is_super_admin()
    or public.core_has_permission(p_workspace, 'reports.read')
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_workspace is null or p_since is null or p_until is null
     or p_until <= p_since or p_until - p_since > interval '366 days' then
    raise exception 'Invalid report range' using errcode = '22023';
  end if;

  return query
  with names as (
    select n.user_id, n.full_name
    from public.core_member_display_names(p_workspace) n
  ), assigned as (
    select t.assigned_to as actor_id,
      case when t.assigned_to is null then 'Não atribuído'
        else coalesce(n.full_name, 'Usuário sem acesso atual') end::text as actor_name,
      case when t.task_type in ('call', 'meeting', 'other') then t.task_type
        else 'unclassified' end::text as category,
      count(*)::bigint as task_count,
      count(*) filter (where t.status = 'todo')::bigint as pending_count
    from public.core_tasks t
    left join names n on n.user_id = t.assigned_to
    where t.workspace_id = p_workspace
      and coalesce(t.due_at, t.created_at) >= p_since
      and coalesce(t.due_at, t.created_at) < p_until
    group by t.assigned_to,
      case when t.assigned_to is null then 'Não atribuído'
        else coalesce(n.full_name, 'Usuário sem acesso atual') end,
      case when t.task_type in ('call', 'meeting', 'other') then t.task_type
        else 'unclassified' end
  ), completed as (
    select t.completed_by as actor_id,
      case when t.completed_by is null then 'Autor de conclusão não identificado'
        else coalesce(n.full_name, 'Usuário sem acesso atual') end::text as actor_name,
      case when t.task_type in ('call', 'meeting', 'other') then t.task_type
        else 'unclassified' end::text as category,
      count(*)::bigint as task_count
    from public.core_tasks t
    left join names n on n.user_id = t.completed_by
    where t.workspace_id = p_workspace
      and t.status = 'done'
      and t.completed_at >= p_since and t.completed_at < p_until
    group by t.completed_by,
      case when t.completed_by is null then 'Autor de conclusão não identificado'
        else coalesce(n.full_name, 'Usuário sem acesso atual') end,
      case when t.task_type in ('call', 'meeting', 'other') then t.task_type
        else 'unclassified' end
  )
  select 'assigned'::text, a.actor_id, a.actor_name, a.category, a.task_count, a.pending_count
  from assigned a
  union all
  select 'completed'::text, c.actor_id, c.actor_name, c.category, c.task_count, 0::bigint
  from completed c
  order by 1, 5 desc, 3;
end
$function$;

create or replace function public.core_reports_leads_by_origin(
  p_workspace uuid,
  p_since timestamptz,
  p_until timestamptz
) returns table (
  source text,
  lead_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not (
    public.core_is_super_admin()
    or public.core_has_permission(p_workspace, 'reports.read')
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_workspace is null or p_since is null or p_until is null
     or p_until <= p_since or p_until - p_since > interval '366 days' then
    raise exception 'Invalid report range' using errcode = '22023';
  end if;

  return query
  select coalesce(nullif(pg_catalog.btrim(c.source), ''), 'Sem origem informada')::text,
    count(*)::bigint
  from public.core_contacts c
  where c.workspace_id = p_workspace
    and c.created_at >= p_since and c.created_at < p_until
  group by coalesce(nullif(pg_catalog.btrim(c.source), ''), 'Sem origem informada')
  order by count(*) desc, 1 asc;
end
$function$;

create or replace function public.core_loss_reason_request(
  p_workspace uuid,
  p_deal_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deal record;
  v_request_id uuid;
  v_requested_at timestamptz;
begin
  if auth.uid() is null or not (
    public.core_is_super_admin()
    or public.core_has_permission(p_workspace, 'reports.read')
  ) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_workspace is null or p_deal_id is null then
    raise exception 'Invalid request' using errcode = '22023';
  end if;

  select d.name as deal_name, d.status, d.loss_reason, d.loss_marked_by,
    c.name as lead_name
  into v_deal
  from public.core_deals d
  join public.core_contacts c
    on c.workspace_id = d.workspace_id and c.id = d.contact_id
  where d.workspace_id = p_workspace and d.id = p_deal_id
  for update of d;

  if not found then
    raise exception 'Deal not found' using errcode = 'P0002';
  end if;
  if v_deal.status <> 'lost'
     or nullif(pg_catalog.btrim(coalesce(v_deal.loss_reason, '')), '') is not null then
    raise exception 'A solicitação exige uma negociação perdida sem motivo estruturado.' using errcode = '22023';
  end if;
  if v_deal.loss_marked_by is null or not exists (
    select 1 from public.core_memberships recipient
    where recipient.workspace_id = p_workspace
      and recipient.user_id = v_deal.loss_marked_by
      and recipient.active
  ) then
    return pg_catalog.jsonb_build_object('status', 'marker_unavailable');
  end if;

  select r.id, r.requested_at into v_request_id, v_requested_at
  from public.core_deal_loss_reason_requests r
  where r.workspace_id = p_workspace and r.deal_id = p_deal_id and r.status = 'pending'
  for update;
  if found then
    return pg_catalog.jsonb_build_object(
      'status', 'already_requested', 'requested_at', v_requested_at
    );
  end if;

  insert into public.core_deal_loss_reason_requests(
    workspace_id, deal_id, requested_by, recipient_id
  ) values (
    p_workspace, p_deal_id, auth.uid(), v_deal.loss_marked_by
  )
  on conflict (workspace_id, deal_id) where status = 'pending'
  do nothing
  returning id, requested_at into v_request_id, v_requested_at;

  if v_request_id is null then
    select r.id, r.requested_at into v_request_id, v_requested_at
    from public.core_deal_loss_reason_requests r
    where r.workspace_id = p_workspace and r.deal_id = p_deal_id and r.status = 'pending';
    return pg_catalog.jsonb_build_object(
      'status', 'already_requested', 'requested_at', v_requested_at
    );
  end if;

  insert into public.core_notifications(
    workspace_id, user_id, task_id, deal_id, kind, title, body
  ) values (
    p_workspace,
    v_deal.loss_marked_by,
    null,
    p_deal_id,
    'deal_loss_reason_request',
    'Motivo de perda solicitado',
    'Informe o motivo da perda da negociação "' || v_deal.deal_name
      || '" vinculada ao lead "' || v_deal.lead_name
      || '". Abra a negociação para preencher o motivo.'
  );

  return pg_catalog.jsonb_build_object(
    'status', 'sent',
    'deal_id', p_deal_id,
    'requested_at', v_requested_at
  );
end
$function$;

create index if not exists core_deals_loss_report_idx
  on public.core_deals(workspace_id, lost_at desc)
  where status = 'lost';
create index if not exists core_contacts_origin_report_idx
  on public.core_contacts(workspace_id, created_at, source);
create index if not exists core_tasks_due_report_idx
  on public.core_tasks(workspace_id, (coalesce(due_at, created_at)));
create index if not exists core_tasks_completed_report_idx
  on public.core_tasks(workspace_id, completed_at)
  where status = 'done';

revoke all on function public.core_presence_usage_report_v2(uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.core_presence_user_detail_v2(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.core_reports_loss_summary(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.core_reports_loss_user_reasons(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.core_reports_lost_deals_page(uuid, timestamptz, timestamptz, text, integer, integer) from public, anon;
revoke all on function public.core_reports_task_analytics(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.core_reports_leads_by_origin(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.core_loss_reason_request(uuid, uuid) from public, anon;
grant execute on function public.core_presence_usage_report_v2(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.core_presence_user_detail_v2(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.core_reports_loss_summary(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.core_reports_loss_user_reasons(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.core_reports_lost_deals_page(uuid, timestamptz, timestamptz, text, integer, integer) to authenticated;
grant execute on function public.core_reports_task_analytics(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.core_reports_leads_by_origin(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.core_loss_reason_request(uuid, uuid) to authenticated;

commit;
