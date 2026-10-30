-- Deterministic, tenant-scoped weighted CREATE_DEAL assignment.
begin;

create table if not exists public.core_automation_assignment_state (
  workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
  rule_revision_id uuid not null,
  node_id text not null check(length(node_id) between 1 and 90),
  sequence bigint not null default 0 check(sequence >= 0),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,rule_revision_id,node_id),
  foreign key(workspace_id,rule_revision_id) references public.core_automation_rule_revisions(workspace_id,id) on delete cascade
);
alter table public.core_automation_assignment_state enable row level security;
revoke all on public.core_automation_assignment_state from public,anon,authenticated;

create or replace function public.core_automation_node_config_v1_valid(p_type text,p_subtype text,c jsonb) returns boolean
language plpgsql immutable set search_path='' as $fn$
declare allowed text[]; k text; amount numeric; deal_value numeric; distribution_total numeric; distribution_count int; uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
 if jsonb_typeof(c)<>'object' or pg_catalog.octet_length(c::text)>8192 then return false; end if;
 allowed=case
  when p_type='trigger' then array['source','form_id','stage_id','loss_reason','days','timeframe','source_type','source_id']
  when p_subtype='CREATE_TASK' then array['title','delay','unit','business_hours','assignee','user_id']
  when p_subtype='CREATE_FOLLOWUP' then array['title','delay','unit','business_hours','assignee','user_id']
  when p_subtype='COMPLETE_TASKS' then array['only_automation'] when p_subtype='DISTRIBUTE_LEAD' then array['mode','team','members']
  when p_subtype='ADD_TO_SEGMENT_LIST' then array['list_id','reason'] when p_subtype='NOTIFY_USER' then array['title','body','user_id']
  when p_subtype='SEND_EMAIL' then array['subject','body','text','html','reply_to'] when p_subtype='SEND_WHATSAPP' then array['message','template_name','language','components']
  when p_subtype='WAIT' then array['delay','amount','unit'] when p_subtype='MOVE_STAGE' then array['stage_id'] when p_subtype='ADD_TAG' then array['tag_id','tag_name']
  when p_subtype='CREATE_DEAL' then array['owner_id','team_id','distribution','pipeline_id','stage_id','name','value']
  when p_subtype='SOURCE_EQUALS' then array['value','stage_id','days'] when p_subtype='CAMPAIGN_EQUALS' then array['value','stage_id','days']
  when p_subtype='STAGE_EQUALS' then array['value','stage_id','days'] else array[]::text[] end;
 for k in select pg_catalog.jsonb_object_keys(c) loop if not(k=any(allowed)) then return false; end if; end loop;
 if p_subtype='SEND_EMAIL' then return pg_catalog.length(c->>'subject') between 1 and 200 and (pg_catalog.length(c->>'body') between 1 and 10000 or pg_catalog.length(c->>'text') between 1 and 10000 or pg_catalog.length(c->>'html') between 1 and 20000);
 elsif p_subtype='SEND_WHATSAPP' then return pg_catalog.length(c->>'message') between 1 and 4000 or (pg_catalog.length(c->>'template_name') between 1 and 120 and pg_catalog.length(c->>'language') between 1 and 20 and (not(c?'components') or jsonb_typeof(c->'components')='array'));
 elsif p_subtype='WAIT' then begin amount=coalesce(c->>'amount',c->>'delay')::numeric; exception when others then return false; end; return amount between 1 and 365 and c->>'unit'=any(array['minutes','hours','days']);
 elsif p_subtype='MOVE_STAGE' then return coalesce(c->>'stage_id','')~*uuid_pattern;
 elsif p_subtype='ADD_TAG' then return coalesce(c->>'tag_id','')~*uuid_pattern or pg_catalog.length(c->>'tag_name') between 1 and 100;
 elsif p_subtype='CREATE_DEAL' then
  if (c?'owner_id')=(c?'team_id') or ((c?'pipeline_id')<>(c?'stage_id')) then return false; end if;
  if c?'owner_id' and c->>'owner_id'!~*uuid_pattern then return false; end if;
  if c?'team_id' then
   if c->>'team_id'!~*uuid_pattern or jsonb_typeof(c->'distribution')<>'array' then return false; end if;
   select count(*),coalesce(sum((x->>'percentage')::numeric),0) into distribution_count,distribution_total from pg_catalog.jsonb_array_elements(c->'distribution') x where (x->>'user_id')~*uuid_pattern and jsonb_typeof(x->'percentage')='number' and (x->>'percentage')::numeric>0;
   if distribution_count<>jsonb_array_length(c->'distribution') or distribution_count<1 or distribution_total<>100 then return false; end if;
  elsif c?'distribution' then return false; end if;
  if c?'pipeline_id' and (c->>'pipeline_id'!~*uuid_pattern or c->>'stage_id'!~*uuid_pattern) then return false; end if;
  if c?'name' and pg_catalog.length(c->>'name') not between 1 and 200 then return false; end if;
  if c?'value' then begin deal_value=(c->>'value')::numeric; exception when others then return false; end; if deal_value<0 or deal_value>99999999999999.99 then return false; end if; end if;
 end if;
 return true;
exception when others then return false;
end $fn$;

create or replace function public.core_automation_choose_deal_assignee(p_workspace uuid,p_revision_id uuid,p_node_id text,p_team_id uuid,p_distribution jsonb) returns uuid
language plpgsql security definer set search_path='' as $fn$
declare seq bigint; total int; slot int; chosen uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 if not exists(select 1 from public.core_automation_rule_revisions r where r.workspace_id=p_workspace and r.id=p_revision_id) then raise exception 'REVISION_NOT_FOUND'; end if;
 if not exists(select 1 from public.core_team_groups g where g.workspace_id=p_workspace and g.id=p_team_id) then raise exception 'TEAM_NOT_FOUND'; end if;
 if jsonb_typeof(p_distribution)<>'array' then raise exception 'INVALID_DISTRIBUTION'; end if;
 create temporary table if not exists pg_temp.eligible_assignment(user_id uuid primary key,weight int) on commit drop;
 truncate pg_temp.eligible_assignment;
 insert into pg_temp.eligible_assignment(user_id,weight)
 select (d->>'user_id')::uuid,(d->>'percentage')::int
 from pg_catalog.jsonb_array_elements(p_distribution) d
 join public.core_team_group_members gm on gm.workspace_id=p_workspace and gm.team_id=p_team_id and gm.user_id=(d->>'user_id')::uuid
 join public.core_memberships m on m.workspace_id=p_workspace and m.user_id=gm.user_id and m.active
 where (d->>'percentage')::int>0;
 select coalesce(sum(weight),0) into total from pg_temp.eligible_assignment;
 if total<=0 then raise exception 'NO_ELIGIBLE_ASSIGNEE'; end if;
 insert into public.core_automation_assignment_state(workspace_id,rule_revision_id,node_id,sequence) values(p_workspace,p_revision_id,p_node_id,0)
 on conflict(workspace_id,rule_revision_id,node_id) do nothing;
 select sequence into seq from public.core_automation_assignment_state where workspace_id=p_workspace and rule_revision_id=p_revision_id and node_id=p_node_id for update;
 slot=(seq%total)::int;
 select user_id into chosen from (select user_id,weight,coalesce(sum(weight) over(order by user_id rows between unbounded preceding and 1 preceding),0) start_at from pg_temp.eligible_assignment) q where slot>=start_at and slot<start_at+weight order by user_id limit 1;
 update public.core_automation_assignment_state set sequence=sequence+1,updated_at=now() where workspace_id=p_workspace and rule_revision_id=p_revision_id and node_id=p_node_id;
 if chosen is null then raise exception 'NO_ELIGIBLE_ASSIGNEE'; end if;
 return chosen;
end $fn$;
revoke all on function public.core_automation_choose_deal_assignee(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.core_automation_choose_deal_assignee(uuid,uuid,text,uuid,jsonb) to service_role;
commit;
